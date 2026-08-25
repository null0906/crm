import {
  boolean,
  check,
  date,
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { companies } from './companies';
import { deals } from './deals';
import { deliveryRoles, gnrPolicies } from './cost-model';
import { users } from './users';
import type {
  BaselineConfidence,
  CostLineBasis,
  CostingMode,
  EstimateCostLineKind,
  EstimateStatus,
  GnrBasis,
  SizingAppliesTo,
  SizingComposition,
  SizingValueType,
} from '@/lib/types';

/* ------------------------------------------------------------------ catalog */

/**
 * Effort baselines (FR-P4-01 to FR-P4-04).
 *
 * What a service line normally takes, expressed as a team shape over weeks.
 * Versioned rather than edited so an estimate built six months ago still
 * resolves the baseline it was actually built from (NFR-REP-01).
 */
export const effortBaselines = pgTable(
  'effort_baselines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    serviceLine: varchar('service_line', { length: 50 }).notNull(),
    // NOT NULL with a default so the unique index below behaves. A nullable
    // segment would let Postgres treat two 'standard' rows as distinct.
    segment: varchar('segment', { length: 50 }).notNull().default('standard'),
    name: varchar('name', { length: 150 }).notNull(),
    version: integer('version').notNull().default(1),
    confidence: varchar('confidence', { length: 10 })
      .$type<BaselineConfidence>()
      .notNull()
      .default('low'),
    sampleSize: integer('sample_size').notNull().default(0),
    observedSpreadPercent: decimal('observed_spread_percent', { precision: 5, scale: 2 }),
    // FR-P4-02: until delivered effort is captured, a baseline is somebody's
    // judgement and should say so on its face rather than implying evidence.
    isJudgementBased: boolean('is_judgement_based').notNull().default(true),
    isActive: boolean('is_active').notNull().default(true),
    notes: text('notes'),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('uq_baseline_service_segment_version').on(t.serviceLine, t.segment, t.version),
    index('idx_baselines_service').on(t.serviceLine, t.isActive),
    check('baseline_confidence_check', sql`${t.confidence} IN ('low', 'medium', 'high')`),
    check('baseline_sample_check', sql`${t.sampleSize} >= 0`),
  ]
);

/** One role's presence on a baseline: how many people, for how many weeks. */
export const effortBaselineLines = pgTable(
  'effort_baseline_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    baselineId: uuid('baseline_id')
      .notNull()
      .references(() => effortBaselines.id, { onDelete: 'cascade' }),
    deliveryRoleId: uuid('delivery_role_id')
      .notNull()
      .references(() => deliveryRoles.id, { onDelete: 'restrict' }),
    deliveryStage: varchar('delivery_stage', { length: 40 }),
    resourceCount: integer('resource_count').notNull().default(1),
    weeks: decimal('weeks', { precision: 6, scale: 2 }).notNull(),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    index('idx_baseline_lines_baseline').on(t.baselineId),
    check('baseline_line_count_check', sql`${t.resourceCount} > 0`),
    check('baseline_line_weeks_check', sql`${t.weeks} > 0`),
  ]
);

/* ------------------------------------------------------------------- sizing */

/**
 * The drivers that genuinely change effort (FR-P4-08).
 *
 * `appliesTo` matters commercially: three cloud environments might add weeks to
 * the schedule or add an analyst to the team, and those cost differently.
 */
export const sizingDrivers = pgTable(
  'sizing_drivers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: varchar('slug', { length: 60 }).notNull().unique(),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description'),
    valueType: varchar('value_type', { length: 20 }).$type<SizingValueType>().notNull(),
    appliesTo: varchar('applies_to', { length: 20 })
      .$type<SizingAppliesTo>()
      .notNull()
      .default('weeks'),
    /** For numeric drivers: multiplier added per unit above `unitBaseline`. */
    multiplierPerUnit: decimal('multiplier_per_unit', { precision: 6, scale: 4 }),
    unitBaseline: integer('unit_baseline').notNull().default(0),
    position: integer('position').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_sizing_drivers_active').on(t.isActive, t.position),
    check('sizing_driver_value_type_check', sql`${t.valueType} IN ('select', 'number')`),
    check('sizing_driver_applies_to_check', sql`${t.appliesTo} IN ('weeks', 'team', 'both')`),
  ]
);

/** Selectable answers for a `select` driver, each with its weight. */
export const sizingDriverOptions = pgTable(
  'sizing_driver_options',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    driverId: uuid('driver_id')
      .notNull()
      .references(() => sizingDrivers.id, { onDelete: 'cascade' }),
    label: varchar('label', { length: 120 }).notNull(),
    value: varchar('value', { length: 60 }).notNull(),
    multiplier: decimal('multiplier', { precision: 6, scale: 4 }).notNull().default('1.0'),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    unique('uq_driver_option_value').on(t.driverId, t.value),
    index('idx_driver_options_driver').on(t.driverId),
    check('driver_option_multiplier_check', sql`${t.multiplier} > 0`),
  ]
);

/**
 * Target margins and floors (FR-P4-28, FR-P4-32).
 *
 * Margin is guidance, not the price: cost sets the floor and the market sets
 * the number. The target pre-fills an estimate so quotes are consistent; the
 * floor produces a loud warning when a price drops below it. Nothing here
 * blocks approval — that would need an approval trail, which does not exist.
 *
 * `serviceLine` uses the sentinel '*' for the company-wide default rather than
 * NULL, so the partial unique index below is straightforward. Postgres treats
 * NULLs as distinct, which would let two company-wide rows through.
 */
export const marginTargets = pgTable(
  'margin_targets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** A service line slug, or '*' for the company-wide default. */
    serviceLine: varchar('service_line', { length: 50 }).notNull().default('*'),
    segment: varchar('segment', { length: 50 }).notNull().default('standard'),
    targetMarginPercent: decimal('target_margin_percent', { precision: 5, scale: 2 }).notNull(),
    /** Below this, the builder warns. Optional: no floor means no warning. */
    floorMarginPercent: decimal('floor_margin_percent', { precision: 5, scale: 2 }),
    effectiveFrom: date('effective_from').notNull(),
    effectiveTo: date('effective_to'),
    notes: text('notes'),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_margin_targets_lookup').on(t.serviceLine, t.segment, t.effectiveFrom),
    check(
      'margin_target_percent_check',
      sql`${t.targetMarginPercent} >= 0 AND ${t.targetMarginPercent} <= 100`
    ),
    check(
      'margin_floor_percent_check',
      sql`${t.floorMarginPercent} IS NULL OR (${t.floorMarginPercent} >= 0 AND ${t.floorMarginPercent} <= 100)`
    ),
    // A floor above the target would warn on every compliant price.
    check(
      'margin_floor_below_target_check',
      sql`${t.floorMarginPercent} IS NULL OR ${t.floorMarginPercent} <= ${t.targetMarginPercent}`
    ),
    check(
      'margin_target_range_check',
      sql`${t.effectiveTo} IS NULL OR ${t.effectiveTo} >= ${t.effectiveFrom}`
    ),
    // One standing target per scope, or resolution is non-deterministic.
    uniqueIndex('uq_margin_target_open')
      .on(t.serviceLine, t.segment)
      .where(sql`${t.effectiveTo} IS NULL`),
  ]
);

/**
 * The composition guardrail (FR-P4-10). Versioned like the GNR policy so a
 * historic estimate can be reproduced under the rules that applied to it.
 */
export const sizingPolicies = pgTable(
  'sizing_policies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 100 }).notNull(),
    version: integer('version').notNull().default(1),
    /** Composed multipliers are capped here, and the cap is reported, not hidden. */
    maxMultiplier: decimal('max_multiplier', { precision: 5, scale: 2 }).notNull().default('2.50'),
    composition: varchar('composition', { length: 20 })
      .$type<SizingComposition>()
      .notNull()
      .default('multiplicative'),
    effectiveFrom: date('effective_from').notNull(),
    effectiveTo: date('effective_to'),
    notes: text('notes'),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('uq_sizing_policy_name_version').on(t.name, t.version),
    index('idx_sizing_policy_effective').on(t.effectiveFrom),
    check('sizing_policy_composition_check', sql`${t.composition} IN ('multiplicative', 'additive')`),
    check('sizing_policy_max_check', sql`${t.maxMultiplier} >= 1`),
  ]
);

/* ---------------------------------------------------------------- estimates */

/**
 * A costed engagement (FR-P4-47).
 *
 * Provenance columns are frozen onto the row so the estimate reproduces even
 * after rates, baselines and policies move on. Once approved the row is
 * immutable — enforced in estimate.service.ts, not left to the UI.
 */
export const estimates = pgTable(
  'estimates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dealId: uuid('deal_id').references(() => deals.id, { onDelete: 'set null' }),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    title: varchar('title', { length: 200 }).notNull(),
    serviceLine: varchar('service_line', { length: 50 }),
    status: varchar('status', { length: 20 }).$type<EstimateStatus>().notNull().default('draft'),
    supersedesId: uuid('supersedes_id').references((): AnyPgColumn => estimates.id, {
      onDelete: 'set null',
    }),

    // --- frozen provenance ---
    baselineId: uuid('baseline_id').references(() => effortBaselines.id, { onDelete: 'set null' }),
    baselineVersion: integer('baseline_version'),
    sizingPolicyId: uuid('sizing_policy_id').references(() => sizingPolicies.id, {
      onDelete: 'set null',
    }),
    gnrPolicyId: uuid('gnr_policy_id').references(() => gnrPolicies.id, { onDelete: 'set null' }),
    gnrRatePercent: decimal('gnr_rate_percent', { precision: 5, scale: 2 }),
    gnrAppliesTo: varchar('gnr_applies_to', { length: 20 }).$type<GnrBasis>(),
    /** The date effective-dated rates resolve against. */
    asOfDate: date('as_of_date').notNull(),
    costingMode: varchar('costing_mode', { length: 20 })
      .$type<CostingMode>()
      .notNull()
      .default('blended'),
    currency: varchar('currency', { length: 3 }).notNull().default('INR'),

    // --- computed ---
    sizeMultiplier: decimal('size_multiplier', { precision: 6, scale: 4 }).notNull().default('1.0'),
    labourSubtotal: decimal('labour_subtotal', { precision: 15, scale: 2 }),
    nonLabourPassThrough: decimal('non_labour_pass_through', { precision: 15, scale: 2 }),
    nonLabourMarkedUp: decimal('non_labour_marked_up', { precision: 15, scale: 2 }),
    customTotal: decimal('custom_total', { precision: 15, scale: 2 }),
    subtotalBeforeGnr: decimal('subtotal_before_gnr', { precision: 15, scale: 2 }),
    gnrAmount: decimal('gnr_amount', { precision: 15, scale: 2 }),
    totalDeliveryCost: decimal('total_delivery_cost', { precision: 15, scale: 2 }),

    // --- commercial. Margin is guidance; the price is set against the market ---
    price: decimal('price', { precision: 15, scale: 2 }),
    targetMarginPercent: decimal('target_margin_percent', { precision: 5, scale: 2 }),
    marginPercent: decimal('margin_percent', { precision: 5, scale: 2 }),

    // --- freeze ---
    /** The full CostBreakdown as computed at approval. The immutable record. */
    snapshot: jsonb('snapshot'),
    frozenAt: timestamp('frozen_at', { withTimezone: true }),
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),

    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_estimates_deal').on(t.dealId),
    index('idx_estimates_company').on(t.companyId),
    index('idx_estimates_status').on(t.status),
    index('idx_estimates_owner').on(t.ownerId),
    check(
      'estimate_status_check',
      sql`${t.status} IN ('draft', 'approved', 'superseded', 'archived')`
    ),
    check('estimate_costing_mode_check', sql`${t.costingMode} IN ('blended', 'named')`),
    check('estimate_multiplier_check', sql`${t.sizeMultiplier} > 0`),
    // An approved estimate must carry the evidence of its approval. Guards
    // against a status flip that skips the freeze.
    check(
      'estimate_approved_is_frozen_check',
      sql`${t.status} <> 'approved' OR (${t.frozenAt} IS NOT NULL AND ${t.snapshot} IS NOT NULL)`
    ),
  ]
);

/** The team shape on this estimate: role, headcount, weeks, optional person. */
export const estimateTeamLines = pgTable(
  'estimate_team_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    estimateId: uuid('estimate_id')
      .notNull()
      .references(() => estimates.id, { onDelete: 'cascade' }),
    deliveryRoleId: uuid('delivery_role_id')
      .notNull()
      .references(() => deliveryRoles.id, { onDelete: 'restrict' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    deliveryStage: varchar('delivery_stage', { length: 40 }),
    resourceCount: integer('resource_count').notNull().default(1),
    weeks: decimal('weeks', { precision: 6, scale: 2 }).notNull(),
    // Per-component overrides (FR-P4-55). Null means "use the resolved rate".
    overrideBase: decimal('override_base', { precision: 15, scale: 2 }),
    overrideSeat: decimal('override_seat', { precision: 15, scale: 2 }),
    overrideSupport: decimal('override_support', { precision: 15, scale: 2 }),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    index('idx_estimate_team_estimate').on(t.estimateId),
    check('estimate_team_count_check', sql`${t.resourceCount} > 0`),
    check('estimate_team_weeks_check', sql`${t.weeks} > 0`),
  ]
);

/**
 * Non-labour lines and estimator-defined custom variables in one table
 * (FR-P4-16, FR-P4-56) — they differ only in provenance and treatment.
 */
export const estimateCostLines = pgTable(
  'estimate_cost_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    estimateId: uuid('estimate_id')
      .notNull()
      .references(() => estimates.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 20 }).$type<EstimateCostLineKind>().notNull(),
    label: varchar('label', { length: 150 }).notNull(),
    amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
    basis: varchar('basis', { length: 30 })
      .$type<CostLineBasis>()
      .notNull()
      .default('engagement'),
    /** Pass-through is quoted at cost and never marked up. */
    passThrough: boolean('pass_through').notNull().default(false),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    index('idx_estimate_cost_lines_estimate').on(t.estimateId),
    check('estimate_cost_line_kind_check', sql`${t.kind} IN ('non_labour', 'custom')`),
    check(
      'estimate_cost_line_basis_check',
      sql`${t.basis} IN ('engagement', 'per_resource_week')`
    ),
  ]
);

/**
 * Which sizing drivers were applied, and on whose word (FR-P4-11).
 *
 * The source and confidence are the point: an estimate that turns out wrong
 * should be traceable to who supplied the answer and how sure they were.
 */
export const estimateDrivers = pgTable(
  'estimate_drivers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    estimateId: uuid('estimate_id')
      .notNull()
      .references(() => estimates.id, { onDelete: 'cascade' }),
    driverId: uuid('driver_id')
      .notNull()
      .references(() => sizingDrivers.id, { onDelete: 'restrict' }),
    optionId: uuid('option_id').references(() => sizingDriverOptions.id, { onDelete: 'set null' }),
    numericValue: decimal('numeric_value', { precision: 10, scale: 2 }),
    multiplierApplied: decimal('multiplier_applied', { precision: 6, scale: 4 }).notNull(),
    source: varchar('source', { length: 60 }),
    answerConfidence: varchar('answer_confidence', { length: 10 }).$type<BaselineConfidence>(),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    unique('uq_estimate_driver').on(t.estimateId, t.driverId),
    index('idx_estimate_drivers_estimate').on(t.estimateId),
    check(
      'estimate_driver_confidence_check',
      sql`${t.answerConfidence} IS NULL OR ${t.answerConfidence} IN ('low', 'medium', 'high')`
    ),
    check('estimate_driver_multiplier_check', sql`${t.multiplierApplied} > 0`),
  ]
);

export type EffortBaseline = typeof effortBaselines.$inferSelect;
export type NewEffortBaseline = typeof effortBaselines.$inferInsert;
export type EffortBaselineLine = typeof effortBaselineLines.$inferSelect;
export type SizingDriver = typeof sizingDrivers.$inferSelect;
export type SizingDriverOption = typeof sizingDriverOptions.$inferSelect;
export type SizingPolicy = typeof sizingPolicies.$inferSelect;
export type Estimate = typeof estimates.$inferSelect;
export type NewEstimate = typeof estimates.$inferInsert;
export type EstimateTeamLine = typeof estimateTeamLines.$inferSelect;
export type EstimateCostLine = typeof estimateCostLines.$inferSelect;
export type EstimateDriver = typeof estimateDrivers.$inferSelect;
export type MarginTarget = typeof marginTargets.$inferSelect;
export type NewMarginTarget = typeof marginTargets.$inferInsert;

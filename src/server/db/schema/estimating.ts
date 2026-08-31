import {
  boolean,
  check,
  date,
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
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
  TeamSizingMode,
} from '@/lib/types';

/* ------------------------------------------------------------------ catalog */

/**
 * Effort baselines (FR-P4-01 to FR-P4-04).
 *
 * What a standard engagement of a service line looks like. Versioned rather
 * than edited so an estimate built six months ago still resolves the baseline
 * it was actually built from (NFR-REP-01).
 *
 * A baseline no longer sizes anything. It used to be expanded by the scoping
 * multiplier into a full team with hours already decided, which left the
 * estimator correcting numbers the machine had invented. It now carries two
 * facts and neither is arithmetic: which roles a standard engagement needs
 * (`effortBaselineLines`, seeded onto an estimate without hours), and what one
 * ought to cost (`idealCost`, shown beside the engine's figure as a benchmark).
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
    /**
     * What a standard (x1) engagement of this service ought to cost.
     *
     * Nullable, because a baseline written before benchmarking existed has no
     * honest answer and a zero would read as free. The builder multiplies it by
     * the scoping multiplier and shows the result beside what the cost engine
     * computed, so a team and hours that disagree with the shape of the work
     * are visible. It never sets a price — the engine still does that.
     */
    idealCost: decimal('ideal_cost', { precision: 15, scale: 2 }),
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
    check('baseline_ideal_cost_check', sql`${t.idealCost} IS NULL OR ${t.idealCost} >= 0`),
  ]
);

/**
 * One role's presence on a baseline: how many people, and typically for how
 * long.
 *
 * `hours` is reference data — what a standard engagement has historically
 * taken. Nothing multiplies it and nothing copies it onto an estimate: seeding
 * puts the role and its headcount on the sheet and leaves the hours blank for
 * whoever is actually scoping the engagement to decide.
 */
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
    // Wider than weeks was: the router permits the equivalent of 520 weeks,
    // which is 20,800 hours and overflows numeric(6,2).
    hours: decimal('hours', { precision: 8, scale: 2 }).notNull(),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    index('idx_baseline_lines_baseline').on(t.baselineId),
    check('baseline_line_count_check', sql`${t.resourceCount} > 0`),
    check('baseline_line_hours_check', sql`${t.hours} > 0`),
  ]
);

/* ------------------------------------------------------------------- sizing */

/**
 * The drivers that genuinely change effort (FR-P4-08).
 *
 * A driver is a scoping question whose answer says how much bigger or smaller
 * than standard this engagement is. Which service lines a driver is asked on is
 * `sizingDriverServiceLines`; a driver with no rows there is asked on all of
 * them.
 */
export const sizingDrivers = pgTable(
  'sizing_drivers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: varchar('slug', { length: 60 }).notNull().unique(),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description'),
    valueType: varchar('value_type', { length: 20 }).$type<SizingValueType>().notNull(),
    /**
     * Superseded. Sizing used to compose two axes — hours per person and
     * headcount — and expand a baseline team from them. People are now assigned
     * by hand, so a driver contributes to one number and nothing reads this.
     * Kept because existing rows carry a value.
     */
    appliesTo: varchar('applies_to', { length: 20 })
      .$type<SizingAppliesTo>()
      .notNull()
      .default('hours'),
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
    check('sizing_driver_applies_to_check', sql`${t.appliesTo} IN ('hours', 'team', 'both')`),
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
 * Which service lines a scoping question is asked on.
 *
 * A driver with **no rows here is global** and asked on every service line.
 * That is the absence-means-everything convention on purpose: it is what makes
 * this table additive. Every driver that existed before it was introduced has
 * no rows and therefore keeps behaving exactly as it did.
 *
 * `serviceLine` carries no foreign key to `service_lines`, matching every other
 * service-line column in the schema — see the note on that table.
 */
export const sizingDriverServiceLines = pgTable(
  'sizing_driver_service_lines',
  {
    driverId: uuid('driver_id')
      .notNull()
      .references(() => sizingDrivers.id, { onDelete: 'cascade' }),
    serviceLine: varchar('service_line', { length: 50 }).notNull(),
  },
  (t) => [
    primaryKey({ name: 'pk_driver_service_line', columns: [t.driverId, t.serviceLine] }),
    index('idx_driver_service_lines_service').on(t.serviceLine),
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
    /**
     * Per-estimate GNR, set on the estimate rather than in the policy.
     *
     * `gnrRateOverride` null means "use whatever policy is effective". An
     * override changes the rate, not what it is charged on — the policy still
     * decides whether it lands on the total or on labour alone.
     *
     * `gnrExcluded` is deliberately a separate flag rather than an override of
     * 0: a rate of zero because someone chose to exclude it and a rate of zero
     * because no policy exists are different facts, and only one of them is a
     * decision.
     */
    gnrRateOverride: decimal('gnr_rate_override', { precision: 5, scale: 2 }),
    gnrExcluded: boolean('gnr_excluded').notNull().default(false),
    /** The date effective-dated rates resolve against. */
    asOfDate: date('as_of_date').notNull(),
    /**
     * Superseded by per-line naming: whether a resource is costed against a
     * named person or a role average is now decided by whether that line names
     * anyone. Kept because existing rows carry a value; nothing reads it.
     */
    costingMode: varchar('costing_mode', { length: 20 })
      .$type<CostingMode>()
      .notNull()
      .default('blended'),
    /**
     * Superseded along with baseline expansion. Sizing no longer shapes a team
     * at all, so there is nothing left to choose between growing one and
     * loading the existing one. Kept because existing rows carry a value;
     * nothing reads it.
     */
    teamSizingMode: varchar('team_sizing_mode', { length: 20 })
      .$type<TeamSizingMode>()
      .notNull()
      .default('fixed'),
    currency: varchar('currency', { length: 3 }).notNull().default('INR'),

    /**
     * The engagement as the estimator commits to it (not as anything derives
     * it).
     *
     * `engagementWeeks` is the window the client asked for and
     * `engagementHours` the effort judged necessary to fill it. Both are typed
     * by hand and nothing pre-fills them: scoping says how big the work is
     * relative to standard, which is not the same as knowing how many hours
     * anyone will commit. They are nullable because an estimate is legitimately
     * incomplete until somebody decides.
     *
     * Neither constrains the team lines. The builder reports the gap between
     * these and what is actually assigned, and leaves the judgement where it
     * belongs.
     */
    engagementWeeks: decimal('engagement_weeks', { precision: 6, scale: 2 }),
    engagementHours: decimal('engagement_hours', { precision: 10, scale: 2 }),

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
    // Wider than a percentage looks like it needs, because margin on price is
    // unbounded below: as price falls toward zero, (price - cost) / price goes
    // to negative infinity. A quote at a tenth of cost is already past 999.99.
    // Under-pricing is the case this column exists to record, so it must not be
    // the case that overflows. persistTotals clamps to this range.
    marginPercent: decimal('margin_percent', { precision: 9, scale: 2 }),

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
    check('estimate_team_sizing_mode_check', sql`${t.teamSizingMode} IN ('fixed', 'grow')`),
    check('estimate_multiplier_check', sql`${t.sizeMultiplier} > 0`),
    check(
      'estimate_engagement_weeks_check',
      sql`${t.engagementWeeks} IS NULL OR ${t.engagementWeeks} > 0`
    ),
    check(
      'estimate_engagement_hours_check',
      sql`${t.engagementHours} IS NULL OR ${t.engagementHours} > 0`
    ),
    check(
      'estimate_gnr_override_check',
      sql`${t.gnrRateOverride} IS NULL OR (${t.gnrRateOverride} >= 0 AND ${t.gnrRateOverride} <= 100)`
    ),
    // An approved estimate must carry the evidence of its approval. Guards
    // against a status flip that skips the freeze.
    check(
      'estimate_approved_is_frozen_check',
      sql`${t.status} <> 'approved' OR (${t.frozenAt} IS NOT NULL AND ${t.snapshot} IS NOT NULL)`
    ),
  ]
);

/**
 * The team shape on this estimate: role, headcount, hours, optional person.
 *
 * `hours` is nullable because a role can be on the sheet before anyone has
 * decided how long it needs. Seeding the roles a baseline suggests is exactly
 * that case, and writing a placeholder number instead would be the machine
 * inventing an answer — which is the thing this design removed. A null-hours
 * line costs nothing and the engine warns that it is unfinished.
 */
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
    hours: decimal('hours', { precision: 8, scale: 2 }),
    // Per-component hourly overrides (FR-P4-55). Null means "use the resolved
    // rate". There is no support override any more — support is a cost line.
    overrideBase: decimal('override_base', { precision: 15, scale: 4 }),
    overrideSeat: decimal('override_seat', { precision: 15, scale: 4 }),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    index('idx_estimate_team_estimate').on(t.estimateId),
    check('estimate_team_count_check', sql`${t.resourceCount} > 0`),
    check('estimate_team_hours_check', sql`${t.hours} IS NULL OR ${t.hours} > 0`),
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
      sql`${t.basis} IN ('engagement', 'per_resource_hour')`
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
    // This is one driver's raw contribution, before the composition ceiling —
    // the ceiling caps the composed total, not the parts. A numeric driver
    // computes 1 + perUnit x units, which at the permitted bounds (perUnit 10,
    // units 1,000,000) reaches ~10 million. Even a mundane +5%/unit driver
    // passes 99.9999 at an answer of 1,981.
    multiplierApplied: decimal('multiplier_applied', { precision: 12, scale: 4 }).notNull(),
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
export type SizingDriverServiceLine = typeof sizingDriverServiceLines.$inferSelect;
export type SizingPolicy = typeof sizingPolicies.$inferSelect;
export type Estimate = typeof estimates.$inferSelect;
export type NewEstimate = typeof estimates.$inferInsert;
export type EstimateTeamLine = typeof estimateTeamLines.$inferSelect;
export type EstimateCostLine = typeof estimateCostLines.$inferSelect;
export type EstimateDriver = typeof estimateDrivers.$inferSelect;
export type MarginTarget = typeof marginTargets.$inferSelect;
export type NewMarginTarget = typeof marginTargets.$inferInsert;

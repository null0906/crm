import {
  boolean,
  check,
  date,
  decimal,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';
import type { CostComponent, CostScope, GnrBasis, SupportBasis } from '@/lib/types';

/**
 * Delivery roles (FR-P4-54).
 *
 * Deliberately separate from `roles`, which governs CRM permissions. A person's
 * delivery role — lead consultant, security analyst — is what the cost engine
 * prices from, and has nothing to do with what they may do in the CRM.
 */
export const deliveryRoles = pgTable(
  'delivery_roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 100 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    description: text('description'),
    position: integer('position').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_delivery_roles_active').on(t.isActive)]
);

/**
 * A person's default delivery role. Kept out of `users` so the cost model owns
 * its own assignment and the two schema files stay acyclic.
 */
export const userDeliveryRoles = pgTable('user_delivery_roles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  deliveryRoleId: uuid('delivery_role_id')
    .notNull()
    .references(() => deliveryRoles.id, { onDelete: 'restrict' }),
  assignedBy: uuid('assigned_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Per-resource hourly cost components (FR-P4-14).
 *
 * Two components remain, and both now belong to a person:
 *
 *   base — what the person is paid.
 *   seat — desk, laptop, licences, insurance.
 *
 * Base used to resolve most-specific-wins across employee > role > default, so
 * an estimate could be costed before the team was decided. It no longer does:
 * a role rate is an average, and an estimate built on one is only accidentally
 * right about whoever actually turns up. A line naming nobody now carries no
 * base cost, and the engine says so rather than reporting the average.
 *
 * Support is no longer here. It became an ordinary cost line on the estimate.
 *
 * Amounts are per hour at scale 4: an hourly figure derived from an annual or
 * weekly salary rarely lands on a whole rupee, and rounding it away would drift
 * across thousands of hours.
 *
 * Every row is effective-dated so a historic estimate resolves the value that
 * applied on its own date (NFR-REP-01).
 *
 * SECURITY: salary-derived. Never leaves the server without passing through
 * `financial-access.ts`. See NFR-SEC-04 and NFR-SEC-07.
 */
export const resourceCostComponents = pgTable(
  'resource_cost_components',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * Every new row is 'employee' — both components are now employee-only, and
     * the two CHECKs below enforce it. The column stays because history varies:
     * the role and company-default base rates that were closed when pricing
     * moved to people are still here, and still resolve for an estimate dated
     * before that happened.
     */
    scope: varchar('scope', { length: 20 }).$type<CostScope>().notNull(),
    deliveryRoleId: uuid('delivery_role_id').references(() => deliveryRoles.id, {
      onDelete: 'cascade',
    }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    component: varchar('component', { length: 20 }).$type<CostComponent>().notNull(),
    amountPerHour: decimal('amount_per_hour', { precision: 15, scale: 4 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('INR'),
    effectiveFrom: date('effective_from').notNull(),
    effectiveTo: date('effective_to'),
    notes: text('notes'),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_cost_components_lookup').on(t.component, t.scope, t.effectiveFrom),
    index('idx_cost_components_role').on(t.deliveryRoleId),
    index('idx_cost_components_user').on(t.userId),
    // NFR-DQ-01: constrained value sets are enforced by the database, not only
    // by the TypeScript union. Most of this schema does not do this; new cost
    // tables must not repeat that.
    check('cost_components_scope_check', sql`${t.scope} IN ('default', 'role', 'employee')`),
    check('cost_components_component_check', sql`${t.component} IN ('base', 'seat')`),
    // Seat is a property of employing a specific person, so a role-wide or
    // company-wide seat rate is meaningless. Enforced here rather than only in
    // the router, because the router is not the only way rows arrive.
    check(
      'cost_components_seat_is_employee_check',
      sql`${t.component} <> 'seat' OR ${t.scope} = 'employee'`
    ),
    // Base is what a particular person is paid, so a role average is not a
    // weaker version of it — it is a different claim. Added NOT VALID in
    // migration 0033: the closed role and default rows violate this and have to
    // survive it, because historic estimates still resolve against them.
    check(
      'cost_components_base_is_employee_check',
      sql`${t.component} <> 'base' OR ${t.scope} = 'employee'`
    ),
    check('cost_components_amount_check', sql`${t.amountPerHour} >= 0`),
    // Minus one day, so a rate can be closed before it began. That expresses
    // "superseded before it ever took effect", which is a real state: setting
    // a rate and correcting it the same day closes the first one at yesterday.
    // Such a row resolves on no date at all, since effective_from <= as_of and
    // effective_to >= as_of cannot both hold.
    check(
      'cost_components_range_check',
      sql`${t.effectiveTo} IS NULL OR ${t.effectiveTo} >= ${t.effectiveFrom} - 1`
    ),
    // Each scope shape must have at most one open-ended row, or rate
    // resolution becomes non-deterministic. Split by scope so Postgres's
    // distinct-NULL behaviour cannot let duplicates through.
    uniqueIndex('uq_cost_component_open_default')
      .on(t.component)
      .where(sql`${t.effectiveTo} IS NULL AND ${t.scope} = 'default'`),
    uniqueIndex('uq_cost_component_open_role')
      .on(t.component, t.deliveryRoleId)
      .where(sql`${t.effectiveTo} IS NULL AND ${t.scope} = 'role'`),
    uniqueIndex('uq_cost_component_open_employee')
      .on(t.component, t.userId)
      .where(sql`${t.effectiveTo} IS NULL AND ${t.scope} = 'employee'`),
  ]
);

/**
 * GNR — gross non-recoverable (FR-P4-17).
 *
 * A percentage uplift covering bench time, rework and unbilled travel. Applied
 * to the engagement total by default; `appliesTo` can narrow it to labour only.
 * Versioned and effective-dated so an old estimate reproduces exactly.
 */
export const gnrPolicies = pgTable(
  'gnr_policies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 100 }).notNull(),
    version: integer('version').notNull().default(1),
    ratePercent: decimal('rate_percent', { precision: 5, scale: 2 }).notNull(),
    appliesTo: varchar('applies_to', { length: 20 })
      .$type<GnrBasis>()
      .notNull()
      .default('total'),
    effectiveFrom: date('effective_from').notNull(),
    effectiveTo: date('effective_to'),
    notes: text('notes'),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('uq_gnr_name_version').on(t.name, t.version),
    index('idx_gnr_effective').on(t.effectiveFrom),
    check('gnr_applies_to_check', sql`${t.appliesTo} IN ('total', 'labour_only')`),
    check('gnr_rate_check', sql`${t.ratePercent} >= 0 AND ${t.ratePercent} <= 100`),
  ]
);

/**
 * The company-wide support default (FR-P4-17).
 *
 * Support — the share of management, admin and internal function that delivery
 * carries — used to be a per-resource cost component, which meant it reached
 * the total without anyone seeing it. It is now seeded as a cost line on each
 * new estimate, so an estimator can see the figure, argue with it, and adjust
 * it for an engagement that genuinely differs.
 *
 * Versioned and effective-dated like the GNR policy. Reproducibility does not
 * strictly require it — the seeded amount is copied onto the estimate — but a
 * record of what the default was when a quote went out is worth keeping.
 */
export const supportCostPolicies = pgTable(
  'support_cost_policies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 100 }).notNull(),
    version: integer('version').notNull().default(1),
    /** Read against `basis`: a flat engagement amount, or a rate per resource-hour. */
    amount: decimal('amount', { precision: 15, scale: 4 }).notNull(),
    basis: varchar('basis', { length: 30 })
      .$type<SupportBasis>()
      .notNull()
      .default('engagement'),
    label: varchar('label', { length: 150 }).notNull().default('Support & overhead'),
    effectiveFrom: date('effective_from').notNull(),
    effectiveTo: date('effective_to'),
    notes: text('notes'),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('uq_support_policy_name_version').on(t.name, t.version),
    index('idx_support_policy_effective').on(t.effectiveFrom),
    check('support_policy_basis_check', sql`${t.basis} IN ('engagement', 'per_resource_hour')`),
    check('support_policy_amount_check', sql`${t.amount} >= 0`),
    check(
      'support_policy_range_check',
      sql`${t.effectiveTo} IS NULL OR ${t.effectiveTo} >= ${t.effectiveFrom}`
    ),
  ]
);

export type DeliveryRole = typeof deliveryRoles.$inferSelect;
export type NewDeliveryRole = typeof deliveryRoles.$inferInsert;
export type UserDeliveryRole = typeof userDeliveryRoles.$inferSelect;
export type ResourceCostComponent = typeof resourceCostComponents.$inferSelect;
export type NewResourceCostComponent = typeof resourceCostComponents.$inferInsert;
export type GnrPolicy = typeof gnrPolicies.$inferSelect;
export type NewGnrPolicy = typeof gnrPolicies.$inferInsert;
export type SupportCostPolicy = typeof supportCostPolicies.$inferSelect;
export type NewSupportCostPolicy = typeof supportCostPolicies.$inferInsert;

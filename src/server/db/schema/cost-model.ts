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
import type { CostComponent, CostScope, GnrBasis } from '@/lib/types';

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
 * Per-resource weekly cost components (FR-P4-14).
 *
 * Three components — base, seat, support — each effective-dated so a historic
 * estimate resolves the value that applied on its own date (NFR-REP-01).
 *
 * Scope resolution is most-specific-wins: employee > role > default.
 * A `default` row is the company-wide fallback for that component.
 *
 * SECURITY: salary-derived. Never leaves the server without passing through
 * `financial-access.ts`. See NFR-SEC-04 and NFR-SEC-07.
 */
export const resourceCostComponents = pgTable(
  'resource_cost_components',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scope: varchar('scope', { length: 20 }).$type<CostScope>().notNull(),
    deliveryRoleId: uuid('delivery_role_id').references(() => deliveryRoles.id, {
      onDelete: 'cascade',
    }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    component: varchar('component', { length: 20 }).$type<CostComponent>().notNull(),
    amountPerWeek: decimal('amount_per_week', { precision: 15, scale: 2 }).notNull(),
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
    check(
      'cost_components_component_check',
      sql`${t.component} IN ('base', 'seat', 'support')`
    ),
    check('cost_components_amount_check', sql`${t.amountPerWeek} >= 0`),
    check(
      'cost_components_range_check',
      sql`${t.effectiveTo} IS NULL OR ${t.effectiveTo} >= ${t.effectiveFrom}`
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

export type DeliveryRole = typeof deliveryRoles.$inferSelect;
export type NewDeliveryRole = typeof deliveryRoles.$inferInsert;
export type UserDeliveryRole = typeof userDeliveryRoles.$inferSelect;
export type ResourceCostComponent = typeof resourceCostComponents.$inferSelect;
export type NewResourceCostComponent = typeof resourceCostComponents.$inferInsert;
export type GnrPolicy = typeof gnrPolicies.$inferSelect;
export type NewGnrPolicy = typeof gnrPolicies.$inferInsert;

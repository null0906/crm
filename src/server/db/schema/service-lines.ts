import { boolean, integer, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * What we sell, as configurable data rather than a source constant.
 *
 * The list lived in `src/lib/service-lines.ts` and could only change by
 * deploying. Everything a service line needs configuring for — its scoping
 * questions, its role checklist, its ideal cost — hangs off the slug, so adding
 * a service meant a code change before anyone could price one.
 *
 * The slug is the primary key because it is already what every other table
 * stores: `estimates.service_line`, `effort_baselines.service_line`,
 * `margin_targets.service_line`, `sizing_driver_service_lines.service_line`.
 * No foreign keys point here on purpose — `margin_targets` uses the '*'
 * sentinel for the company-wide row, and rows written before the slug
 * migration may hold values this table has never heard of. A constraint would
 * turn that legacy data into a failed insert rather than a visible oddity.
 *
 * Retiring a service is `isActive = false`, never a delete: estimates already
 * signed reference the slug and must stay legible.
 */
export const serviceLines = pgTable('service_lines', {
  slug: varchar('slug', { length: 50 }).primaryKey(),
  label: varchar('label', { length: 100 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  position: integer('position').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ServiceLineRow = typeof serviceLines.$inferSelect;
export type NewServiceLineRow = typeof serviceLines.$inferInsert;

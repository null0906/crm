import { pgTable, uuid, boolean, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';

export const automationSettings = pgTable('automation_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  leadInactivityEnabled: boolean('lead_inactivity_enabled').notNull().default(true),
  leadInactivityDays: integer('lead_inactivity_days').notNull().default(3),
  leadInactivityCooldownHours: integer('lead_inactivity_cooldown_hours').notNull().default(24),
  leadInactivityPipelines: jsonb('lead_inactivity_pipelines').notNull().$type<string[]>().default(['sales', 'partner', 'enterprise']),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AutomationSettings = typeof automationSettings.$inferSelect;
export type NewAutomationSettings = typeof automationSettings.$inferInsert;

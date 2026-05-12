import { pgTable, uuid, boolean, integer, jsonb, timestamp, varchar, text } from 'drizzle-orm/pg-core';
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

export const automationConfig = pgTable('automation_config', {
  key: varchar('key', { length: 50 }).primaryKey(),
  isEnabled: boolean('is_enabled').notNull().default(true),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  lastRunResult: text('last_run_result'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AutomationConfig = typeof automationConfig.$inferSelect;
export type NewAutomationConfig = typeof automationConfig.$inferInsert;

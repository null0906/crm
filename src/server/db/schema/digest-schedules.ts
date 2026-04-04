import { pgTable, uuid, varchar, timestamp, boolean, jsonb, integer, index } from 'drizzle-orm/pg-core';
import { users } from './users';
import { dashboards } from './dashboards';

export const digestSchedules = pgTable(
  'digest_schedules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    dashboardId: uuid('dashboard_id').references(() => dashboards.id, { onDelete: 'set null' }),
    // 'daily' | 'weekly' | 'monthly'
    scheduleType: varchar('schedule_type', { length: 20 }).notNull().default('daily'),
    // HH:MM in IST (e.g. "09:00")
    scheduleTime: varchar('schedule_time', { length: 10 }).notNull().default('09:00'),
    // 0 = Sunday … 6 = Saturday (used for weekly)
    scheduleDayOfWeek: integer('schedule_day_of_week'),
    // 1-31 (used for monthly)
    scheduleDayOfMonth: integer('schedule_day_of_month'),
    // JSON array of email strings
    emailRecipients: jsonb('email_recipients').notNull().$type<string[]>().default([]),
    // JSON array of Telegram chat IDs (numbers or negative for groups)
    telegramRecipients: jsonb('telegram_recipients').notNull().$type<number[]>().default([]),
    isActive: boolean('is_active').notNull().default(true),
    lastSentAt: timestamp('last_sent_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_digest_schedules_active').on(t.isActive),
    index('idx_digest_schedules_type').on(t.scheduleType),
  ]
);

export type DigestSchedule = typeof digestSchedules.$inferSelect;
export type NewDigestSchedule = typeof digestSchedules.$inferInsert;

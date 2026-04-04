import { pgTable, uuid, varchar, text, timestamp, jsonb, integer, boolean, date, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';
import { contacts } from './contacts';
import { companies } from './companies';
import { deals } from './deals';
import type { ActivityType, CallOutcome, CallDirection, TaskPriority } from '@/lib/types';

export const activities = pgTable(
  'activities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    activityType: varchar('activity_type', { length: 30 }).$type<ActivityType>().notNull(),
    subject: varchar('subject', { length: 255 }),
    body: text('body'),
    // Call fields
    callDurationSeconds: integer('call_duration_seconds'),
    callOutcome: varchar('call_outcome', { length: 30 }).$type<CallOutcome>(),
    callDirection: varchar('call_direction', { length: 10 }).$type<CallDirection>(),
    // Email fields
    emailMessageId: text('email_message_id'),
    emailThreadId: text('email_thread_id'),
    // Meeting fields
    meetingStartAt: timestamp('meeting_start_at', { withTimezone: true }),
    meetingEndAt: timestamp('meeting_end_at', { withTimezone: true }),
    meetingLocation: text('meeting_location'),
    meetingLink: text('meeting_link'),
    // Task fields
    taskDueDate: date('task_due_date'),
    taskCompletedAt: timestamp('task_completed_at', { withTimezone: true }),
    taskPriority: varchar('task_priority', { length: 10 }).$type<TaskPriority>(),
    // Entity associations
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    dealId: uuid('deal_id').references(() => deals.id, { onDelete: 'set null' }),
    // Metadata
    performedBy: uuid('performed_by').notNull().references(() => users.id),
    isAutomated: boolean('is_automated').default(false),
    attachments: jsonb('attachments').default([]),
    metadata: jsonb('metadata').default({}),
    // Timestamps
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_activities_contact').on(t.contactId),
    index('idx_activities_company').on(t.companyId),
    index('idx_activities_deal').on(t.dealId),
    index('idx_activities_type').on(t.activityType),
    index('idx_activities_performer').on(t.performedBy),
    index('idx_activities_occurred').on(t.occurredAt),
    index('idx_activities_deleted').on(t.deletedAt).where(sql`${t.deletedAt} IS NULL`),
  ]
);

export type Activity = typeof activities.$inferSelect;
export type NewActivity = typeof activities.$inferInsert;

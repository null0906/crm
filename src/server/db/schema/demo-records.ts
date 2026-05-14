import { pgTable, uuid, varchar, text, timestamp, integer, date, index } from 'drizzle-orm/pg-core';
import { contacts } from './contacts';
import { companies } from './companies';
import { deals } from './deals';
import { activities } from './activities';
import { users } from './users';

export type DemoCallType = 'discovery' | 'demo' | 'follow_up' | 'proposal_walkthrough' | 'onboarding' | 'check_in';
export type DemoOutcome = 'completed' | 'no_show' | 'rescheduled' | 'cancelled' | 'interested' | 'not_interested' | 'needs_follow_up';

export const demoRecords = pgTable(
  'demo_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    dealId: uuid('deal_id').references(() => deals.id, { onDelete: 'set null' }),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    activityId: uuid('activity_id').references(() => activities.id, { onDelete: 'set null' }),
    callType: varchar('call_type', { length: 30 }).$type<DemoCallType>().notNull().default('demo'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    durationMinutes: integer('duration_minutes'),
    outcome: varchar('outcome', { length: 30 }).$type<DemoOutcome>(),
    attendees: text('attendees'),
    clientRequirements: text('client_requirements'),
    painPoints: text('pain_points'),
    objections: text('objections'),
    nextAction: text('next_action'),
    nextActionDate: date('next_action_date'),
    demoNotes: text('demo_notes'),
    conductedBy: uuid('conducted_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_demo_records_contact').on(t.contactId),
    index('idx_demo_records_deal').on(t.dealId),
    index('idx_demo_records_company').on(t.companyId),
  ]
);

export type DemoRecord = typeof demoRecords.$inferSelect;
export type NewDemoRecord = typeof demoRecords.$inferInsert;

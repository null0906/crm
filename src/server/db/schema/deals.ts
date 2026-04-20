import { pgTable, uuid, varchar, text, timestamp, jsonb, integer, decimal, date, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';
import { companies } from './companies';
import { contacts } from './contacts';
import { pipelines, pipelineStages } from './pipelines';
import type { DealStatus, DealContactRole } from '@/lib/types';

export const deals = pgTable(
  'deals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    pipelineId: uuid('pipeline_id').notNull().references(() => pipelines.id),
    stageId: uuid('stage_id').notNull().references(() => pipelineStages.id),
    stageEnteredAt: timestamp('stage_entered_at', { withTimezone: true }).notNull().defaultNow(),
    amount: decimal('amount', { precision: 15, scale: 2 }),
    currency: varchar('currency', { length: 3 }).default('INR'),
    probability: integer('probability').default(0),
    // weighted_amount is a generated column — cannot be inserted/updated
    expectedCloseDate: date('expected_close_date'),
    actualCloseDate: date('actual_close_date'),
    status: varchar('status', { length: 20 }).$type<DealStatus>().notNull().default('open'),
    lostReason: text('lost_reason'),
    wonReason: text('won_reason'),
    primaryContactId: uuid('primary_contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    partnerCompanyId: uuid('partner_company_id').references(() => companies.id, { onDelete: 'set null' }),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    customFields: jsonb('custom_fields').default({}),
    positionInStage: integer('position_in_stage').default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_deals_pipeline').on(t.pipelineId),
    index('idx_deals_stage').on(t.stageId),
    index('idx_deals_owner').on(t.ownerId),
    index('idx_deals_status').on(t.status),
    index('idx_deals_company').on(t.companyId),
    index('idx_deals_partner_company').on(t.partnerCompanyId),
    index('idx_deals_contact').on(t.primaryContactId),
    index('idx_deals_close_date').on(t.expectedCloseDate),
    index('idx_deals_deleted').on(t.deletedAt).where(sql`${t.deletedAt} IS NULL`),
  ]
);

export const dealContacts = pgTable(
  'deal_contacts',
  {
    dealId: uuid('deal_id').notNull().references(() => deals.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 50 }).$type<DealContactRole>().default('stakeholder'),
  },
  (t) => [
    index('idx_deal_contacts_contact').on(t.contactId),
  ]
);

export const dealStageHistory = pgTable(
  'deal_stage_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dealId: uuid('deal_id').notNull().references(() => deals.id, { onDelete: 'cascade' }),
    fromStageId: uuid('from_stage_id').references(() => pipelineStages.id),
    toStageId: uuid('to_stage_id').notNull().references(() => pipelineStages.id),
    movedBy: uuid('moved_by').notNull().references(() => users.id),
    enteredAt: timestamp('entered_at', { withTimezone: true }).notNull().defaultNow(),
    exitedAt: timestamp('exited_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_stage_history_deal').on(t.dealId),
    index('idx_stage_history_stage').on(t.toStageId),
  ]
);

export type Deal = typeof deals.$inferSelect;
export type NewDeal = typeof deals.$inferInsert;
export type DealContact = typeof dealContacts.$inferSelect;
export type DealStageHistory = typeof dealStageHistory.$inferSelect;

import { date, decimal, index, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { contacts } from './contacts';
import { deals } from './deals';
import { projects } from './projects';
import { users } from './users';
import type { OnboardingDocumentStatus, OnboardingStage, OnboardingStatus } from '@/lib/types';

export const onboardings = pgTable('onboardings', {
  id: uuid('id').primaryKey().defaultRandom(),
  dealId: uuid('deal_id').notNull().unique().references(() => deals.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
  primaryContactId: uuid('primary_contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  stage: varchar('stage', { length: 50 }).$type<OnboardingStage>().notNull().default('documents_pending'),
  stageEnteredAt: timestamp('stage_entered_at', { withTimezone: true }).notNull().defaultNow(),
  msaStatus: varchar('msa_status', { length: 20 }).$type<OnboardingDocumentStatus>().default('pending'),
  msaSentAt: date('msa_sent_at'),
  msaSignedAt: date('msa_signed_at'),
  ndaStatus: varchar('nda_status', { length: 20 }).$type<OnboardingDocumentStatus>().default('pending'),
  ndaSentAt: date('nda_sent_at'),
  ndaSignedAt: date('nda_signed_at'),
  sowStatus: varchar('sow_status', { length: 20 }).$type<OnboardingDocumentStatus>().default('pending'),
  sowSentAt: date('sow_sent_at'),
  sowSignedAt: date('sow_signed_at'),
  engagementAmount: decimal('engagement_amount', { precision: 15, scale: 2 }),
  engagementCurrency: varchar('engagement_currency', { length: 3 }).default('INR'),
  engagementAmountBreakdown: jsonb('engagement_amount_breakdown').default({}),
  amountVarianceReason: text('amount_variance_reason'),
  paymentTerms: varchar('payment_terms', { length: 50 }),
  paymentTermsNotes: text('payment_terms_notes'),
  poReceivedAt: date('po_received_at'),
  poNumber: varchar('po_number', { length: 100 }),
  firstPaymentReceivedAt: date('first_payment_received_at'),
  firstPaymentAmount: decimal('first_payment_amount', { precision: 15, scale: 2 }),
  kickoffScheduledAt: timestamp('kickoff_scheduled_at', { withTimezone: true }),
  kickoffMeetingLink: text('kickoff_meeting_link'),
  kickoffNotes: text('kickoff_notes'),
  deliveryTeamAssigned: uuid('delivery_team_assigned').array().default([]),
  ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  status: varchar('status', { length: 20 }).$type<OnboardingStatus>().notNull().default('active'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  convertedToProjectId: uuid('converted_to_project_id').references(() => projects.id, { onDelete: 'set null' }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_onboardings_deal').on(t.dealId),
  index('idx_onboardings_company').on(t.companyId),
  index('idx_onboardings_stage').on(t.stage),
  index('idx_onboardings_status').on(t.status),
  index('idx_onboardings_owner').on(t.ownerId),
]);

export const onboardingStageHistory = pgTable('onboarding_stage_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  onboardingId: uuid('onboarding_id').notNull().references(() => onboardings.id, { onDelete: 'cascade' }),
  fromStage: varchar('from_stage', { length: 50 }).$type<OnboardingStage>(),
  toStage: varchar('to_stage', { length: 50 }).$type<OnboardingStage>().notNull(),
  movedBy: uuid('moved_by').notNull().references(() => users.id),
  notes: text('notes'),
  enteredAt: timestamp('entered_at', { withTimezone: true }).notNull().defaultNow(),
  exitedAt: timestamp('exited_at', { withTimezone: true }),
}, (t) => [index('idx_onboarding_history_onboarding').on(t.onboardingId)]);

export type Onboarding = typeof onboardings.$inferSelect;
export type NewOnboarding = typeof onboardings.$inferInsert;

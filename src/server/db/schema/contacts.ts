import { pgTable, uuid, varchar, text, timestamp, jsonb, integer, date, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';
import { companies } from './companies';
import type { ContactStatus, ContactSource } from '@/lib/types';

export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Core identity
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    email: varchar('email', { length: 255 }),
    secondaryEmail: varchar('secondary_email', { length: 255 }),
    phone: varchar('phone', { length: 30 }),
    mobile: varchar('mobile', { length: 30 }),
    // Professional context
    jobTitle: varchar('job_title', { length: 150 }),
    department: varchar('department', { length: 100 }),
    companyName: varchar('company_name', { length: 255 }),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    referredByPartnerId: uuid('referred_by_partner_id').references(() => companies.id, { onDelete: 'set null' }),
    referralDate: date('referral_date'),
    linkedinUrl: text('linkedin_url'),
    // CRM metadata
    source: varchar('source', { length: 50 }).$type<ContactSource>(),
    status: varchar('status', { length: 30 }).$type<ContactStatus>().notNull().default('new'),
    leadScore: integer('lead_score').default(0),
    // Ownership
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    // Address
    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),
    city: varchar('city', { length: 100 }),
    state: varchar('state', { length: 100 }),
    postalCode: varchar('postal_code', { length: 20 }),
    country: varchar('country', { length: 100 }),
    location: varchar('location', { length: 255 }),
    // Notes
    description: text('description'),
    // Custom fields (JSONB)
    customFields: jsonb('custom_fields').default({}),
    // Timestamps
    lastContactedAt: timestamp('last_contacted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_contacts_company').on(t.companyId),
    index('idx_contacts_owner').on(t.ownerId),
    index('idx_contacts_status').on(t.status),
    index('idx_contacts_email').on(t.email),
    index('idx_contacts_name').on(t.lastName, t.firstName),
    index('idx_contacts_source').on(t.source),
    index('idx_contacts_deleted').on(t.deletedAt).where(sql`${t.deletedAt} IS NULL`),
  ]
);

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;

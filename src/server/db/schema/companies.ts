import { pgTable, uuid, varchar, text, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';
import type { CompanyStatus, CompanyType, CompanySize } from '@/lib/types';

export const companies = pgTable(
  'companies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    domain: varchar('domain', { length: 255 }),
    website: text('website'),
    industry: varchar('industry', { length: 100 }),
    subIndustry: varchar('sub_industry', { length: 100 }),
    companySize: varchar('company_size', { length: 30 }).$type<CompanySize>(),
    annualRevenueRange: varchar('annual_revenue_range', { length: 50 }),
    companyType: varchar('company_type', { length: 30 }).$type<CompanyType>(),
    phone: varchar('phone', { length: 30 }),
    email: varchar('email', { length: 255 }),
    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),
    city: varchar('city', { length: 100 }),
    state: varchar('state', { length: 100 }),
    postalCode: varchar('postal_code', { length: 20 }),
    country: varchar('country', { length: 100 }),
    location: varchar('location', { length: 255 }),
    linkedinUrl: text('linkedin_url'),
    twitterUrl: text('twitter_url'),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    status: varchar('status', { length: 30 }).$type<CompanyStatus>().notNull().default('active'),
    description: text('description'),
    logoUrl: text('logo_url'),
    customFields: jsonb('custom_fields').default({}),
    lastContactedAt: timestamp('last_contacted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('idx_companies_domain').on(t.domain).where(sql`${t.domain} IS NOT NULL AND ${t.deletedAt} IS NULL`),
    index('idx_companies_name').on(t.name),
    index('idx_companies_industry').on(t.industry),
    index('idx_companies_owner').on(t.ownerId),
    index('idx_companies_type').on(t.companyType),
    index('idx_companies_deleted').on(t.deletedAt).where(sql`${t.deletedAt} IS NULL`),
  ]
);

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;

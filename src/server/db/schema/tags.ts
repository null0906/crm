import { pgTable, uuid, varchar, text, timestamp, integer, index, primaryKey } from 'drizzle-orm/pg-core';
import { users } from './users';
import { contacts } from './contacts';
import { companies } from './companies';
import { deals } from './deals';

export const tagCategories = pgTable('tag_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 50 }).unique().notNull(),
  color: varchar('color', { length: 7 }),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 100 }).notNull(),
    slug: varchar('slug', { length: 100 }).unique().notNull(),
    color: varchar('color', { length: 7 }).notNull().default('#6B7280'),
    categoryId: uuid('category_id').references(() => tagCategories.id, { onDelete: 'set null' }),
    description: text('description'),
    createdBy: uuid('created_by').references(() => users.id),
    usageCount: integer('usage_count').default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_tags_category').on(t.categoryId),
    index('idx_tags_name').on(t.name),
  ]
);

export const contactTags = pgTable(
  'contact_tags',
  {
    contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
    taggedBy: uuid('tagged_by').references(() => users.id),
    taggedAt: timestamp('tagged_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.contactId, t.tagId] }),
    index('idx_contact_tags_tag').on(t.tagId),
  ]
);

export const companyTags = pgTable(
  'company_tags',
  {
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
    taggedBy: uuid('tagged_by').references(() => users.id),
    taggedAt: timestamp('tagged_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.companyId, t.tagId] }),
    index('idx_company_tags_tag').on(t.tagId),
  ]
);

export const dealTags = pgTable(
  'deal_tags',
  {
    dealId: uuid('deal_id').notNull().references(() => deals.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
    taggedBy: uuid('tagged_by').references(() => users.id),
    taggedAt: timestamp('tagged_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.dealId, t.tagId] }),
    index('idx_deal_tags_tag').on(t.tagId),
  ]
);

export type TagCategory = typeof tagCategories.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
export type ContactTag = typeof contactTags.$inferSelect;
export type CompanyTag = typeof companyTags.$inferSelect;
export type DealTag = typeof dealTags.$inferSelect;

import { pgTable, uuid, varchar, text, boolean, timestamp, integer, jsonb, index, unique } from 'drizzle-orm/pg-core';
import { users } from './users';
import type { FieldType, EntityType } from '@/lib/types';

export const customFieldDefinitions = pgTable(
  'custom_field_definitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 100 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull(),
    description: text('description'),
    entityType: varchar('entity_type', { length: 20 }).$type<EntityType>().notNull(),
    fieldType: varchar('field_type', { length: 30 }).$type<FieldType>().notNull(),
    config: jsonb('config').default({}),
    isRequired: boolean('is_required').default(false),
    defaultValue: jsonb('default_value'),
    validationRegex: text('validation_regex'),
    position: integer('position').default(0),
    section: varchar('section', { length: 100 }),
    isVisibleInTable: boolean('is_visible_in_table').default(true),
    isVisibleInForm: boolean('is_visible_in_form').default(true),
    isFilterable: boolean('is_filterable').default(true),
    isSearchable: boolean('is_searchable').default(false),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('uq_custom_field_entity_slug').on(t.entityType, t.slug),
    index('idx_custom_fields_entity').on(t.entityType),
  ]
);

export type CustomFieldDefinition = typeof customFieldDefinitions.$inferSelect;
export type NewCustomFieldDefinition = typeof customFieldDefinitions.$inferInsert;

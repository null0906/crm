import { pgTable, uuid, varchar, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { users } from './users';
import type { SavedViewVisibility, EntityType } from '@/lib/types';

export const savedViews = pgTable(
  'saved_views',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 100 }).notNull(),
    entityType: varchar('entity_type', { length: 20 }).$type<EntityType>().notNull(),
    filters: jsonb('filters').notNull().default({}),
    columns: jsonb('columns'),
    sortConfig: jsonb('sort_config'),
    groupBy: varchar('group_by', { length: 100 }),
    visibility: varchar('visibility', { length: 20 }).$type<SavedViewVisibility>().notNull().default('private'),
    isPinned: boolean('is_pinned').default(false),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_saved_views_entity').on(t.entityType),
    index('idx_saved_views_creator').on(t.createdBy),
  ]
);

export type SavedView = typeof savedViews.$inferSelect;
export type NewSavedView = typeof savedViews.$inferInsert;

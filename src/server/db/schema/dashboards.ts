import { pgTable, uuid, varchar, text, boolean, timestamp, integer, jsonb, index } from 'drizzle-orm/pg-core';
import { users } from './users';
import type { DashboardVisibility, WidgetType } from '@/lib/types';

export const dashboards = pgTable('dashboards', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 150 }).notNull(),
  description: text('description'),
  isPublic: boolean('is_public').default(false),
  publicSlug: varchar('public_slug', { length: 100 }).unique(),
  publicToken: varchar('public_token', { length: 64 }).unique(),
  isDefault: boolean('is_default').default(false),
  visibility: varchar('visibility', { length: 20 }).$type<DashboardVisibility>().notNull().default('private'),
  layout: jsonb('layout').notNull().default([]),
  autoRefreshSeconds: integer('auto_refresh_seconds').default(0),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dashboardWidgets = pgTable(
  'dashboard_widgets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dashboardId: uuid('dashboard_id').notNull().references(() => dashboards.id, { onDelete: 'cascade' }),
    widgetType: varchar('widget_type', { length: 30 }).$type<WidgetType>().notNull(),
    title: varchar('title', { length: 150 }).notNull(),
    subtitle: text('subtitle'),
    color: varchar('color', { length: 7 }),
    icon: varchar('icon', { length: 50 }),
    config: jsonb('config').notNull().default({}),
    cacheTtlSeconds: integer('cache_ttl_seconds').default(300),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_widgets_dashboard').on(t.dashboardId),
  ]
);

export type Dashboard = typeof dashboards.$inferSelect;
export type NewDashboard = typeof dashboards.$inferInsert;
export type DashboardWidget = typeof dashboardWidgets.$inferSelect;
export type NewDashboardWidget = typeof dashboardWidgets.$inferInsert;

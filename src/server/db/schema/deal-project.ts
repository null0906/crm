import { pgTable, uuid, varchar, text, timestamp, integer, date, index, unique } from 'drizzle-orm/pg-core';
import { deals } from './deals';
import { users } from './users';
import type { DealTaskStatus, TaskPriority } from '@/lib/types';

export const dealTeamMembers = pgTable(
  'deal_team_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dealId: uuid('deal_id').notNull().references(() => deals.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 50 }).default('member'),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('deal_team_members_deal_user_unique').on(t.dealId, t.userId),
    index('idx_deal_team_deal').on(t.dealId),
    index('idx_deal_team_user').on(t.userId),
  ]
);

export const dealTasks = pgTable(
  'deal_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dealId: uuid('deal_id').notNull().references(() => deals.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    status: varchar('status', { length: 20 }).$type<DealTaskStatus>().default('pending'),
    priority: varchar('priority', { length: 10 }).$type<TaskPriority>().default('medium'),
    assignedTo: uuid('assigned_to').references(() => users.id, { onDelete: 'set null' }),
    dueDate: date('due_date'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    position: integer('position').default(0),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_deal_tasks_deal').on(t.dealId),
    index('idx_deal_tasks_assigned').on(t.assignedTo),
    index('idx_deal_tasks_status').on(t.status),
    index('idx_deal_tasks_due').on(t.dueDate),
  ]
);

export type DealTeamMember = typeof dealTeamMembers.$inferSelect;
export type NewDealTeamMember = typeof dealTeamMembers.$inferInsert;
export type DealTask = typeof dealTasks.$inferSelect;
export type NewDealTask = typeof dealTasks.$inferInsert;

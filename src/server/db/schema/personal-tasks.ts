import { boolean, decimal, index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './users';
import { projects } from './projects';
import { deals } from './deals';
import type { PersonalTaskStatus } from '@/lib/types';

export const personalTasks = pgTable(
  'personal_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    taskName: varchar('task_name', { length: 255 }).notNull(),
    description: text('description'),
    linkedProjectId: uuid('linked_project_id').references(() => projects.id, { onDelete: 'set null' }),
    linkedDealId: uuid('linked_deal_id').references(() => deals.id, { onDelete: 'set null' }),
    isInternal: boolean('is_internal').notNull().default(false),
    status: varchar('status', { length: 20 }).$type<PersonalTaskStatus>().notNull().default('in_progress'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    hoursSpent: decimal('hours_spent', { precision: 5, scale: 2 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_personal_tasks_user').on(t.userId),
    index('idx_personal_tasks_status').on(t.status),
    index('idx_personal_tasks_project').on(t.linkedProjectId),
    index('idx_personal_tasks_deal').on(t.linkedDealId),
    index('idx_personal_tasks_started').on(t.startedAt),
    index('idx_personal_tasks_user_status').on(t.userId, t.status),
  ]
);

export type PersonalTask = typeof personalTasks.$inferSelect;
export type NewPersonalTask = typeof personalTasks.$inferInsert;


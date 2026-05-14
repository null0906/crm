import {
  boolean,
  date,
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { companies } from './companies';
import { contacts } from './contacts';
import { deals } from './deals';
import { users } from './users';
import type {
  ProjectMemberRole,
  ProjectServiceType,
  ProjectStage,
  ProjectStatus,
  ProjectTaskCategory,
  ProjectTaskStatus,
  TaskPriority,
} from '@/lib/types';

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    dealId: uuid('deal_id').unique().references(() => deals.id, { onDelete: 'set null' }),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    primaryContactId: uuid('primary_contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    serviceType: varchar('service_type', { length: 50 }).$type<ProjectServiceType>(),
    stage: varchar('stage', { length: 50 }).$type<ProjectStage>().notNull().default('kickoff'),
    stageEnteredAt: timestamp('stage_entered_at', { withTimezone: true }).notNull().defaultNow(),
    startDate: date('start_date'),
    endDate: date('end_date'),
    actualEndDate: date('actual_end_date'),
    progressPercent: integer('progress_percent').default(0),
    isDelayed: boolean('is_delayed').default(false),
    delayReason: text('delay_reason'),
    revisedEndDate: date('revised_end_date'),
    contractValue: decimal('contract_value', { precision: 15, scale: 2 }),
    currency: varchar('currency', { length: 3 }).default('INR'),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    status: varchar('status', { length: 20 }).$type<ProjectStatus>().default('active'),
    customFields: jsonb('custom_fields').default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_projects_deal').on(t.dealId),
    index('idx_projects_company').on(t.companyId),
    index('idx_projects_owner').on(t.ownerId),
    index('idx_projects_stage').on(t.stage),
    index('idx_projects_status').on(t.status),
    index('idx_projects_service').on(t.serviceType),
    index('idx_projects_deleted').on(t.deletedAt).where(sql`${t.deletedAt} IS NULL`),
  ]
);

export const projectMembers = pgTable(
  'project_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 50 }).$type<ProjectMemberRole>().default('member'),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('project_members_project_user_unique').on(t.projectId, t.userId),
    index('idx_project_members_project').on(t.projectId),
    index('idx_project_members_user').on(t.userId),
  ]
);

export const projectTasks = pgTable(
  'project_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    category: varchar('category', { length: 100 }).$type<ProjectTaskCategory>(),
    status: varchar('status', { length: 20 }).$type<ProjectTaskStatus>().default('pending'),
    priority: varchar('priority', { length: 10 }).$type<TaskPriority>().default('medium'),
    assignedTo: uuid('assigned_to').references(() => users.id, { onDelete: 'set null' }),
    dueDate: date('due_date'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    blockedReason: text('blocked_reason'),
    position: integer('position').default(0),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_project_tasks_project').on(t.projectId),
    index('idx_project_tasks_assigned').on(t.assignedTo),
    index('idx_project_tasks_status').on(t.status),
    index('idx_project_tasks_due').on(t.dueDate).where(sql`${t.status} != 'completed'`),
  ]
);

export const projectStageHistory = pgTable(
  'project_stage_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    fromStage: varchar('from_stage', { length: 50 }).$type<ProjectStage>(),
    toStage: varchar('to_stage', { length: 50 }).$type<ProjectStage>().notNull(),
    movedBy: uuid('moved_by').notNull().references(() => users.id),
    notes: text('notes'),
    enteredAt: timestamp('entered_at', { withTimezone: true }).notNull().defaultNow(),
    exitedAt: timestamp('exited_at', { withTimezone: true }),
    durationHours: integer('duration_hours'),
  },
  (t) => [
    index('idx_project_stage_history_project').on(t.projectId),
  ]
);

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type ProjectMember = typeof projectMembers.$inferSelect;
export type NewProjectMember = typeof projectMembers.$inferInsert;
export type ProjectTask = typeof projectTasks.$inferSelect;
export type NewProjectTask = typeof projectTasks.$inferInsert;
export type ProjectStageHistory = typeof projectStageHistory.$inferSelect;

import { pgTable, uuid, varchar, text, boolean, timestamp, integer, jsonb, index, unique } from 'drizzle-orm/pg-core';
import { users } from './users';
import type { PipelineType, StageType } from '@/lib/types';

export const pipelines = pgTable('pipelines', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  isDefault: boolean('is_default').default(false),
  isActive: boolean('is_active').default(true),
  pipelineType: varchar('pipeline_type', { length: 20 }).$type<PipelineType>().default('sales'),
  isSalesPipeline: boolean('is_sales_pipeline').notNull().default(false),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  position: integer('position').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pipelineStages = pgTable(
  'pipeline_stages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pipelineId: uuid('pipeline_id').notNull().references(() => pipelines.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull(),
    description: text('description'),
    position: integer('position').notNull(),
    color: varchar('color', { length: 7 }),
    stageType: varchar('stage_type', { length: 20 }).$type<StageType>().notNull().default('active'),
    defaultProbability: integer('default_probability').default(0),
    automationConfig: jsonb('automation_config').default({}),
    isSystemStage: boolean('is_system_stage').default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('uq_stage_pipeline_slug').on(t.pipelineId, t.slug),
    unique('uq_stage_pipeline_position').on(t.pipelineId, t.position),
    index('idx_stages_pipeline').on(t.pipelineId),
  ]
);

export type Pipeline = typeof pipelines.$inferSelect;
export type NewPipeline = typeof pipelines.$inferInsert;
export type PipelineStage = typeof pipelineStages.$inferSelect;
export type NewPipelineStage = typeof pipelineStages.$inferInsert;

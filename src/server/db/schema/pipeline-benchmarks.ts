import { pgTable, uuid, decimal, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { pipelines, pipelineStages } from './pipelines';

export const pipelineBenchmarks = pgTable(
  'pipeline_benchmarks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pipelineId: uuid('pipeline_id').notNull().references(() => pipelines.id, { onDelete: 'cascade' }),
    stageId: uuid('stage_id').notNull().references(() => pipelineStages.id, { onDelete: 'cascade' }),
    avgDaysInStage: decimal('avg_days_in_stage', { precision: 10, scale: 2 }).notNull(),
    sampleSize: integer('sample_size').notNull().default(0),
    calculatedAt: timestamp('calculated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('idx_pipeline_benchmarks_pipeline_stage').on(t.pipelineId, t.stageId),
    index('idx_pipeline_benchmarks_stage').on(t.stageId),
  ]
);

export type PipelineBenchmark = typeof pipelineBenchmarks.$inferSelect;
export type NewPipelineBenchmark = typeof pipelineBenchmarks.$inferInsert;

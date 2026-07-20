import { z } from 'zod';
import { tool, type ToolSet } from 'ai';
import { getDailyMetrics } from '@/server/services/metrics.service';

export function createMetricsTools(): ToolSet {
  return {
    get_daily_metrics: tool({
      description: 'Company-wide daily snapshot: open pipeline count/value by stage, prospects won/lost this month, activities logged today, stale prospects, unassigned leads, new companies. This is ALWAYS a company-wide total, never personalized — for "my numbers" or "my activity" questions use get_rep_report or get_activity_by_person instead.',
      inputSchema: z.object({}),
      execute: async () => getDailyMetrics(),
    }),
  };
}

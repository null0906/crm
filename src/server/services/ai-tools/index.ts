import type { ToolSet } from 'ai';
import { db as defaultDb } from '@/server/db';
import type { SessionUser } from '@/lib/types';
import { createCrmReadTools } from './crm-read.tools';
import { createActivityTools } from './activity.tools';
import { createReportingTools } from './reporting.tools';
import { createMetricsTools } from './metrics.tools';
import { createEscapeHatchTools } from './escape-hatch.tools';
import { createClarifyTool } from './clarify.tool';

type DbClient = typeof defaultDb;

/**
 * Builds the full tool set for one AI assistant turn. Called fresh per incoming message so
 * every tool's execute closure captures the real, current `user` and `db` — never a
 * model-suppliable parameter. No tool in this library accepts anything like actingUserId or
 * asUser; where a tool takes a `userId` for "whose data to fetch," authorization is always
 * re-derived from this closed-over caller.
 */
export function createAiTools(user: SessionUser, sessionId: string, db: DbClient = defaultDb): ToolSet {
  return {
    ...createCrmReadTools(user),
    ...createActivityTools(user, db),
    ...createReportingTools(user),
    ...createMetricsTools(),
    ...createEscapeHatchTools(user, sessionId, db),
    ...createClarifyTool(),
  };
}

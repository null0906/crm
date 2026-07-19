/**
 * Company-wide daily metrics for external consumption (e.g. the /api/metrics/daily route).
 * Deliberately global/unscoped (no per-user visibility filtering) — this is meant to answer
 * "how's the whole company doing today," the same lens as bot-commands.service.ts's
 * handleToday(), which these queries are modeled on for consistency.
 *
 * Always reads deal value via deals_with_value.effective_value (coalesces onboarding
 * engagement_amount with deals.amount) — never deals.amount directly, per the documented
 * rule in ai-chat.service.ts.
 */

import { db } from '@/server/db';
import { activities, contacts, companies } from '@/server/db/schema';
import { and, isNull, eq, gte, sql } from 'drizzle-orm';

type QueryResultLike<T = Record<string, unknown>> = { rows?: T[] };
function asRows<T>(result: unknown): T[] {
  return ((result as QueryResultLike<T>)?.rows ?? []) as T[];
}

export interface DailyMetrics {
  generatedAt: string;
  pipeline: {
    openCount: number;
    openValue: number;
    byStage: Array<{ stage: string; count: number; value: number }>;
    wonThisMonth: { count: number; value: number };
    lostThisMonth: { count: number };
  };
  activity: {
    activitiesToday: number;
    proposalsSentThisMonth: number;
    staleProspects: number;
    unassignedLeads: number;
  };
  companies: {
    newToday: number;
    newThisWeek: number;
  };
}

export async function getDailyMetrics(): Promise<DailyMetrics> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]!;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const statsResult = await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM deals_with_value WHERE status = 'open' AND deleted_at IS NULL) AS open_count,
      (SELECT COALESCE(SUM(effective_value), 0)::text FROM deals_with_value WHERE status = 'open' AND deleted_at IS NULL) AS open_value,
      (SELECT COUNT(*)::int FROM deals_with_value WHERE status = 'won' AND deleted_at IS NULL AND actual_close_date >= ${startOfMonth}) AS won_count,
      (SELECT COALESCE(SUM(effective_value), 0)::text FROM deals_with_value WHERE status = 'won' AND deleted_at IS NULL AND actual_close_date >= ${startOfMonth}) AS won_value,
      (SELECT COUNT(*)::int FROM deals_with_value WHERE status = 'lost' AND deleted_at IS NULL AND actual_close_date >= ${startOfMonth}) AS lost_count
  `);
  const [stats] = asRows<{
    open_count: number;
    open_value: string;
    won_count: number;
    won_value: string;
    lost_count: number;
  }>(statsResult);

  const byStageResult = await db.execute(sql`
    SELECT ps.name AS stage, COUNT(dv.id)::int AS count, COALESCE(SUM(dv.effective_value), 0)::text AS value
    FROM deals_with_value dv
    JOIN pipeline_stages ps ON ps.id = dv.stage_id
    WHERE dv.status = 'open' AND dv.deleted_at IS NULL
    GROUP BY ps.name, ps.position
    ORDER BY ps.position
  `);
  const byStage = asRows<{ stage: string; count: number; value: string }>(byStageResult);

  const [activitiesToday] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(activities)
    .where(and(isNull(activities.deletedAt), gte(activities.occurredAt, startOfToday)));

  const [proposalsMonth] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(activities)
    .where(and(
      eq(activities.activityType, 'proposal'),
      isNull(activities.deletedAt),
      gte(activities.occurredAt, new Date(startOfMonth))
    ));

  const staleResult = await db.execute(sql`
    SELECT COUNT(*)::int AS count FROM deals
    WHERE status = 'open' AND deleted_at IS NULL AND updated_at < ${sevenDaysAgo}
  `);
  const [stale] = asRows<{ count: number }>(staleResult);

  const [unassigned] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(contacts)
    .where(and(isNull(contacts.ownerId), isNull(contacts.deletedAt)));

  const [newCompaniesToday] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(companies)
    .where(and(isNull(companies.deletedAt), gte(companies.createdAt, startOfToday)));

  const [newCompaniesWeek] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(companies)
    .where(and(isNull(companies.deletedAt), gte(companies.createdAt, sevenDaysAgo)));

  return {
    generatedAt: now.toISOString(),
    pipeline: {
      openCount: stats?.open_count ?? 0,
      openValue: Number(stats?.open_value ?? 0),
      byStage: byStage.map((row) => ({ stage: row.stage, count: row.count, value: Number(row.value) })),
      wonThisMonth: { count: stats?.won_count ?? 0, value: Number(stats?.won_value ?? 0) },
      lostThisMonth: { count: stats?.lost_count ?? 0 },
    },
    activity: {
      activitiesToday: activitiesToday?.count ?? 0,
      proposalsSentThisMonth: proposalsMonth?.count ?? 0,
      staleProspects: stale?.count ?? 0,
      unassignedLeads: unassigned?.count ?? 0,
    },
    companies: {
      newToday: newCompaniesToday?.count ?? 0,
      newThisWeek: newCompaniesWeek?.count ?? 0,
    },
  };
}

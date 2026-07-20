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

// Bucketed in application code (not SQL CASE/WHEN) so bucket boundaries live in one place and
// stay in sync between the label and the min/max returned alongside it. Indian numbering
// (Lakh/Crore) matches how the business already talks about deal size elsewhere (see
// formatIndianCurrency in report.service.ts) — min/max are also returned as plain numbers so
// a consumer can relabel if needed.
const HISTOGRAM_BUCKETS: Array<{ label: string; min: number; max: number | null }> = [
  { label: '< 1L', min: 0, max: 100_000 },
  { label: '1L - 5L', min: 100_000, max: 500_000 },
  { label: '5L - 10L', min: 500_000, max: 1_000_000 },
  { label: '10L - 25L', min: 1_000_000, max: 2_500_000 },
  { label: '25L - 50L', min: 2_500_000, max: 5_000_000 },
  { label: '50L - 1Cr', min: 5_000_000, max: 10_000_000 },
  { label: '1Cr+', min: 10_000_000, max: null },
];

function bucketDealSizes(rows: Array<{ currency: string; effective_value: string }>): DailyMetrics['pipeline']['dealSizeHistogram'] {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const value = Number(row.effective_value ?? 0);
    const bucket = HISTOGRAM_BUCKETS.find((b) => value >= b.min && (b.max === null || value < b.max)) ?? HISTOGRAM_BUCKETS[HISTOGRAM_BUCKETS.length - 1]!;
    const key = `${row.currency}::${bucket.label}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const histogram: DailyMetrics['pipeline']['dealSizeHistogram'] = [];
  for (const currency of new Set(rows.map((r) => r.currency))) {
    for (const bucket of HISTOGRAM_BUCKETS) {
      const count = counts.get(`${currency}::${bucket.label}`) ?? 0;
      if (count > 0) {
        histogram.push({ label: bucket.label, min: bucket.min, max: bucket.max, count, currency });
      }
    }
  }
  return histogram;
}

export interface DailyMetrics {
  generatedAt: string;
  pipeline: {
    openCount: number;
    openValue: number;
    byStage: Array<{ stage: string; count: number; value: number }>;
    wonThisMonth: { count: number; value: number };
    lostThisMonth: { count: number };
    byIndustry: Array<{ industry: string; count: number; value: number }>;
    byFramework: Array<{ framework: string; count: number; value: number }>;
    byGeography: Array<{ country: string; count: number; value: number }>;
    byCompanySize: Array<{ companySize: string; count: number; value: number }>;
    dealSizeHistogram: Array<{ label: string; min: number; max: number | null; count: number; currency: string }>;
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

  // All four grouped breakdowns share the same scope as openCount/openValue above: open,
  // non-deleted deals. LEFT JOIN companies (not JOIN) so deals with no linked company still
  // count, bucketed under 'Unknown', rather than silently disappearing from the totals.
  const byIndustryResult = await db.execute(sql`
    SELECT COALESCE(c.industry, 'Unknown') AS industry, COUNT(*)::int AS count, COALESCE(SUM(dv.effective_value), 0)::text AS value
    FROM deals_with_value dv
    LEFT JOIN companies c ON c.id = dv.company_id
    WHERE dv.status = 'open' AND dv.deleted_at IS NULL
    GROUP BY COALESCE(c.industry, 'Unknown')
    ORDER BY count DESC
  `);
  const byIndustry = asRows<{ industry: string; count: number; value: string }>(byIndustryResult);

  const byGeographyResult = await db.execute(sql`
    SELECT COALESCE(c.country, 'Unknown') AS country, COUNT(*)::int AS count, COALESCE(SUM(dv.effective_value), 0)::text AS value
    FROM deals_with_value dv
    LEFT JOIN companies c ON c.id = dv.company_id
    WHERE dv.status = 'open' AND dv.deleted_at IS NULL
    GROUP BY COALESCE(c.country, 'Unknown')
    ORDER BY count DESC
  `);
  const byGeography = asRows<{ country: string; count: number; value: string }>(byGeographyResult);

  const byCompanySizeResult = await db.execute(sql`
    SELECT COALESCE(c.company_size, 'Unknown') AS company_size, COUNT(*)::int AS count, COALESCE(SUM(dv.effective_value), 0)::text AS value
    FROM deals_with_value dv
    LEFT JOIN companies c ON c.id = dv.company_id
    WHERE dv.status = 'open' AND dv.deleted_at IS NULL
    GROUP BY COALESCE(c.company_size, 'Unknown')
    ORDER BY count DESC
  `);
  const byCompanySize = asRows<{ company_size: string; count: number; value: string }>(byCompanySizeResult);

  // deals.services is a jsonb text array (a deal can span multiple frameworks/services), so
  // this fans out via a lateral unnest — a deal with 2 services contributes to 2 buckets.
  // Deals with an empty/null services array are coalesced to a single 'Unspecified' row
  // instead of disappearing (a plain jsonb_array_elements_text on `[]` yields zero rows).
  const byFrameworkResult = await db.execute(sql`
    SELECT COALESCE(framework.value, 'Unspecified') AS framework, COUNT(*)::int AS count, COALESCE(SUM(dv.effective_value), 0)::text AS value
    FROM deals_with_value dv
    LEFT JOIN LATERAL jsonb_array_elements_text(
      CASE WHEN jsonb_array_length(COALESCE(dv.services, '[]'::jsonb)) > 0 THEN dv.services ELSE '[null]'::jsonb END
    ) AS framework(value) ON true
    WHERE dv.status = 'open' AND dv.deleted_at IS NULL
    GROUP BY COALESCE(framework.value, 'Unspecified')
    ORDER BY count DESC
  `);
  const byFramework = asRows<{ framework: string; count: number; value: string }>(byFrameworkResult);

  const dealSizesResult = await db.execute(sql`
    SELECT COALESCE(dv.engagement_currency, dv.currency, 'INR') AS currency, dv.effective_value::text AS effective_value
    FROM deals_with_value dv
    WHERE dv.status = 'open' AND dv.deleted_at IS NULL
  `);
  const dealSizeHistogram = bucketDealSizes(asRows<{ currency: string; effective_value: string }>(dealSizesResult));

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
      byIndustry: byIndustry.map((row) => ({ industry: row.industry, count: row.count, value: Number(row.value) })),
      byFramework: byFramework.map((row) => ({ framework: row.framework, count: row.count, value: Number(row.value) })),
      byGeography: byGeography.map((row) => ({ country: row.country, count: row.count, value: Number(row.value) })),
      byCompanySize: byCompanySize.map((row) => ({ companySize: row.company_size, count: row.count, value: Number(row.value) })),
      dealSizeHistogram,
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

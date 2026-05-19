import { sql } from 'drizzle-orm';
import { db as defaultDb } from '@/server/db';
import { writeAuditLog } from '@/server/services/audit.service';

type DbClient = typeof defaultDb;
type QueryResultLike<T = unknown> = { rows?: T[] };

function asRows<T>(result: unknown): T[] {
  return ((result as QueryResultLike<T>)?.rows ?? []) as T[];
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function daysBetween(dateFrom: Date, dateTo: Date): Date[] {
  const days: Date[] = [];
  const cursor = new Date(dateFrom);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(dateTo);
  end.setHours(0, 0, 0, 0);

  while (cursor <= end) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

function calculateWorkingDays(dateFrom: Date, dateTo: Date): number {
  return daysBetween(dateFrom, dateTo).filter((day) => day.getDay() !== 0 && day.getDay() !== 6).length || 1;
}

export function formatIndianCurrency(value: unknown): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(toNumber(value));
}

export interface RepReportParams {
  userId: string;
  dateFrom: Date;
  dateTo: Date;
  requestedBy: string;
  activityLimit?: number;
  db?: DbClient;
}

export interface RepReportData {
  rep: RepProfile;
  period: ReportPeriod;
  summary: ActivitySummary;
  pipeline: PipelineContribution;
  conversion: ConversionMetrics;
  velocity: VelocityMetrics;
  topDeals: DealSnapshot[];
  demoAnalysis: DemoAnalysis;
  activityFeed: ActivityFeedItem[];
  weeklyBreakdown: WeeklyBreakdown[];
  comparisonToPrevious: PeriodComparison;
  highlights: string[];
}

export interface RepProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl: string | null;
}

export interface ReportPeriod {
  dateFrom: Date;
  dateTo: Date;
}

export interface ActivitySummary {
  calls: {
    total: number;
    connected: number;
    voicemail: number;
    noAnswer: number;
    connectionRate: number;
    totalMinutes: number;
    avgDurationMinutes: number;
  };
  emails: { sent: number; received: number };
  meetings: number;
  demos: number;
  notes: number;
  whatsapp: number;
  linkedin: number;
  tasks: { completed: number; overdue: number };
  totalActivities: number;
  activeDays: number;
  workingDays: number;
  activeDayPercent: number;
  avgActivitiesPerDay: number;
  uniqueContactsTouched: number;
  uniqueCompaniesTouched: number;
}

export interface PipelineContribution {
  dealsCreated: number;
  dealsCreatedValue: number;
  dealsWon: number;
  revenueWon: number;
  dealsLost: number;
  revenueLost: number;
  openDeals: number;
  openPipelineValue: number;
  weightedPipeline: number;
  leadsAdded: number;
  winRate: number;
}

export interface ConversionMetrics {
  leadsToQualified: number;
  qualifiedToDemo: number;
  demoToProposal: number;
  proposalToNegotiation: number;
  qualificationRate: number;
  demoConversionRate: number;
  proposalRate: number;
}

export interface VelocityMetrics {
  avgDaysPerStage: Array<{ stageName: string; avgDays: number; dealCount: number }>;
  avgFirstResponseHours: number;
}

export interface DealSnapshot {
  id: string;
  title: string;
  amount: number;
  status: string;
  probability: number;
  expectedCloseDate: string | null;
  stageName: string | null;
  companyName: string | null;
  contactName: string | null;
  activityCount: number;
  lastActivityAt: Date | null;
}

export interface DemoAnalysis {
  total: number;
  byType: Record<string, number>;
  byOutcome: Record<string, number>;
  interestedRate: number;
  overdueFollowUps: number;
}

export interface ActivityFeedItem {
  id: string;
  activityType: string;
  subject: string | null;
  body: string | null;
  occurredAt: Date;
  callOutcome: string | null;
  callDurationSeconds: number | null;
  taskDueDate: string | null;
  taskCompletedAt: Date | null;
  contactId: string | null;
  contactName: string | null;
  companyId: string | null;
  companyName: string | null;
  dealId: string | null;
  dealTitle: string | null;
  demoOutcome: string | null;
  demoNextAction: string | null;
  demoNextActionDate: string | null;
}

export interface WeeklyBreakdown {
  weekStart: string;
  label: string;
  total: number;
  calls: number;
  emails: number;
  meetings: number;
  demos: number;
  contactsTouched: number;
}

export interface PeriodComparison {
  period: ReportPeriod;
  summary: ActivitySummary;
  pipeline: PipelineContribution;
}

export async function buildRepReport(params: RepReportParams): Promise<RepReportData> {
  const db = params.db ?? defaultDb;
  const dateFrom = toDate(params.dateFrom);
  const dateTo = toDate(params.dateTo);
  const activityLimit = params.activityLimit ?? 30;

  await writeAuditLog({
    userId: params.requestedBy,
    action: 'report_generated',
    entityType: 'user',
    entityId: params.userId,
    metadata: {
      dateFrom: dateFrom.toISOString(),
      dateTo: dateTo.toISOString(),
      activityLimit,
    },
  });

  const [
    rep,
    activitySummary,
    pipeline,
    conversion,
    velocity,
    topDeals,
    demoAnalysis,
    activityFeed,
    weeklyBreakdown,
    previousPeriod,
  ] = await Promise.all([
    getRepProfile(params.userId, db),
    getActivitySummary(params.userId, dateFrom, dateTo, db),
    getPipelineContribution(params.userId, dateFrom, dateTo, db),
    getConversionMetrics(params.userId, dateFrom, dateTo, db),
    getVelocityMetrics(params.userId, dateFrom, dateTo, db),
    getTopDeals(params.userId, dateFrom, dateTo, db),
    getDemoAnalysis(params.userId, dateFrom, dateTo, db),
    getActivityFeed(params.userId, dateFrom, dateTo, { limit: activityLimit, offset: 0 }, db),
    getWeeklyBreakdown(params.userId, dateFrom, dateTo, db),
    getPreviousPeriodData(params.userId, dateFrom, dateTo, db),
  ]);

  const highlights = generateHighlights(activitySummary, pipeline, conversion, previousPeriod, demoAnalysis);

  return {
    rep,
    period: { dateFrom, dateTo },
    summary: activitySummary,
    pipeline,
    conversion,
    velocity,
    topDeals,
    demoAnalysis,
    activityFeed,
    weeklyBreakdown,
    comparisonToPrevious: previousPeriod,
    highlights,
  };
}

export async function getRepProfile(userId: string, db: DbClient = defaultDb): Promise<RepProfile> {
  const result = await db.execute(sql`
    SELECT u.id, u.first_name, u.last_name, u.email, u.avatar_url, r.name AS role_name
    FROM users u
    INNER JOIN roles r ON r.id = u.role_id
    WHERE u.id = ${userId}
    LIMIT 1
  `);

  const user = asRows<{
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    avatar_url: string | null;
    role_name: string;
  }>(result)[0];

  if (!user) throw new Error('Report user not found');

  return {
    id: user.id,
    name: [user.first_name, user.last_name].filter(Boolean).join(' '),
    email: user.email,
    role: user.role_name,
    avatarUrl: user.avatar_url,
  };
}

export async function getActivitySummary(
  userId: string,
  dateFrom: Date,
  dateTo: Date,
  db: DbClient = defaultDb
): Promise<ActivitySummary> {
  const result = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE activity_type = 'call')::int AS calls_total,
      COUNT(*) FILTER (WHERE activity_type = 'call' AND call_outcome = 'connected')::int AS calls_connected,
      COUNT(*) FILTER (WHERE activity_type = 'call' AND call_outcome = 'voicemail')::int AS calls_voicemail,
      COUNT(*) FILTER (WHERE activity_type = 'call' AND call_outcome = 'no_answer')::int AS calls_no_answer,
      COUNT(*) FILTER (WHERE activity_type = 'email_sent')::int AS emails_sent,
      COUNT(*) FILTER (WHERE activity_type = 'email_received')::int AS emails_received,
      COUNT(*) FILTER (WHERE activity_type = 'meeting')::int AS meetings,
      COUNT(*) FILTER (WHERE activity_type = 'demo')::int AS demos,
      COUNT(*) FILTER (WHERE activity_type = 'note')::int AS notes,
      COUNT(*) FILTER (WHERE activity_type = 'whatsapp')::int AS whatsapp,
      COUNT(*) FILTER (WHERE activity_type = 'linkedin')::int AS linkedin,
      COUNT(*) FILTER (WHERE activity_type = 'task' AND task_completed_at IS NOT NULL)::int AS tasks_completed,
      COUNT(*) FILTER (WHERE activity_type = 'task' AND task_completed_at IS NULL AND task_due_date < CURRENT_DATE)::int AS tasks_overdue,
      COALESCE(SUM(call_duration_seconds) FILTER (WHERE activity_type = 'call' AND call_outcome = 'connected'), 0)::int AS total_call_seconds,
      COALESCE(AVG(call_duration_seconds) FILTER (WHERE activity_type = 'call' AND call_outcome = 'connected'), 0)::numeric AS avg_call_seconds,
      COUNT(*)::int AS total_activities,
      COUNT(DISTINCT DATE(occurred_at AT TIME ZONE 'Asia/Kolkata'))::int AS active_days,
      COUNT(DISTINCT contact_id) FILTER (WHERE contact_id IS NOT NULL)::int AS unique_contacts_touched,
      COUNT(DISTINCT company_id) FILTER (WHERE company_id IS NOT NULL)::int AS unique_companies_touched
    FROM activities
    WHERE performed_by = ${userId}
      AND occurred_at >= ${dateFrom}
      AND occurred_at <= ${dateTo}
      AND COALESCE(is_automated, false) = false
      AND deleted_at IS NULL
  `);

  const r = asRows<Record<string, unknown>>(result)[0] ?? {};
  const workingDays = calculateWorkingDays(dateFrom, dateTo);
  const callsTotal = toNumber(r.calls_total);
  const callsConnected = toNumber(r.calls_connected);
  const totalActivities = toNumber(r.total_activities);
  const activeDays = toNumber(r.active_days);

  return {
    calls: {
      total: callsTotal,
      connected: callsConnected,
      voicemail: toNumber(r.calls_voicemail),
      noAnswer: toNumber(r.calls_no_answer),
      connectionRate: callsTotal > 0 ? Math.round((callsConnected / callsTotal) * 100) : 0,
      totalMinutes: Math.round(toNumber(r.total_call_seconds) / 60),
      avgDurationMinutes: Math.round(toNumber(r.avg_call_seconds) / 60),
    },
    emails: {
      sent: toNumber(r.emails_sent),
      received: toNumber(r.emails_received),
    },
    meetings: toNumber(r.meetings),
    demos: toNumber(r.demos),
    notes: toNumber(r.notes),
    whatsapp: toNumber(r.whatsapp),
    linkedin: toNumber(r.linkedin),
    tasks: {
      completed: toNumber(r.tasks_completed),
      overdue: toNumber(r.tasks_overdue),
    },
    totalActivities,
    activeDays,
    workingDays,
    activeDayPercent: Math.round((activeDays / workingDays) * 100),
    avgActivitiesPerDay: Math.round((totalActivities / workingDays) * 10) / 10,
    uniqueContactsTouched: toNumber(r.unique_contacts_touched),
    uniqueCompaniesTouched: toNumber(r.unique_companies_touched),
  };
}

export async function getPipelineContribution(
  userId: string,
  dateFrom: Date,
  dateTo: Date,
  db: DbClient = defaultDb
): Promise<PipelineContribution> {
  const result = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE created_at >= ${dateFrom} AND created_at <= ${dateTo})::int AS deals_created,
      COALESCE(SUM(amount::numeric) FILTER (WHERE created_at >= ${dateFrom} AND created_at <= ${dateTo}), 0)::text AS deals_created_value,
      COUNT(*) FILTER (WHERE status = 'won' AND actual_close_date >= ${dateFrom.toISOString().slice(0, 10)} AND actual_close_date <= ${dateTo.toISOString().slice(0, 10)})::int AS deals_won,
      COALESCE(SUM(amount::numeric) FILTER (WHERE status = 'won' AND actual_close_date >= ${dateFrom.toISOString().slice(0, 10)} AND actual_close_date <= ${dateTo.toISOString().slice(0, 10)}), 0)::text AS revenue_won,
      COUNT(*) FILTER (WHERE status = 'lost' AND updated_at >= ${dateFrom} AND updated_at <= ${dateTo})::int AS deals_lost,
      COALESCE(SUM(amount::numeric) FILTER (WHERE status = 'lost' AND updated_at >= ${dateFrom} AND updated_at <= ${dateTo}), 0)::text AS revenue_lost,
      COUNT(*) FILTER (WHERE status = 'open')::int AS open_deals,
      COALESCE(SUM(amount::numeric) FILTER (WHERE status = 'open'), 0)::text AS open_pipeline_value,
      COALESCE(SUM((amount::numeric * COALESCE(probability, 0)) / 100.0) FILTER (WHERE status = 'open'), 0)::text AS weighted_pipeline
    FROM deals
    WHERE owner_id = ${userId}
      AND deleted_at IS NULL
  `);

  const leadsResult = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM contacts
    WHERE created_by = ${userId}
      AND created_at >= ${dateFrom}
      AND created_at <= ${dateTo}
      AND deleted_at IS NULL
  `);

  const r = asRows<Record<string, unknown>>(result)[0] ?? {};
  const dealsWon = toNumber(r.deals_won);
  const dealsLost = toNumber(r.deals_lost);

  return {
    dealsCreated: toNumber(r.deals_created),
    dealsCreatedValue: toNumber(r.deals_created_value),
    dealsWon,
    revenueWon: toNumber(r.revenue_won),
    dealsLost,
    revenueLost: toNumber(r.revenue_lost),
    openDeals: toNumber(r.open_deals),
    openPipelineValue: toNumber(r.open_pipeline_value),
    weightedPipeline: toNumber(r.weighted_pipeline),
    leadsAdded: toNumber(asRows<{ count: number }>(leadsResult)[0]?.count),
    winRate: dealsWon + dealsLost > 0 ? Math.round((dealsWon / (dealsWon + dealsLost)) * 100) : 0,
  };
}

export async function getConversionMetrics(
  userId: string,
  dateFrom: Date,
  dateTo: Date,
  db: DbClient = defaultDb
): Promise<ConversionMetrics> {
  const result = await db.execute(sql`
    SELECT
      COUNT(DISTINCT dsh.deal_id) FILTER (WHERE ps.name ILIKE '%qualified%')::int AS moved_to_qualified,
      COUNT(DISTINCT dsh.deal_id) FILTER (WHERE ps.name ILIKE '%demo%' OR ps.name ILIKE '%discovery%')::int AS moved_to_demo,
      COUNT(DISTINCT dsh.deal_id) FILTER (WHERE ps.name ILIKE '%proposal%')::int AS moved_to_proposal,
      COUNT(DISTINCT dsh.deal_id) FILTER (WHERE ps.name ILIKE '%negotiation%')::int AS moved_to_negotiation
    FROM deal_stage_history dsh
    JOIN pipeline_stages ps ON ps.id = dsh.to_stage_id
    JOIN deals d ON d.id = dsh.deal_id
    WHERE d.owner_id = ${userId}
      AND dsh.entered_at >= ${dateFrom}
      AND dsh.entered_at <= ${dateTo}
  `);

  const r = asRows<Record<string, unknown>>(result)[0] ?? {};
  const qualified = toNumber(r.moved_to_qualified);
  const demo = toNumber(r.moved_to_demo);
  const proposal = toNumber(r.moved_to_proposal);

  return {
    leadsToQualified: qualified,
    qualifiedToDemo: demo,
    demoToProposal: proposal,
    proposalToNegotiation: toNumber(r.moved_to_negotiation),
    qualificationRate: qualified,
    demoConversionRate: qualified > 0 ? Math.round((demo / qualified) * 100) : 0,
    proposalRate: demo > 0 ? Math.round((proposal / demo) * 100) : 0,
  };
}

export async function getVelocityMetrics(
  userId: string,
  dateFrom: Date,
  dateTo: Date,
  db: DbClient = defaultDb
): Promise<VelocityMetrics> {
  const stageVelocity = await db.execute(sql`
    SELECT
      ps.name AS stage_name,
      COALESCE(AVG(EXTRACT(EPOCH FROM (dsh.exited_at - dsh.entered_at)) / 86400.0), 0)::numeric AS avg_days,
      COUNT(*)::int AS deal_count
    FROM deal_stage_history dsh
    JOIN pipeline_stages ps ON ps.id = dsh.to_stage_id
    JOIN deals d ON d.id = dsh.deal_id
    WHERE d.owner_id = ${userId}
      AND dsh.entered_at >= ${dateFrom}
      AND dsh.entered_at <= ${dateTo}
      AND dsh.exited_at IS NOT NULL
    GROUP BY ps.name
    ORDER BY AVG(EXTRACT(EPOCH FROM (dsh.exited_at - dsh.entered_at))) DESC NULLS LAST
  `);

  const responseTime = await db.execute(sql`
    WITH first_touch AS (
      SELECT c.id, c.created_at, MIN(a.occurred_at) AS first_activity
      FROM contacts c
      LEFT JOIN activities a ON a.contact_id = c.id
        AND a.performed_by = ${userId}
        AND a.deleted_at IS NULL
        AND COALESCE(a.is_automated, false) = false
      WHERE c.created_by = ${userId}
        AND c.created_at >= ${dateFrom}
        AND c.created_at <= ${dateTo}
        AND c.deleted_at IS NULL
      GROUP BY c.id, c.created_at
    )
    SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (first_activity - created_at)) / 3600), 0)::numeric AS avg_first_response_hours
    FROM first_touch
    WHERE first_activity IS NOT NULL
  `);

  return {
    avgDaysPerStage: asRows<{ stage_name: string; avg_days: string | number; deal_count: number }>(stageVelocity).map((row) => ({
      stageName: row.stage_name,
      avgDays: Math.round(toNumber(row.avg_days) * 10) / 10,
      dealCount: toNumber(row.deal_count),
    })),
    avgFirstResponseHours: Math.round(toNumber(asRows<Record<string, unknown>>(responseTime)[0]?.avg_first_response_hours)),
  };
}

export async function getTopDeals(
  userId: string,
  dateFrom: Date,
  dateTo: Date,
  db: DbClient = defaultDb
): Promise<DealSnapshot[]> {
  const result = await db.execute(sql`
    SELECT
      d.id, d.title, COALESCE(d.amount::numeric, 0)::text AS amount, d.status,
      COALESCE(d.probability, 0)::int AS probability,
      d.expected_close_date,
      ps.name AS stage_name,
      co.name AS company_name,
      NULLIF(concat_ws(' ', c.first_name, c.last_name), '') AS contact_name,
      COUNT(a.id)::int AS activity_count,
      MAX(a.occurred_at) AS last_activity_at
    FROM deals d
    LEFT JOIN pipeline_stages ps ON ps.id = d.stage_id
    LEFT JOIN companies co ON co.id = d.company_id
    LEFT JOIN contacts c ON c.id = d.primary_contact_id
    LEFT JOIN activities a ON a.deal_id = d.id
      AND a.deleted_at IS NULL
      AND COALESCE(a.is_automated, false) = false
    WHERE d.owner_id = ${userId}
      AND d.deleted_at IS NULL
      AND (
        d.status = 'open'
        OR (d.status = 'won' AND d.actual_close_date >= ${dateFrom.toISOString().slice(0, 10)})
        OR (d.status = 'lost' AND d.updated_at >= ${dateFrom})
      )
    GROUP BY d.id, d.title, d.amount, d.status, d.probability, d.expected_close_date, ps.name, co.name, c.first_name, c.last_name
    ORDER BY COALESCE(d.amount::numeric, 0) DESC NULLS LAST
    LIMIT 10
  `);

  return asRows<Record<string, unknown>>(result).map((row) => ({
    id: String(row.id),
    title: String(row.title ?? ''),
    amount: toNumber(row.amount),
    status: String(row.status ?? ''),
    probability: toNumber(row.probability),
    expectedCloseDate: row.expected_close_date ? String(row.expected_close_date) : null,
    stageName: row.stage_name ? String(row.stage_name) : null,
    companyName: row.company_name ? String(row.company_name) : null,
    contactName: row.contact_name ? String(row.contact_name) : null,
    activityCount: toNumber(row.activity_count),
    lastActivityAt: row.last_activity_at ? new Date(String(row.last_activity_at)) : null,
  }));
}

export async function getDemoAnalysis(
  userId: string,
  dateFrom: Date,
  dateTo: Date,
  db: DbClient = defaultDb
): Promise<DemoAnalysis> {
  const result = await db.execute(sql`
    SELECT
      call_type,
      COALESCE(outcome, 'unknown') AS outcome,
      COUNT(*)::int AS count,
      COUNT(*) FILTER (WHERE next_action IS NOT NULL)::int AS with_next_action,
      COUNT(*) FILTER (WHERE next_action_date < CURRENT_DATE AND next_action IS NOT NULL)::int AS overdue_follow_ups
    FROM demo_records
    WHERE conducted_by = ${userId}
      AND COALESCE(scheduled_at, created_at) >= ${dateFrom}
      AND COALESCE(scheduled_at, created_at) <= ${dateTo}
    GROUP BY call_type, COALESCE(outcome, 'unknown')
    ORDER BY count DESC
  `);

  const rows = asRows<{ call_type: string; outcome: string; count: number; overdue_follow_ups: number }>(result);
  const byOutcome: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let total = 0;
  let overdueFollowUps = 0;

  for (const row of rows) {
    const count = toNumber(row.count);
    byOutcome[row.outcome] = (byOutcome[row.outcome] ?? 0) + count;
    byType[row.call_type] = (byType[row.call_type] ?? 0) + count;
    total += count;
    overdueFollowUps += toNumber(row.overdue_follow_ups);
  }

  return {
    total,
    byType,
    byOutcome,
    interestedRate: total > 0 ? Math.round(((byOutcome.interested ?? 0) / total) * 100) : 0,
    overdueFollowUps,
  };
}

export async function getActivityFeed(
  userId: string,
  dateFrom: Date,
  dateTo: Date,
  pagination: { limit: number; offset: number },
  db: DbClient = defaultDb
): Promise<ActivityFeedItem[]> {
  const result = await db.execute(sql`
    SELECT
      a.id,
      a.activity_type,
      a.subject,
      a.body,
      a.occurred_at,
      a.call_outcome,
      a.call_duration_seconds,
      a.task_due_date,
      a.task_completed_at,
      c.id AS contact_id,
      NULLIF(concat_ws(' ', c.first_name, c.last_name), '') AS contact_name,
      co.id AS company_id,
      co.name AS company_name,
      d.id AS deal_id,
      d.title AS deal_title,
      dr.outcome AS demo_outcome,
      dr.next_action AS demo_next_action,
      dr.next_action_date AS demo_next_action_date
    FROM activities a
    LEFT JOIN contacts c ON c.id = a.contact_id
    LEFT JOIN companies co ON co.id = COALESCE(a.company_id, c.company_id)
    LEFT JOIN deals d ON d.id = a.deal_id
    LEFT JOIN demo_records dr ON dr.activity_id = a.id
    WHERE a.performed_by = ${userId}
      AND a.occurred_at >= ${dateFrom}
      AND a.occurred_at <= ${dateTo}
      AND COALESCE(a.is_automated, false) = false
      AND a.deleted_at IS NULL
    ORDER BY a.occurred_at DESC
    LIMIT ${pagination.limit}
    OFFSET ${pagination.offset}
  `);

  return asRows<Record<string, unknown>>(result).map((row) => ({
    id: String(row.id),
    activityType: String(row.activity_type ?? ''),
    subject: row.subject ? String(row.subject) : null,
    body: row.body ? String(row.body) : null,
    occurredAt: new Date(String(row.occurred_at)),
    callOutcome: row.call_outcome ? String(row.call_outcome) : null,
    callDurationSeconds: row.call_duration_seconds === null || row.call_duration_seconds === undefined ? null : toNumber(row.call_duration_seconds),
    taskDueDate: row.task_due_date ? String(row.task_due_date) : null,
    taskCompletedAt: row.task_completed_at ? new Date(String(row.task_completed_at)) : null,
    contactId: row.contact_id ? String(row.contact_id) : null,
    contactName: row.contact_name ? String(row.contact_name) : null,
    companyId: row.company_id ? String(row.company_id) : null,
    companyName: row.company_name ? String(row.company_name) : null,
    dealId: row.deal_id ? String(row.deal_id) : null,
    dealTitle: row.deal_title ? String(row.deal_title) : null,
    demoOutcome: row.demo_outcome ? String(row.demo_outcome) : null,
    demoNextAction: row.demo_next_action ? String(row.demo_next_action) : null,
    demoNextActionDate: row.demo_next_action_date ? String(row.demo_next_action_date) : null,
  }));
}

export async function getWeeklyBreakdown(
  userId: string,
  dateFrom: Date,
  dateTo: Date,
  db: DbClient = defaultDb
): Promise<WeeklyBreakdown[]> {
  const result = await db.execute(sql`
    SELECT
      DATE_TRUNC('week', occurred_at AT TIME ZONE 'Asia/Kolkata')::date AS week_start,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE activity_type = 'call')::int AS calls,
      COUNT(*) FILTER (WHERE activity_type IN ('email_sent', 'email_received'))::int AS emails,
      COUNT(*) FILTER (WHERE activity_type = 'meeting')::int AS meetings,
      COUNT(*) FILTER (WHERE activity_type = 'demo')::int AS demos,
      COUNT(DISTINCT contact_id) FILTER (WHERE contact_id IS NOT NULL)::int AS contacts_touched
    FROM activities
    WHERE performed_by = ${userId}
      AND occurred_at >= ${dateFrom}
      AND occurred_at <= ${dateTo}
      AND COALESCE(is_automated, false) = false
      AND deleted_at IS NULL
    GROUP BY DATE_TRUNC('week', occurred_at AT TIME ZONE 'Asia/Kolkata')::date
    ORDER BY week_start ASC
  `);

  return asRows<Record<string, unknown>>(result).map((row) => {
    const weekStart = String(row.week_start);
    const start = new Date(weekStart);
    const end = new Date(start);
    end.setDate(end.getDate() + 4);
    return {
      weekStart,
      label: `${start.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} - ${end.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`,
      total: toNumber(row.total),
      calls: toNumber(row.calls),
      emails: toNumber(row.emails),
      meetings: toNumber(row.meetings),
      demos: toNumber(row.demos),
      contactsTouched: toNumber(row.contacts_touched),
    };
  });
}

export async function getPreviousPeriodData(
  userId: string,
  dateFrom: Date,
  dateTo: Date,
  db: DbClient = defaultDb
): Promise<PeriodComparison> {
  const periodLength = dateTo.getTime() - dateFrom.getTime();
  const prevTo = new Date(dateFrom.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - periodLength);

  const [summary, pipeline] = await Promise.all([
    getActivitySummary(userId, prevFrom, prevTo, db),
    getPipelineContribution(userId, prevFrom, prevTo, db),
  ]);

  return {
    period: { dateFrom: prevFrom, dateTo: prevTo },
    summary,
    pipeline,
  };
}

function generateHighlights(
  summary: ActivitySummary,
  pipeline: PipelineContribution,
  _conversion: ConversionMetrics,
  previous: PeriodComparison,
  demoAnalysis: DemoAnalysis
): string[] {
  const highlights: string[] = [];

  if (summary.avgActivitiesPerDay >= 8) {
    highlights.push(`High activity pace - ${summary.avgActivitiesPerDay} activities/day average`);
  } else if (summary.avgActivitiesPerDay < 3) {
    highlights.push(`Low activity volume - ${summary.avgActivitiesPerDay} activities/day`);
  }

  if (summary.calls.total > 0 && summary.calls.connectionRate >= 60) {
    highlights.push(`Strong call connection rate at ${summary.calls.connectionRate}%`);
  } else if (summary.calls.total > 5 && summary.calls.connectionRate < 30) {
    highlights.push(`Low call connection rate at ${summary.calls.connectionRate}% - consider time of day`);
  }

  if (pipeline.revenueWon > 0) {
    highlights.push(`${formatIndianCurrency(pipeline.revenueWon)} revenue won this period`);
  }

  if (pipeline.winRate >= 50) {
    highlights.push(`Excellent win rate at ${pipeline.winRate}%`);
  }

  const activityChange = summary.totalActivities - previous.summary.totalActivities;
  if (Math.abs(activityChange) > 5) {
    highlights.push(activityChange > 0
      ? `Activity up ${activityChange} vs previous period`
      : `Activity down ${Math.abs(activityChange)} vs previous period`);
  }

  if (demoAnalysis.overdueFollowUps > 0) {
    highlights.push(`${demoAnalysis.overdueFollowUps} demo follow-ups are overdue`);
  }

  if (summary.activeDayPercent < 60) {
    highlights.push(`Active on ${summary.activeDayPercent}% of working days`);
  }

  return highlights.slice(0, 5);
}

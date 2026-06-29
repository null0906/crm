import { and, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { db as defaultDb } from '@/server/db';
import {
  activities,
  automationConfig,
  contacts,
  deals,
  notifications,
  pipelines,
  projects,
  roles,
  telegramUsers,
  users,
} from '@/server/db/schema';
import eventBus from '@/server/lib/event-bus';
import { sendEmail } from '@/server/lib/mailer';
import { writeAuditLog } from './audit.service';
import { createAutomatedActivity } from './activity.service';
import { createNotification } from './notification.service';
import { notifyUser } from './telegram.service';

type DbClient = typeof defaultDb;
type QueryResultLike<T = Record<string, unknown>> = { rows?: T[]; rowCount?: number };

export const automationDefinitions = [
  {
    key: 'lead_score',
    name: 'Lead Score Recalculation',
    description: 'Recalculates contact lead scores from CRM signals.',
    schedule: 'Daily 6 AM',
  },
  {
    key: 'stale_alerts',
    name: 'Stale Prospect Alerts',
    description: 'Creates follow-up tasks when prospects remain stuck in a pipeline stage.',
    schedule: 'Daily 8:30 AM',
  },
  {
    key: 'morning_briefings',
    name: 'Morning Briefings',
    description: 'Sends personalized Telegram briefings to active users.',
    schedule: 'Daily 9 AM',
  },
  {
    key: 'duplicate_detection',
    name: 'Duplicate Detection',
    description: 'Checks new contacts for likely duplicates.',
    schedule: 'On contact create',
  },
  {
    key: 'pipeline_benchmarks',
    name: 'Pipeline Benchmarks',
    description: 'Calculates stage velocity and marks slow prospects.',
    schedule: 'Daily 2 AM',
  },
  {
    key: 'weekly_summary',
    name: 'Weekly Summary',
    description: 'Sends weekly performance summaries to managers.',
    schedule: 'Monday 8 AM',
  },
  {
    key: 'delayed_projects',
    name: 'Delayed Project Detection',
    description: 'Marks overdue delivery prospects as delayed and notifies owners.',
    schedule: 'Daily 8 AM',
  },
] as const;

export type AutomationKey = (typeof automationDefinitions)[number]['key'];

const automationKeys = automationDefinitions.map((automation) => automation.key);
let listenersRegistered = false;

function todayDateString(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function startOfToday(date = new Date()): Date {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function startOfWeek(date = new Date()): Date {
  const value = startOfToday(date);
  const day = value.getDay();
  const offset = day === 0 ? 6 : day - 1;
  value.setDate(value.getDate() - offset);
  return value;
}

function asRows<T>(result: unknown): T[] {
  return ((result as QueryResultLike<T>)?.rows ?? []) as T[];
}

function rowCount(result: unknown): number {
  return (result as QueryResultLike)?.rowCount ?? asRows(result).length;
}

async function ensureAutomationConfig(db: DbClient = defaultDb) {
  await db
    .insert(automationConfig)
    .values(automationKeys.map((key) => ({ key })))
    .onConflictDoNothing();
}

async function isAutomationEnabled(key: AutomationKey, db: DbClient = defaultDb): Promise<boolean> {
  await ensureAutomationConfig(db);
  const [row] = await db
    .select({ isEnabled: automationConfig.isEnabled })
    .from(automationConfig)
    .where(eq(automationConfig.key, key))
    .limit(1);
  return row?.isEnabled ?? true;
}

async function hasRunSince(key: AutomationKey, since: Date, db: DbClient = defaultDb): Promise<boolean> {
  const [row] = await db
    .select({ lastRunAt: automationConfig.lastRunAt })
    .from(automationConfig)
    .where(eq(automationConfig.key, key))
    .limit(1);
  return Boolean(row?.lastRunAt && row.lastRunAt >= since);
}

async function recordAutomationRun(key: AutomationKey, result: string, db: DbClient = defaultDb) {
  await db
    .insert(automationConfig)
    .values({
      key,
      isEnabled: true,
      lastRunAt: new Date(),
      lastRunResult: result,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: automationConfig.key,
      set: {
        lastRunAt: new Date(),
        lastRunResult: result,
        updatedAt: new Date(),
      },
    });
}

export async function listAutomationConfigs(db: DbClient = defaultDb) {
  await ensureAutomationConfig(db);
  const rows = await db.select().from(automationConfig);
  const byKey = new Map(rows.map((row) => [row.key, row]));

  return automationDefinitions.map((definition) => ({
    ...definition,
    isEnabled: byKey.get(definition.key)?.isEnabled ?? true,
    lastRunAt: byKey.get(definition.key)?.lastRunAt ?? null,
    lastRunResult: byKey.get(definition.key)?.lastRunResult ?? null,
  }));
}

export async function updateAutomationEnabled(key: AutomationKey, isEnabled: boolean, db: DbClient = defaultDb) {
  if (!automationKeys.includes(key)) {
    throw new Error('Unknown automation');
  }

  const [row] = await db
    .insert(automationConfig)
    .values({ key, isEnabled, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: automationConfig.key,
      set: { isEnabled, updatedAt: new Date() },
    })
    .returning();

  return row!;
}

export async function recalculateLeadScores(db: DbClient = defaultDb): Promise<{ updated: number }> {
  if (!(await isAutomationEnabled('lead_score', db))) return { updated: 0 };

  const result = await db.execute(sql`
    WITH score_calc AS (
      SELECT
        c.id,
        LEAST(100, GREATEST(0,
          CASE WHEN c.email IS NOT NULL AND c.email <> '' THEN 10 ELSE 0 END +
          CASE WHEN c.phone IS NOT NULL AND c.phone <> '' THEN 5 ELSE 0 END +
          CASE WHEN c.linkedin_url IS NOT NULL AND c.linkedin_url <> '' THEN 5 ELSE 0 END +
          CASE WHEN c.status = 'qualified' THEN 20
               WHEN c.status = 'nurturing' THEN 10 ELSE 0 END +
          CASE WHEN EXISTS (
            SELECT 1 FROM deals d
            WHERE d.primary_contact_id = c.id AND d.status = 'open' AND d.deleted_at IS NULL
          ) THEN 25 ELSE 0 END +
          CASE WHEN EXISTS (
            SELECT 1 FROM deals d
            INNER JOIN pipeline_stages ps ON ps.id = d.stage_id
            WHERE d.primary_contact_id = c.id
              AND d.status = 'open'
              AND d.deleted_at IS NULL
              AND (ps.name ILIKE '%proposal%' OR ps.name ILIKE '%negotiation%')
          ) THEN 15 ELSE 0 END +
          CASE WHEN EXISTS (
            SELECT 1 FROM activities a
            WHERE a.contact_id = c.id
              AND a.deleted_at IS NULL
              AND a.occurred_at > NOW() - INTERVAL '7 days'
          ) THEN 15
          WHEN EXISTS (
            SELECT 1 FROM activities a
            WHERE a.contact_id = c.id
              AND a.deleted_at IS NULL
              AND a.occurred_at > NOW() - INTERVAL '30 days'
          ) THEN 8
          WHEN NOT EXISTS (
            SELECT 1 FROM activities a
            WHERE a.contact_id = c.id
              AND a.deleted_at IS NULL
              AND a.occurred_at > NOW() - INTERVAL '60 days'
          ) THEN -15 ELSE 0 END +
          CASE WHEN EXISTS (
            SELECT 1 FROM contact_tags ct
            JOIN tags t ON t.id = ct.tag_id
            WHERE ct.contact_id = c.id AND t.name ILIKE '%hot%'
          ) THEN 20 ELSE 0 END +
          CASE WHEN c.job_title ILIKE ANY(ARRAY['%ciso%','%cto%','%ceo%','%coo%','%vp%','%director%','%head%'])
          THEN 10 ELSE 0 END +
          CASE WHEN co.company_size IN ('201-500', '501-1000', '1001-5000', '5000+') THEN 5 ELSE 0 END
        ))::int AS new_score
      FROM contacts c
      LEFT JOIN companies co ON co.id = c.company_id
      WHERE c.deleted_at IS NULL
    ),
    updated AS (
      UPDATE contacts c
      SET lead_score = sc.new_score, updated_at = NOW()
      FROM score_calc sc
      WHERE c.id = sc.id AND COALESCE(c.lead_score, 0) != sc.new_score
      RETURNING c.id
    )
    SELECT COUNT(*)::int AS updated_count FROM updated
  `);

  const updated = Number(asRows<{ updated_count: number }>(result)[0]?.updated_count ?? rowCount(result));
  await writeAuditLog({
    action: 'update',
    entityType: 'automation',
    entityName: 'Lead Score Recalculation',
    metadata: { updated },
  });
  await recordAutomationRun('lead_score', `${updated} scores updated`, db);
  return { updated };
}

export async function detectDelayedDeals(db: DbClient = defaultDb): Promise<{ updated: number }> {
  if (!(await isAutomationEnabled('delayed_projects', db))) return { updated: 0 };

  const overdueDeals = await db
    .select({
      id: deals.id,
      title: deals.title,
      ownerId: deals.ownerId,
      companyId: deals.companyId,
    })
    .from(deals)
    .innerJoin(pipelines, eq(pipelines.id, deals.pipelineId))
    .where(and(
      eq(deals.status, 'open'),
      isNull(deals.deletedAt),
      inArray(pipelines.pipelineType, ['active_delivery', 'compliance']),
      sql`${deals.projectEndDate} < CURRENT_DATE`,
      sql`(${deals.isDelayed} = false OR ${deals.isDelayed} IS NULL)`
    ));

  for (const deal of overdueDeals) {
    await db
      .update(deals)
      .set({ isDelayed: true, updatedAt: new Date() })
      .where(eq(deals.id, deal.id));

    if (deal.ownerId) {
      await createNotification({
        userId: deal.ownerId,
        title: 'Project overdue',
        body: `"${deal.title}" has passed its planned end date.`,
        entityType: 'deal',
        entityId: deal.id,
        metadata: { actionUrl: `/deals/${deal.id}`, companyId: deal.companyId },
        type: 'warning',
      });
    }
  }

  await recordAutomationRun('delayed_projects', `${overdueDeals.length} projects marked delayed`, db);
  return { updated: overdueDeals.length };
}

export async function detectDelayedProjects(db: DbClient = defaultDb): Promise<{ updated: number }> {
  if (!(await isAutomationEnabled('delayed_projects', db))) return { updated: 0 };

  const overdueProjects = await db
    .select({
      id: projects.id,
      name: projects.name,
      ownerId: projects.ownerId,
      companyId: projects.companyId,
      endDate: projects.endDate,
      daysOverdue: sql<number>`EXTRACT(DAY FROM NOW() - ${projects.endDate})::int`,
    })
    .from(projects)
    .where(and(
      eq(projects.status, 'active'),
      isNull(projects.deletedAt),
      sql`${projects.endDate} < CURRENT_DATE`,
      sql`(${projects.isDelayed} = false OR ${projects.isDelayed} IS NULL)`
    ));

  for (const project of overdueProjects) {
    await db
      .update(projects)
      .set({ isDelayed: true, updatedAt: new Date() })
      .where(eq(projects.id, project.id));

    if (project.ownerId) {
      await createNotification({
        userId: project.ownerId,
        title: 'Project overdue',
        body: `"${project.name}" is ${project.daysOverdue} days past its planned end date.`,
        entityType: 'project',
        entityId: project.id,
        metadata: { actionUrl: `/projects/${project.id}`, companyId: project.companyId },
        type: 'warning',
      });

      await notifyUser(
        project.ownerId,
        `Project overdue\n\n"${project.name}" is ${project.daysOverdue} days past its end date.\n\n/projects/${project.id}`
      ).catch(() => false);
    }
  }

  await recordAutomationRun('delayed_projects', `${overdueProjects.length} standalone projects marked delayed`, db);
  return { updated: overdueProjects.length };
}

async function staleTaskExists(args: {
  dealId?: string | null;
  contactId?: string | null;
  staleType: string;
  db: DbClient;
}) {
  const conditions = [
    eq(activities.activityType, 'task'),
    isNull(activities.deletedAt),
    isNull(activities.taskCompletedAt),
    sql`${activities.metadata}->>'automationKey' = 'stale_alerts'`,
    sql`${activities.metadata}->>'staleType' = ${args.staleType}`,
  ];

  if (args.dealId) conditions.push(eq(activities.dealId, args.dealId));
  if (args.contactId) conditions.push(eq(activities.contactId, args.contactId));

  const [existing] = await args.db
    .select({ id: activities.id })
    .from(activities)
    .where(and(...conditions))
    .limit(1);

  return Boolean(existing);
}

async function retireLegacyNoActivityTasks(db: DbClient): Promise<number> {
  const retired = await db
    .update(activities)
    .set({ taskCompletedAt: new Date(), updatedAt: new Date() })
    .where(and(
      eq(activities.activityType, 'task'),
      eq(activities.isAutomated, true),
      isNull(activities.deletedAt),
      isNull(activities.taskCompletedAt),
      sql`${activities.metadata}->>'automationKey' = 'stale_alerts'`,
      sql`${activities.metadata}->>'staleType' IN ('deal_no_activity', 'contact_no_activity')`,
    ))
    .returning({ id: activities.id });

  return retired.length;
}

export async function createStaleAlerts(db: DbClient = defaultDb): Promise<{ tasksCreated: number; notificationsSent: number }> {
  const retiredLegacyTasks = await retireLegacyNoActivityTasks(db);

  if (!(await isAutomationEnabled('stale_alerts', db))) {
    return { tasksCreated: 0, notificationsSent: 0 };
  }

  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const taskDueDate = todayDateString(tomorrow);
  let tasksCreated = 0;
  let notificationsSent = 0;

  const stuckDealsResult = await db.execute(sql`
    SELECT d.id, d.title, d.owner_id, ps.name AS stage_name,
           EXTRACT(DAY FROM NOW() - d.stage_entered_at)::int AS days_in_stage
    FROM deals d
    INNER JOIN pipeline_stages ps ON ps.id = d.stage_id
    WHERE d.status = 'open'
      AND d.deleted_at IS NULL
      AND d.owner_id IS NOT NULL
      AND d.stage_entered_at < NOW() - INTERVAL '21 days'
  `);

  for (const deal of asRows<{ id: string; title: string; owner_id: string; stage_name: string; days_in_stage: number }>(stuckDealsResult)) {
    if (await staleTaskExists({ dealId: deal.id, staleType: 'deal_stuck_stage', db })) continue;

    await createAutomatedActivity({
      activityType: 'task',
      subject: `Prospect stuck in ${deal.stage_name} for ${deal.days_in_stage} days`,
      body: 'Automatically created because this prospect has stayed in the same stage longer than expected.',
      dealId: deal.id,
      performedBy: deal.owner_id,
      taskDueDate,
      taskPriority: deal.days_in_stage > 30 ? 'high' : 'medium',
      metadata: { automationKey: 'stale_alerts', staleType: 'deal_stuck_stage' },
    }, db);
    tasksCreated += 1;
  }

  await recordAutomationRun('stale_alerts', `${tasksCreated} stuck-stage tasks created; ${retiredLegacyTasks} legacy no-activity tasks retired`, db);
  return { tasksCreated, notificationsSent };
}

export async function checkForDuplicates(contactId: string, db: DbClient = defaultDb): Promise<{ duplicatesFound: number }> {
  if (!(await isAutomationEnabled('duplicate_detection', db))) return { duplicatesFound: 0 };

  const [contact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);

  if (!contact) return { duplicatesFound: 0 };

  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ');
  const duplicatesResult = await db.execute(sql`
    SELECT id, first_name, last_name, email, company_id, phone,
           similarity(LOWER(first_name || ' ' || last_name), LOWER(${fullName})) AS name_sim
    FROM contacts
    WHERE id != ${contactId}
      AND deleted_at IS NULL
      AND (
        (email = ${contact.email} AND email IS NOT NULL AND ${contact.email} IS NOT NULL)
        OR (
          similarity(LOWER(first_name || ' ' || last_name), LOWER(${fullName})) > 0.85
          AND company_id = ${contact.companyId}
          AND company_id IS NOT NULL
        )
        OR (
          regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = regexp_replace(COALESCE(${contact.phone}, ''), '[^0-9]', '', 'g')
          AND phone IS NOT NULL
          AND ${contact.phone} IS NOT NULL
        )
      )
    LIMIT 5
  `);

  const duplicates = asRows<{ id: string }>(duplicatesResult);
  if (!duplicates.length) {
    await recordAutomationRun('duplicate_detection', 'No duplicates found', db);
    return { duplicatesFound: 0 };
  }

  const ownerId = contact.ownerId ?? contact.createdBy;
  const [existingNotification] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(
      eq(notifications.userId, ownerId),
      eq(notifications.type, 'duplicate_contact'),
      eq(notifications.entityType, 'contact'),
      eq(notifications.entityId, contactId)
    ))
    .limit(1);

  if (!existingNotification) {
    await createNotification({
      userId: ownerId,
      type: 'duplicate_contact',
      title: 'Possible duplicate contact',
      body: `"${fullName}" may already exist in the CRM.`,
      entityType: 'contact',
      entityId: contactId,
      metadata: {
        duplicateIds: duplicates.map((duplicate) => duplicate.id),
        actionUrl: `/contacts/${contactId}?duplicateOf=${duplicates[0]!.id}`,
      },
    }, db);
  }

  await recordAutomationRun('duplicate_detection', `${duplicates.length} duplicate candidates found`, db);
  return { duplicatesFound: duplicates.length };
}

export async function sendMorningBriefings(db: DbClient = defaultDb): Promise<{ sent: number; skipped: boolean }> {
  if (!(await isAutomationEnabled('morning_briefings', db))) return { sent: 0, skipped: true };
  if (await hasRunSince('morning_briefings', startOfToday(), db)) {
    return { sent: 0, skipped: true };
  }

  const activeTelegramUsers = await db
    .select({
      userId: telegramUsers.crmUserId,
      firstName: users.firstName,
    })
    .from(telegramUsers)
    .innerJoin(users, eq(telegramUsers.crmUserId, users.id))
    .where(eq(telegramUsers.isActive, true));

  let sent = 0;
  const today = todayDateString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

  for (const user of activeTelegramUsers) {
    const taskRows = await db
      .select({ subject: activities.subject, taskPriority: activities.taskPriority })
      .from(activities)
      .where(and(
        eq(activities.performedBy, user.userId),
        eq(activities.activityType, 'task'),
        isNull(activities.deletedAt),
        isNull(activities.taskCompletedAt),
        lte(activities.taskDueDate, today)
      ))
      .orderBy(desc(activities.taskPriority), activities.taskDueDate)
      .limit(3);

    const staleDealsResult = await db.execute(sql`
      SELECT d.title, d.amount, MAX(a.occurred_at) AS last_activity_at,
             EXTRACT(DAY FROM NOW() - COALESCE(MAX(a.occurred_at), d.created_at))::int AS days_stale
      FROM deals d
      LEFT JOIN activities a ON a.deal_id = d.id AND a.deleted_at IS NULL
      WHERE d.owner_id = ${user.userId}
        AND d.status = 'open'
        AND d.deleted_at IS NULL
      GROUP BY d.id, d.title, d.amount, d.created_at
      HAVING COALESCE(MAX(a.occurred_at), d.created_at) < ${sevenDaysAgo}
      ORDER BY d.amount DESC NULLS LAST
      LIMIT 5
    `);

    const [newLeadCount] = await db
      .select({ value: sql<number>`COUNT(*)::int` })
      .from(contacts)
      .where(and(
        eq(contacts.ownerId, user.userId),
        eq(contacts.status, 'new'),
        isNull(contacts.deletedAt),
        lte(contacts.createdAt, fortyEightHoursAgo)
      ));

    const focusResult = await db.execute(sql`
      SELECT d.title, d.amount, d.probability, d.expected_close_date, ps.name AS stage_name
      FROM deals d
      INNER JOIN pipeline_stages ps ON ps.id = d.stage_id
      WHERE d.owner_id = ${user.userId}
        AND d.status = 'open'
        AND d.deleted_at IS NULL
      ORDER BY (COALESCE(d.amount, 0)::numeric * COALESCE(d.probability, 0)) DESC,
               d.expected_close_date ASC NULLS LAST
      LIMIT 1
    `);

    const staleDeals = asRows<{ title: string; amount: string | null; days_stale: number }>(staleDealsResult);
    const [focusDeal] = asRows<{ title: string; amount: string | null; probability: number | null; expected_close_date: string | null; stage_name: string }>(focusResult);

    const message = [
      `Good morning ${user.firstName}! Here's your CRM focus for today:`,
      '',
      `Priority tasks (${taskRows.length})`,
      ...(taskRows.length ? taskRows.map((task, index) => `${index + 1}. ${task.subject ?? 'Untitled task'}${task.taskPriority ? ` - ${task.taskPriority}` : ''}`) : ['No overdue or due-today tasks.']),
      '',
      'Prospects needing attention',
      ...(staleDeals.length ? staleDeals.map((deal) => `- ${deal.title} - ${deal.amount ?? 'No value'} - ${deal.days_stale} days no activity`) : ['No stale prospects older than 7 days.']),
      '',
      'New leads to contact',
      `- ${newLeadCount?.value ?? 0} leads assigned to you are still new after 48 hours`,
      '',
      'Prospect to focus on today',
      focusDeal
        ? `${focusDeal.title} - ${focusDeal.amount ?? 'No value'} - ${focusDeal.stage_name} - ${focusDeal.probability ?? 0}% probability`
        : 'No open focus prospect found.',
    ].join('\n');

    if (await notifyUser(user.userId, message)) {
      sent += 1;
    }
  }

  await recordAutomationRun('morning_briefings', `${sent} messages sent`, db);
  return { sent, skipped: false };
}

export async function calculatePipelineBenchmarks(db: DbClient = defaultDb): Promise<{ benchmarksUpdated: number; slowDeals: number }> {
  if (!(await isAutomationEnabled('pipeline_benchmarks', db))) {
    return { benchmarksUpdated: 0, slowDeals: 0 };
  }

  const benchmarkResult = await db.execute(sql`
    WITH stage_samples AS (
      SELECT
        d.pipeline_id,
        h.to_stage_id AS stage_id,
        ROUND(AVG(EXTRACT(EPOCH FROM (h.exited_at - h.entered_at)) / 86400.0)::numeric, 2) AS avg_days,
        COUNT(*)::int AS sample_size
      FROM deal_stage_history h
      INNER JOIN deals d ON d.id = h.deal_id
      WHERE h.exited_at IS NOT NULL
        AND d.deleted_at IS NULL
        AND d.status IN ('won', 'lost', 'abandoned')
        AND COALESCE(d.actual_close_date::timestamp with time zone, d.updated_at) >= NOW() - INTERVAL '90 days'
      GROUP BY d.pipeline_id, h.to_stage_id
    ),
    upserted AS (
      INSERT INTO pipeline_benchmarks (pipeline_id, stage_id, avg_days_in_stage, sample_size, calculated_at)
      SELECT pipeline_id, stage_id, avg_days, sample_size, NOW()
      FROM stage_samples
      ON CONFLICT (pipeline_id, stage_id)
      DO UPDATE SET
        avg_days_in_stage = EXCLUDED.avg_days_in_stage,
        sample_size = EXCLUDED.sample_size,
        calculated_at = NOW()
      RETURNING id
    )
    SELECT COUNT(*)::int AS updated_count FROM upserted
  `);

  const slowUpdateResult = await db.execute(sql`
    WITH slow AS (
      SELECT d.id
      FROM deals d
      INNER JOIN pipeline_benchmarks pb ON pb.pipeline_id = d.pipeline_id AND pb.stage_id = d.stage_id
      WHERE d.status = 'open'
        AND d.deleted_at IS NULL
        AND pb.sample_size >= 2
        AND d.stage_entered_at < NOW() - ((pb.avg_days_in_stage::numeric * 1.5) * INTERVAL '1 day')
    ),
    updated AS (
      UPDATE deals d
      SET is_velocity_slow = EXISTS (SELECT 1 FROM slow WHERE slow.id = d.id),
          updated_at = NOW()
      WHERE d.status = 'open'
        AND d.deleted_at IS NULL
      RETURNING d.is_velocity_slow
    )
    SELECT COUNT(*) FILTER (WHERE is_velocity_slow)::int AS slow_count FROM updated
  `);

  const benchmarksUpdated = Number(asRows<{ updated_count: number }>(benchmarkResult)[0]?.updated_count ?? 0);
  const slowDeals = Number(asRows<{ slow_count: number }>(slowUpdateResult)[0]?.slow_count ?? 0);
  await recordAutomationRun('pipeline_benchmarks', `${benchmarksUpdated} benchmarks updated; ${slowDeals} slow prospects marked`, db);
  return { benchmarksUpdated, slowDeals };
}

export async function sendWeeklySummary(db: DbClient = defaultDb): Promise<{ sent: number; skipped: boolean }> {
  if (!(await isAutomationEnabled('weekly_summary', db))) return { sent: 0, skipped: true };
  if (await hasRunSince('weekly_summary', startOfWeek(), db)) {
    return { sent: 0, skipped: true };
  }

  const since = startOfWeek();
  since.setDate(since.getDate() - 7);
  const until = startOfWeek();

  const statsResult = await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM deals WHERE status = 'won' AND actual_close_date >= ${todayDateString(since)} AND actual_close_date < ${todayDateString(until)}) AS won_count,
      (SELECT COALESCE(SUM(effective_value), 0)::text FROM deals_with_value WHERE status = 'won' AND actual_close_date >= ${todayDateString(since)} AND actual_close_date < ${todayDateString(until)}) AS won_value,
      (SELECT COUNT(*)::int FROM deals WHERE status IN ('lost', 'abandoned') AND actual_close_date >= ${todayDateString(since)} AND actual_close_date < ${todayDateString(until)}) AS lost_count,
      (SELECT COUNT(*)::int FROM contacts WHERE created_at >= ${since} AND created_at < ${until} AND deleted_at IS NULL) AS new_leads,
      (SELECT COUNT(*)::int FROM activities WHERE occurred_at >= ${since} AND occurred_at < ${until} AND deleted_at IS NULL) AS activities_logged
  `);

  const [stats] = asRows<{
    won_count: number;
    won_value: string;
    lost_count: number;
    new_leads: number;
    activities_logged: number;
  }>(statsResult);

  const leaderboardResult = await db.execute(sql`
    SELECT u.first_name, u.last_name, COUNT(a.id)::int AS activity_count
    FROM users u
    LEFT JOIN activities a ON a.performed_by = u.id
      AND a.occurred_at >= ${since}
      AND a.occurred_at < ${until}
      AND a.deleted_at IS NULL
    GROUP BY u.id, u.first_name, u.last_name
    ORDER BY activity_count DESC
    LIMIT 5
  `);

  const leaderboard = asRows<{ first_name: string; last_name: string; activity_count: number }>(leaderboardResult);
  const repPerformanceResult = await db.execute(sql`
    WITH activity_stats AS (
      SELECT
        performed_by AS user_id,
        COUNT(*) FILTER (WHERE activity_type = 'call')::int AS calls,
        COUNT(*) FILTER (WHERE activity_type = 'call' AND call_outcome = 'connected')::int AS connected_calls,
        COUNT(*) FILTER (WHERE activity_type = 'email_sent')::int AS emails,
        COUNT(*) FILTER (WHERE activity_type IN ('meeting', 'demo'))::int AS meetings
      FROM activities
      WHERE occurred_at >= ${since}
        AND occurred_at < ${until}
        AND COALESCE(is_automated, false) = false
        AND deleted_at IS NULL
      GROUP BY performed_by
    ),
    deal_stats AS (
      SELECT
        owner_id AS user_id,
        COALESCE(SUM(effective_value::numeric) FILTER (WHERE updated_at >= ${since} AND updated_at < ${until}), 0)::text AS pipeline_moved,
        COUNT(*) FILTER (
          WHERE status = 'won'
            AND actual_close_date >= ${todayDateString(since)}
            AND actual_close_date < ${todayDateString(until)}
        )::int AS deals_won
      FROM deals_with_value
      WHERE deleted_at IS NULL
      GROUP BY owner_id
    )
    SELECT
      u.id,
      u.first_name,
      u.last_name,
      COALESCE(a.calls, 0)::int AS calls,
      COALESCE(a.connected_calls, 0)::int AS connected_calls,
      COALESCE(a.emails, 0)::int AS emails,
      COALESCE(a.meetings, 0)::int AS meetings,
      COALESCE(d.pipeline_moved, '0') AS pipeline_moved,
      COALESCE(d.deals_won, 0)::int AS deals_won
    FROM users u
    INNER JOIN roles r ON r.id = u.role_id
    LEFT JOIN activity_stats a ON a.user_id = u.id
    LEFT JOIN deal_stats d ON d.user_id = u.id
    WHERE u.status = 'active'
      AND r.slug IN ('sales_rep', 'sales_manager')
    ORDER BY (COALESCE(a.calls, 0) + COALESCE(a.emails, 0) + COALESCE(a.meetings, 0) + COALESCE(d.deals_won, 0)) DESC
    LIMIT 10
  `);
  const repPerformance = asRows<{
    id: string;
    first_name: string;
    last_name: string;
    calls: number;
    connected_calls: number;
    emails: number;
    meetings: number;
    pipeline_moved: string;
    deals_won: number;
  }>(repPerformanceResult);
  const message = [
    `Weekly CRM summary (${todayDateString(since)} to ${todayDateString(until)})`,
    '',
    `Prospects won: ${stats?.won_count ?? 0}`,
    `Won value: ${stats?.won_value ?? '0'}`,
    `Prospects lost: ${stats?.lost_count ?? 0}`,
    `New leads: ${stats?.new_leads ?? 0}`,
    `Activities logged: ${stats?.activities_logged ?? 0}`,
    '',
    'Activity leaderboard',
    ...(leaderboard.length ? leaderboard.map((row, index) => `${index + 1}. ${row.first_name} ${row.last_name} - ${row.activity_count}`) : ['No activity logged last week.']),
    '',
    'Weekly performance by rep',
    ...(repPerformance.length
      ? repPerformance.map((row) => [
          `${row.first_name} ${row.last_name}`,
          `  Calls: ${row.calls} (${row.connected_calls} connected)  Emails: ${row.emails}  Meetings/Demos: ${row.meetings}`,
          `  Pipeline touched: INR ${Number(row.pipeline_moved ?? 0).toLocaleString('en-IN')}  Prospects won: ${row.deals_won}`,
          `  View report: /reports/${row.id}?preset=last_week`,
        ].join('\n'))
      : ['No rep performance data last week.']),
  ].join('\n');

  const recipients = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(inArray(roles.slug, ['sales_manager', 'super_admin', 'admin']));

  let sent = 0;
  for (const recipient of recipients) {
    if (await notifyUser(recipient.id, message)) sent += 1;
  }

  const recipientEmails = recipients.map((recipient) => recipient.email).filter(Boolean);
  if (recipientEmails.length) {
    await sendEmail(
      recipientEmails,
      'Weekly SecComply CRM summary',
      `<pre style="font-family:Arial,sans-serif;white-space:pre-wrap;line-height:1.5;color:#0f172a;">${message.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</pre>`
    );
  }

  await recordAutomationRun('weekly_summary', `Sent to ${recipients.length} users`, db);
  return { sent: recipients.length, skipped: false };
}

export async function runAutomationNow(key: AutomationKey, db: DbClient = defaultDb) {
  switch (key) {
    case 'lead_score':
      return recalculateLeadScores(db);
    case 'stale_alerts':
      return createStaleAlerts(db);
    case 'morning_briefings':
      return sendMorningBriefings(db);
    case 'pipeline_benchmarks':
      return calculatePipelineBenchmarks(db);
    case 'weekly_summary':
      return sendWeeklySummary(db);
    case 'duplicate_detection':
      await recordAutomationRun('duplicate_detection', 'Runs automatically when a contact is created', db);
      return { message: 'Duplicate detection runs when contacts are created.' };
    default:
      throw new Error('Unknown automation');
  }
}

export function registerAutomationEventListeners(db: DbClient = defaultDb) {
  if (listenersRegistered) return;
  listenersRegistered = true;

  eventBus.on('contact.created', async ({ contactId }) => {
    try {
      await checkForDuplicates(contactId, db);
    } catch (error) {
      console.error('[Automation] Duplicate detection failed:', error);
    }
  });
}

import { z } from 'zod';
import { tool, type ToolSet } from 'ai';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db as defaultDb } from '@/server/db';
import { activities, companies, contacts, contactTags, deals, tagCategories, tags, users } from '@/server/db/schema';
import type { SessionUser } from '@/lib/types';

type DbClient = typeof defaultDb;

function getCurrentIstWeekRange(now = new Date()): { start: Date; end: Date } {
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffsetMs);
  const day = istNow.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const mondayIstMidnight = Date.UTC(
    istNow.getUTCFullYear(),
    istNow.getUTCMonth(),
    istNow.getUTCDate() + diffToMonday,
    0, 0, 0, 0
  );
  return {
    start: new Date(mondayIstMidnight - istOffsetMs),
    end: new Date(mondayIstMidnight + 7 * 24 * 60 * 60 * 1000 - istOffsetMs),
  };
}

function getActivityRange(timeframe: 'week' | 'month' | 'all_time'): { start?: Date; end?: Date } {
  if (timeframe === 'week') return getCurrentIstWeekRange();
  if (timeframe === 'month') {
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(Date.now() + istOffsetMs);
    const monthStartIst = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), 1, 0, 0, 0, 0);
    const nextMonthStartIst = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth() + 1, 1, 0, 0, 0, 0);
    return { start: new Date(monthStartIst - istOffsetMs), end: new Date(nextMonthStartIst - istOffsetMs) };
  }
  return {};
}

function formatCurrencyAmount(value: number, currency = 'INR'): string {
  const normalizedCurrency = (currency || 'INR').toUpperCase();
  const locale = normalizedCurrency === 'INR' ? 'en-IN' : 'en-US';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: normalizedCurrency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${normalizedCurrency} ${value.toLocaleString(locale, { maximumFractionDigits: 2 })}`;
  }
}

/**
 * Activity/pipeline-value/tag-search tools query the database directly (there's no existing
 * RBAC-scoped service function for these), so each tool enforces its own authorization rule
 * in code rather than relying on prompt instructions — mirrors the rules previously encoded
 * as regex pre-filters in ai-chat.service.ts, now guaranteed at the tool-result level.
 */
export function createActivityTools(user: SessionUser, db: DbClient = defaultDb): ToolSet {
  return {
    resolve_crm_user: tool({
      description: 'Find team members by name fragment. Call before get_activity_by_person/get_rep_report to resolve a user ID.',
      inputSchema: z.object({ nameQuery: z.string().describe('Name fragment') }),
      execute: async ({ nameQuery }) => {
        const matches = await db
          .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
          .from(users)
          .where(and(
            sql`${users.status} != 'inactive'`,
            or(
              sql`concat_ws(' ', ${users.firstName}, ${users.lastName}) ILIKE ${`%${nameQuery}%`}`,
              ilike(users.firstName, `%${nameQuery}%`),
              ilike(users.lastName, `%${nameQuery}%`)
            )
          ))
          .limit(10);

        return {
          matches: matches.map((match) => ({
            userId: match.id,
            fullName: [match.firstName, match.lastName].filter(Boolean).join(' '),
            email: match.email,
            isCurrentUser: match.id === user.id,
          })),
        };
      },
    }),

    get_activity_by_person: tool({
      description: 'Get logged activity (calls/emails/meetings/notes) for one person. Excludes tasks/automated activity by default. all_time returns a monthly summary. Analysts may only view their own.',
      inputSchema: z.object({
        userId: z.string().uuid().describe('from resolve_crm_user'),
        timeframe: z.enum(['week', 'month', 'all_time']).default('week'),
        includeTasks: z.boolean().default(false),
        includeAutomated: z.boolean().default(false),
      }),
      execute: async ({ userId, timeframe, includeTasks, includeAutomated }) => {
        if (user.role.slug === 'sales_rep' && userId !== user.id) {
          return { forbidden: true, reason: 'Your Analyst role can only view your own activity, not other users’.' };
        }

        const { start, end } = getActivityRange(timeframe);
        const typeFilter = includeTasks ? undefined : sql`${activities.activityType} != 'task'`;
        const automationFilter = includeAutomated ? undefined : sql`COALESCE(${activities.isAutomated}, false) = false`;

        if (timeframe === 'all_time') {
          const rows = await db
            .select({
              monthLabel: sql<string>`to_char(date_trunc('month', ${activities.occurredAt} AT TIME ZONE 'Asia/Kolkata'), 'Mon YYYY')`,
              total: sql<number>`COUNT(*)::int`,
              calls: sql<number>`COUNT(*) FILTER (WHERE ${activities.activityType} = 'call')::int`,
              emails: sql<number>`COUNT(*) FILTER (WHERE ${activities.activityType} IN ('email_sent', 'email_received'))::int`,
              whatsapp: sql<number>`COUNT(*) FILTER (WHERE ${activities.activityType} = 'whatsapp')::int`,
              meetings: sql<number>`COUNT(*) FILTER (WHERE ${activities.activityType} IN ('meeting', 'demo'))::int`,
              notes: sql<number>`COUNT(*) FILTER (WHERE ${activities.activityType} = 'note')::int`,
              tasks: sql<number>`COUNT(*) FILTER (WHERE ${activities.activityType} = 'task')::int`,
            })
            .from(activities)
            .where(and(eq(activities.performedBy, userId), sql`${activities.deletedAt} IS NULL`, typeFilter, automationFilter))
            .groupBy(sql`date_trunc('month', ${activities.occurredAt} AT TIME ZONE 'Asia/Kolkata')`)
            .orderBy(sql`date_trunc('month', ${activities.occurredAt} AT TIME ZONE 'Asia/Kolkata')`);

          return { monthlySummary: rows };
        }

        const rows = await db
          .select({
            activityType: activities.activityType,
            subject: activities.subject,
            occurredAt: activities.occurredAt,
            callOutcome: activities.callOutcome,
            contactName: sql<string | null>`NULLIF(TRIM(CONCAT(${contacts.firstName}, ' ', ${contacts.lastName})), '')`,
            companyName: companies.name,
            prospectTitle: deals.title,
          })
          .from(activities)
          .leftJoin(contacts, eq(activities.contactId, contacts.id))
          .leftJoin(companies, eq(activities.companyId, companies.id))
          .leftJoin(deals, eq(activities.dealId, deals.id))
          .where(and(
            eq(activities.performedBy, userId),
            sql`${activities.deletedAt} IS NULL`,
            start ? sql`${activities.occurredAt} >= ${start}` : undefined,
            end ? sql`${activities.occurredAt} < ${end}` : undefined,
            typeFilter,
            automationFilter
          ))
          .orderBy(desc(activities.occurredAt))
          .limit(25);

        return { activities: rows, count: rows.length, cappedAt25: rows.length === 25 };
      },
    }),

    get_pipeline_value: tool({
      description: 'Total Prospect pipeline value by currency. Forbidden for Analysts.',
      inputSchema: z.object({
        scope: z.enum(['open', 'all']).default('open'),
        pipelineNameContains: z.string().nullish().describe('e.g. "sales"'),
      }),
      execute: async ({ scope, pipelineNameContains }) => {
        if (user.role.slug === 'sales_rep') {
          return { forbidden: true, reason: 'Prospect values are restricted for your Analyst role.' };
        }

        const result = await db.execute(sql`
          SELECT COALESCE(dv.engagement_currency, dv.currency, 'INR') AS currency,
            COUNT(*)::int AS deal_count,
            COALESCE(SUM(dv.effective_value), 0)::text AS total_value
          FROM deals_with_value dv
          JOIN pipelines p ON p.id = dv.pipeline_id
          WHERE dv.deleted_at IS NULL
            ${scope === 'open' ? sql`AND dv.status = 'open'` : sql``}
            ${pipelineNameContains ? sql`AND p.name ILIKE ${`%${pipelineNameContains}%`}` : sql``}
          GROUP BY COALESCE(dv.engagement_currency, dv.currency, 'INR')
        `);
        const rawRows = Array.isArray(result) ? result : ((result as unknown as { rows?: unknown[] }).rows ?? []);
        const rows = (rawRows as Array<{ currency: string; deal_count: number; total_value: string }>);

        const byCurrency = rows.map((row) => ({
          currency: row.currency,
          dealCount: row.deal_count,
          totalValue: row.total_value,
          formatted: formatCurrencyAmount(Number(row.total_value ?? 0), row.currency),
        }));

        return {
          scope,
          totalDealCount: rows.reduce((sum, row) => sum + Number(row.deal_count ?? 0), 0),
          byCurrency,
        };
      },
    }),

    search_tags: tool({
      description: 'Search tags (event names, source labels) by keyword with usage counts. Use to disambiguate a named event/tag.',
      inputSchema: z.object({ keyword: z.string() }),
      execute: async ({ keyword }) => {
        const matches = await db
          .select({
            id: tags.id,
            label: tags.name,
            category: tagCategories.name,
            count: sql<number>`COUNT(${contactTags.contactId})::int`,
          })
          .from(tags)
          .leftJoin(tagCategories, eq(tags.categoryId, tagCategories.id))
          .leftJoin(contactTags, eq(contactTags.tagId, tags.id))
          .where(or(ilike(tagCategories.name, `%${keyword}%`), ilike(tags.name, `%${keyword}%`)))
          .groupBy(tags.id, tags.name, tagCategories.name)
          .orderBy(desc(sql<number>`COUNT(${contactTags.contactId})`))
          .limit(10);

        return { matches, count: matches.length };
      },
    }),
  };
}

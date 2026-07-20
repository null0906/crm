import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { asc, eq, sql } from 'drizzle-orm';
import { router, protectedProcedure } from '../router';
import { activities, users, roles } from '@/server/db/schema';
import { buildRepReport, describeReportFilters, getActivityFeed, getRepProfile, type ReportFilters } from '@/server/services/report.service';
import { generateReportPDF } from '@/server/lib/report-pdf';
import { hasPermission } from '@/server/lib/permissions';
import { writeAuditLog } from '@/server/services/audit.service';
import { canViewTeamReports, assertReportAccess } from '@/server/services/report-access';

const presets = ['this_week', 'last_week', 'this_month', 'last_month', 'this_quarter', 'last_quarter', 'till_date', 'custom'] as const;
type ReportPreset = (typeof presets)[number];
const presetSchema = z.string().default('this_month').transform((value) => {
  return (presets as readonly string[]).includes(value) ? (value as ReportPreset) : 'this_month';
});
const reportFiltersSchema = z.object({
  activityTypes: z.array(z.string()).optional(),
  callOutcomes: z.array(z.string()).optional(),
  demoOutcomes: z.array(z.string()).optional(),
  taskPriorities: z.array(z.string()).optional(),
  tags: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    color: z.string().nullable().optional(),
  })).optional(),
  location: z.string().optional(),
  search: z.string().optional(),
}).optional().transform((filters): ReportFilters | undefined => {
  if (!filters) return undefined;
  return {
    activityTypes: filters.activityTypes,
    callOutcomes: filters.callOutcomes,
    demoOutcomes: filters.demoOutcomes,
    taskPriorities: filters.taskPriorities,
    tagIds: filters.tags?.map((tag) => tag.id),
    tagNames: filters.tags?.map((tag) => tag.name),
    location: filters.location,
    search: filters.search,
  };
});

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function getDateRange(preset: string): { dateFrom: Date; dateTo: Date } {
  const now = new Date();
  const today = startOfToday();

  switch (preset) {
    case 'this_week': {
      const weekStart = new Date(today);
      const day = today.getDay();
      weekStart.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
      return { dateFrom: weekStart, dateTo: now };
    }
    case 'last_week': {
      const lastWeekEnd = new Date(today);
      const day = today.getDay();
      lastWeekEnd.setDate(today.getDate() - (day === 0 ? 7 : day));
      lastWeekEnd.setHours(23, 59, 59, 999);
      const lastWeekStart = new Date(lastWeekEnd);
      lastWeekStart.setDate(lastWeekEnd.getDate() - 6);
      lastWeekStart.setHours(0, 0, 0, 0);
      return { dateFrom: lastWeekStart, dateTo: lastWeekEnd };
    }
    case 'this_month':
      return { dateFrom: new Date(now.getFullYear(), now.getMonth(), 1), dateTo: now };
    case 'last_month':
      return {
        dateFrom: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        dateTo: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
      };
    case 'this_quarter': {
      const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
      return { dateFrom: new Date(now.getFullYear(), quarterMonth, 1), dateTo: now };
    }
    case 'last_quarter': {
      const currentQuarterMonth = Math.floor(now.getMonth() / 3) * 3;
      const previousQuarterMonth = currentQuarterMonth - 3;
      return {
        dateFrom: new Date(now.getFullYear(), previousQuarterMonth, 1),
        dateTo: new Date(now.getFullYear(), previousQuarterMonth + 3, 0, 23, 59, 59, 999),
      };
    }
    case 'till_date':
      return { dateFrom: new Date(2000, 0, 1), dateTo: now };
    default:
      return { dateFrom: new Date(now.getTime() - 30 * 86400000), dateTo: now };
  }
}

async function getFirstActivityDate(userId: string, db: typeof import('@/server/db').db): Promise<Date | null> {
  const [row] = await db
    .select({
      firstActivityAt: sql<Date | null>`MIN(${activities.occurredAt})`,
    })
    .from(activities)
    .where(sql`
      ${activities.performedBy} = ${userId}
      AND ${activities.deletedAt} IS NULL
      AND COALESCE(${activities.isAutomated}, false) = false
    `)
    .limit(1);

  return row?.firstActivityAt ? new Date(row.firstActivityAt) : null;
}

async function resolveInputRange(input: { preset: ReportPreset; dateFrom?: string; dateTo?: string }, userId: string, db: typeof import('@/server/db').db) {
  if (input.preset === 'custom') {
    if (!input.dateFrom || !input.dateTo) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Custom reports require both dates.' });
    }
    return { dateFrom: new Date(input.dateFrom), dateTo: new Date(input.dateTo) };
  }

  if (input.preset === 'till_date') {
    const dateFrom = await getFirstActivityDate(userId, db);
    return { dateFrom: dateFrom ?? new Date(), dateTo: new Date() };
  }

  return getDateRange(input.preset);
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function buildActivityFeedCsv(items: Awaited<ReturnType<typeof getActivityFeed>>, filters: string[]): string {
  const headers = [
    'Occurred At',
    'Type',
    'Subject',
    'Body',
    'Call Outcome',
    'Call Duration Seconds',
    'Contact',
    'Company',
    'Prospect',
    'Demo Outcome',
    'Demo Next Action',
    'Demo Next Action Date',
  ];

  const rows = items.map((item) => [
    item.occurredAt instanceof Date ? item.occurredAt.toISOString() : String(item.occurredAt ?? ''),
    item.activityType,
    item.subject,
    item.body,
    item.callOutcome,
    item.callDurationSeconds,
    item.contactName,
    item.companyName,
    item.dealTitle,
    item.demoOutcome,
    item.demoNextAction,
    item.demoNextActionDate,
  ]);

  const filterRows = filters.length
    ? [
        ['Applied Filters'],
        ...filters.map((filter) => [filter]),
        [],
      ].map((row) => row.map(csvCell).join(','))
    : [];

  return [
    ...filterRows,
    headers.map(csvCell).join(','),
    ...rows.map((row) => row.map(csvCell).join(',')),
  ].join('\n');
}

export const reportsRouter = router({
  getRepReport: protectedProcedure
    .input(z.object({
      userId: z.string().uuid(),
      preset: presetSchema,
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      filters: reportFiltersSchema,
    }))
    .query(async ({ ctx, input }) => {
      assertReportAccess(ctx.user, input.userId);
      const { dateFrom, dateTo } = await resolveInputRange(input, input.userId, ctx.db);
      return buildRepReport({
        userId: input.userId,
        dateFrom,
        dateTo,
        requestedBy: ctx.user.id,
        filters: input.filters,
        suppressDealAmounts: ctx.user.role.slug === 'sales_rep',
      });
    }),

  getActivityFeed: protectedProcedure
    .input(z.object({
      userId: z.string().uuid(),
      preset: presetSchema,
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      filters: reportFiltersSchema,
      offset: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(60).default(30),
    }))
    .query(async ({ ctx, input }) => {
      assertReportAccess(ctx.user, input.userId);
      const { dateFrom, dateTo } = await resolveInputRange(input, input.userId, ctx.db);
      return getActivityFeed(input.userId, dateFrom, dateTo, {
        offset: input.offset,
        limit: input.limit,
      }, input.filters);
    }),

  getReportableUsers: protectedProcedure
    .query(async ({ ctx }) => {
      if (!canViewTeamReports(ctx.user)) {
        return [{
          id: ctx.user.id,
          firstName: ctx.user.firstName,
          lastName: ctx.user.lastName,
          email: ctx.user.email,
          avatarUrl: ctx.user.avatarUrl ?? null,
          role: { name: ctx.user.role.name, slug: ctx.user.role.slug },
        }];
      }

      return ctx.db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          avatarUrl: users.avatarUrl,
          role: {
            name: roles.name,
            slug: roles.slug,
          },
        })
        .from(users)
        .innerJoin(roles, eq(users.roleId, roles.id))
        .where(eq(users.status, 'active'))
        .orderBy(asc(users.firstName), asc(users.lastName));
    }),

  exportRepReport: protectedProcedure
    .input(z.object({
      userId: z.string().uuid(),
      preset: presetSchema,
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      filters: reportFiltersSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      assertReportAccess(ctx.user, input.userId);
      if (!hasPermission(ctx.user.role.permissions, 'reports', 'export') && input.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have report export permission.' });
      }

      const { dateFrom, dateTo } = await resolveInputRange(input, input.userId, ctx.db);
      const reportData = await buildRepReport({
        userId: input.userId,
        dateFrom,
        dateTo,
        requestedBy: ctx.user.id,
        activityLimit: 500,
        filters: input.filters,
        suppressDealAmounts: ctx.user.role.slug === 'sales_rep',
      });

      const pdfBuffer = await generateReportPDF(reportData);
      const filename = `report-${reportData.rep.name.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.pdf`;

      return {
        filename,
        url: `data:application/pdf;base64,${pdfBuffer.toString('base64')}`,
      };
    }),

  exportActivityFeed: protectedProcedure
    .input(z.object({
      userId: z.string().uuid(),
      preset: presetSchema,
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      filters: reportFiltersSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      assertReportAccess(ctx.user, input.userId);
      if (!hasPermission(ctx.user.role.permissions, 'reports', 'export') && input.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have report export permission.' });
      }

      const { dateFrom, dateTo } = await resolveInputRange(input, input.userId, ctx.db);
      const [rep, items] = await Promise.all([
        getRepProfile(input.userId),
        getActivityFeed(input.userId, dateFrom, dateTo, { offset: 0, limit: 10000 }, input.filters),
      ]);

      await writeAuditLog({
        userId: ctx.user.id,
        action: 'report_generated',
        entityType: 'user',
        entityId: input.userId,
        metadata: {
          reportType: 'activity_feed_csv',
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString(),
          filters: input.filters,
          rowCount: items.length,
        },
      });

      const csv = buildActivityFeedCsv(items, describeReportFilters(input.filters));
      const filename = `activity-feed-${rep.name.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`;

      return {
        filename,
        url: `data:text/csv;base64,${Buffer.from(csv, 'utf8').toString('base64')}`,
        rowCount: items.length,
      };
    }),
});

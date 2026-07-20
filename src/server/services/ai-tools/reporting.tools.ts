import { z } from 'zod';
import { tool, type ToolSet } from 'ai';
import type { SessionUser } from '@/lib/types';
import { buildRepReport } from '@/server/services/report.service';
import { assertReportAccess } from '@/server/services/report-access';
import { requireExecutiveAccess, getExecutiveSummary, getExecutiveMemberDetail } from '@/server/services/executive-overview.service';

const presets = ['this_week', 'last_week', 'this_month', 'last_month', 'this_quarter', 'last_quarter', 'custom'] as const;

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Same preset semantics as reports.router.ts's getDateRange, duplicated here so this tool
 * file has no dependency on the tRPC router layer. */
function resolveDateRange(preset: (typeof presets)[number], dateFrom?: string, dateTo?: string): { dateFrom: Date; dateTo: Date } {
  const now = new Date();
  const today = startOfToday();

  if (preset === 'custom') {
    if (!dateFrom || !dateTo) return { dateFrom: new Date(now.getTime() - 30 * 86400000), dateTo: now };
    return { dateFrom: new Date(dateFrom), dateTo: new Date(dateTo) };
  }

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
    default:
      return { dateFrom: new Date(now.getTime() - 30 * 86400000), dateTo: now };
  }
}

/**
 * Reporting tools reuse assertReportAccess/requireExecutiveAccess — the literal same
 * functions the reports/executive-overview tRPC routers enforce — but return a structured
 * {forbidden: true} result instead of throwing, so a denial becomes a normal tool result the
 * model explains to the user rather than an exception that aborts the whole agent turn.
 */
export function createReportingTools(user: SessionUser): ToolSet {
  return {
    get_rep_report: tool({
      description: 'Performance report for one user: activity summary, pipeline contribution, conversion, top prospects, highlights. Omit userId for the caller\'s own. Access to other users\' reports follows the same reports.view permission as the in-app Reports page (not necessarily manager-only — depends on role config).',
      inputSchema: z.object({
        userId: z.string().uuid().nullish().describe('defaults to caller'),
        preset: z.enum(presets).default('this_month'),
        dateFrom: z.string().nullish().describe('ISO date, only for preset "custom"'),
        dateTo: z.string().nullish().describe('ISO date, only for preset "custom"'),
      }),
      execute: async ({ userId, preset, dateFrom, dateTo }) => {
        const targetUserId = userId ?? user.id;
        try {
          assertReportAccess(user, targetUserId);
        } catch {
          return { forbidden: true, reason: 'You can only view your own report.' };
        }

        const range = resolveDateRange(preset, dateFrom ?? undefined, dateTo ?? undefined);
        const report = await buildRepReport({
          userId: targetUserId,
          dateFrom: range.dateFrom,
          dateTo: range.dateTo,
          requestedBy: user.id,
          suppressDealAmounts: user.role.slug === 'sales_rep',
        });

        // Trimmed to the fields that matter for a conversational answer — the full report
        // (weekly breakdown, full activity feed, demo analysis, period comparison) is still
        // available in the app at /reports/:userId; including all of it here risks pushing a
        // single tool result past Groq's per-minute token budget on this plan.
        return {
          rep: report.rep,
          period: report.period,
          summary: report.summary,
          pipeline: report.pipeline,
          conversion: report.conversion,
          topDeals: report.topDeals.slice(0, 5),
          highlights: report.highlights,
          appliedFilters: report.appliedFilters,
          monetaryValuesHidden: report.monetaryValuesHidden,
          fullReportUrl: `/reports/${targetUserId}?preset=${preset}`,
        };
      },
    }),

    get_executive_overview_summary: tool({
      description: 'Company-wide snapshot: active projects near deadline, hot prospects, recently completed projects, per-member counts. Super admin only.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          requireExecutiveAccess(user.role.slug);
        } catch {
          return { forbidden: true, reason: 'Executive overview is restricted to super admins.' };
        }
        const summary = await getExecutiveSummary();
        // totals reflect the true counts even though the sample below is capped, to keep this
        // tool result well under Groq's per-minute token budget.
        return {
          totals: summary.totals,
          activeProjects: summary.activeProjects.slice(0, 15),
          hotProspects: summary.hotProspects.slice(0, 15),
          completedProjects: summary.completedProjects.slice(0, 10),
          members: summary.members,
        };
      },
    }),

    get_executive_member_detail: tool({
      description: 'One team member\'s open prospects, projects, and recent activity. Super admin only.',
      inputSchema: z.object({ memberId: z.string().uuid() }),
      execute: async ({ memberId }) => {
        try {
          requireExecutiveAccess(user.role.slug);
        } catch {
          return { forbidden: true, reason: 'Executive overview is restricted to super admins.' };
        }
        const detail = await getExecutiveMemberDetail(memberId);
        return detail ?? { found: false, reason: 'No team member with that ID.' };
      },
    }),
  };
}

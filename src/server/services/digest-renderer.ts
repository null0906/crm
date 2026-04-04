/**
 * Renders dashboard digest as HTML email and Telegram plain text.
 */

import { db } from '@/server/db';
import { dashboards, dashboardWidgets, deals, contacts, activities, users } from '@/server/db/schema';
import { eq, and, isNull, count, sql, gte, desc } from 'drizzle-orm';

const MAX_TG_CHARS = 4096;

interface WidgetRow {
  id: string;
  widgetType: string;
  title: string;
  subtitle: string | null;
  config: unknown;
}

// ── Data fetchers ─────────────────────────────────────────────────────────────

async function fetchMetricData(config: Record<string, unknown>): Promise<{ value: number | string; label: string }> {
  const metric = (config.metric as string) ?? '';

  if (metric === 'open_deals_count' || metric === 'pipeline_value') {
    const [row] = await db
      .select({ count: count(), total: sql<string>`COALESCE(SUM(CAST(amount AS NUMERIC)),0)` })
      .from(deals)
      .where(and(eq(deals.status, 'open'), isNull(deals.deletedAt)));
    if (metric === 'open_deals_count') return { value: row?.count ?? 0, label: 'Open Deals' };
    const v = parseFloat(row?.total ?? '0');
    return { value: formatCurrency(v), label: 'Pipeline Value' };
  }

  if (metric === 'contacts_total') {
    const [row] = await db.select({ count: count() }).from(contacts).where(isNull(contacts.deletedAt));
    return { value: row?.count ?? 0, label: 'Total Contacts' };
  }

  if (metric === 'activities_today') {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [row] = await db.select({ count: count() }).from(activities).where(and(isNull(activities.deletedAt), gte(activities.occurredAt, todayStart)));
    return { value: row?.count ?? 0, label: 'Activities Today' };
  }

  return { value: '—', label: config.label as string ?? metric };
}

async function fetchLeaderboard(): Promise<Array<{ name: string; count: number }>> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      firstName: users.firstName,
      lastName: users.lastName,
      count: count(),
    })
    .from(activities)
    .innerJoin(users, eq(activities.performedBy, users.id))
    .where(and(isNull(activities.deletedAt), gte(activities.occurredAt, weekAgo)))
    .groupBy(users.id, users.firstName, users.lastName)
    .orderBy(desc(count()))
    .limit(5);

  return rows.map((r) => ({ name: `${r.firstName} ${r.lastName}`, count: Number(r.count) }));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)}Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)}L`;
  return `₹${value.toLocaleString('en-IN')}`;
}

// ── HTML email renderer ───────────────────────────────────────────────────────

export async function renderDigestEmail(dashboardId: string): Promise<{ subject: string; html: string }> {
  const [dashboard] = await db
    .select({ id: dashboards.id, name: dashboards.name })
    .from(dashboards)
    .where(eq(dashboards.id, dashboardId))
    .limit(1);

  if (!dashboard) throw new Error(`Dashboard ${dashboardId} not found`);

  const widgets = await db
    .select({ id: dashboardWidgets.id, widgetType: dashboardWidgets.widgetType, title: dashboardWidgets.title, subtitle: dashboardWidgets.subtitle, config: dashboardWidgets.config })
    .from(dashboardWidgets)
    .where(eq(dashboardWidgets.dashboardId, dashboardId));

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const appUrl = process.env.NEXTAUTH_URL ?? 'https://app.seccomply.net';

  let widgetsHtml = '';

  for (const widget of widgets) {
    const config = (widget.config as Record<string, unknown>) ?? {};
    let widgetHtml = '';

    if (widget.widgetType === 'metric_card') {
      const { value, label } = await fetchMetricData(config);
      widgetHtml = `
        <td style="width:50%;padding:8px;vertical-align:top;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
            <tr><td style="padding:20px;text-align:center;">
              <div style="font-size:32px;font-weight:700;color:#1e293b;">${value}</div>
              <div style="font-size:14px;color:#64748b;margin-top:4px;">${label}</div>
            </td></tr>
          </table>
        </td>`;
    } else if (widget.widgetType === 'leaderboard') {
      const leaders = await fetchLeaderboard();
      const rows = leaders.map((l, i) =>
        `<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 12px;color:#64748b;">${i + 1}</td><td style="padding:8px 12px;color:#1e293b;">${l.name}</td><td style="padding:8px 12px;text-align:right;font-weight:600;color:#3b82f6;">${l.count}</td></tr>`
      ).join('');
      widgetHtml = `
        <td style="width:100%;padding:8px;vertical-align:top;" colspan="2">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
            <tr><td style="padding:16px 20px;border-bottom:1px solid #e2e8f0;">
              <span style="font-size:15px;font-weight:600;color:#1e293b;">${widget.title}</span>
            </td></tr>
            <tr><td style="padding:0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr style="background:#f1f5f9;"><th style="padding:8px 12px;text-align:left;font-size:12px;color:#64748b;">#</th><th style="padding:8px 12px;text-align:left;font-size:12px;color:#64748b;">Name</th><th style="padding:8px 12px;text-align:right;font-size:12px;color:#64748b;">Activities</th></tr>
                ${rows}
              </table>
            </td></tr>
          </table>
        </td>`;
    }

    widgetsHtml += `<tr>${widgetHtml}</tr>`;
  }

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <!-- Header -->
        <tr><td style="background:#1e3a5f;border-radius:12px 12px 0 0;padding:24px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td><span style="font-size:20px;font-weight:700;color:#fff;">SecComply</span><span style="font-size:14px;color:#93c5fd;margin-left:8px;">Command Center</span></td>
              <td align="right"><span style="font-size:12px;color:#93c5fd;">${dateStr}</span></td>
            </tr>
          </table>
          <div style="margin-top:8px;font-size:24px;font-weight:600;color:#fff;">${dashboard.name}</div>
        </td></tr>
        <!-- Widgets -->
        <tr><td style="background:#fff;padding:24px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${widgetsHtml}
          </table>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;border-radius:0 0 12px 12px;padding:20px 32px;text-align:center;">
          <a href="${appUrl}/dashboard" style="display:inline-block;padding:10px 24px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">View Live Dashboard</a>
          <p style="margin:12px 0 0;font-size:12px;color:#94a3b8;">This is an automated digest from SecComply CRM</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject: `${dashboard.name} — ${dateStr}`, html };
}

// ── Telegram text renderer ─────────────────────────────────────────────────────

export async function renderDigestTelegram(dashboardId: string): Promise<string> {
  const [dashboard] = await db
    .select({ id: dashboards.id, name: dashboards.name })
    .from(dashboards)
    .where(eq(dashboards.id, dashboardId))
    .limit(1);

  if (!dashboard) return `❌ Dashboard not found`;

  const widgets = await db
    .select({ id: dashboardWidgets.id, widgetType: dashboardWidgets.widgetType, title: dashboardWidgets.title, config: dashboardWidgets.config })
    .from(dashboardWidgets)
    .where(eq(dashboardWidgets.dashboardId, dashboardId));

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

  const lines: string[] = [
    `📊 *${dashboard.name}*`,
    `📅 ${dateStr}`,
    '',
  ];

  for (const widget of widgets) {
    const config = (widget.config as Record<string, unknown>) ?? {};

    if (widget.widgetType === 'metric_card') {
      const { value, label } = await fetchMetricData(config);
      lines.push(`*${label}:* ${value}`);
    } else if (widget.widgetType === 'leaderboard') {
      const leaders = await fetchLeaderboard();
      lines.push(`\n🏆 *${widget.title}*`);
      leaders.forEach((l, i) => lines.push(`  ${i + 1}. ${l.name} — ${l.count} activities`));
    }
  }

  let text = lines.join('\n');

  if (text.length > MAX_TG_CHARS) {
    text = text.slice(0, MAX_TG_CHARS - 30) + '\n\n_(digest truncated)_';
  }

  return text;
}

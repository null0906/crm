'use client';

import React from 'react';
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LabelList, LineChart, Line,
} from 'recharts';
import { trpc } from '@/lib/trpc';
import { formatCurrency, formatRelative } from '@/lib/formatters';
import {
  TrendingUp, Users, Building2, Activity, Phone, Mail, MessageSquare,
  Target, DollarSign, Award, BarChart2, Calendar, CheckCircle,
} from 'lucide-react';
import type { DashboardDataSource, WidgetType } from '@/lib/types';

export interface DashboardFilter {
  dateFrom?: string;  // ISO date string
  dateTo?: string;
  status?: string;    // deal status filter
}

interface Widget {
  id: string;
  widgetType: string;
  title: string;
  subtitle: string | null;
  color: string | null;
  config: Record<string, unknown>;
}

// ─── Palettes ─────────────────────────────────────────────────────
const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899'];
const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316'];

const ACTIVITY_STYLE: Record<string, { color: string; bg: string }> = {
  call:            { color: '#3b82f6', bg: '#eff6ff' },
  email_sent:      { color: '#10b981', bg: '#ecfdf5' },
  email_received:  { color: '#8b5cf6', bg: '#f5f3ff' },
  meeting:         { color: '#f59e0b', bg: '#fffbeb' },
  note:            { color: '#06b6d4', bg: '#ecfeff' },
  task:            { color: '#ec4899', bg: '#fdf2f8' },
  stage_change:    { color: '#64748b', bg: '#f8fafc' },
};

const STATUS_LABEL: Record<string, string> = {
  new: 'New', contacted: 'Contacted', qualified: 'Qualified',
  unqualified: 'Unqualified', nurturing: 'Nurturing',
  converted: 'Converted', lost: 'Lost', archived: 'Archived',
};

// ─── Source helpers ────────────────────────────────────────────────
function getWidgetSource(widget: Widget): DashboardDataSource {
  const s = widget.config?.sourceContext;
  return s === 'partner' || s === 'enterprise' ? s : 'client';
}

function isCompanyInSource(company: Record<string, unknown>, source: DashboardDataSource): boolean {
  const companyType = company.companyType as string | null;
  const companySize = company.companySize as string | null;
  if (source === 'partner') return companyType === 'partner';
  if (source === 'enterprise') return companySize === '1001-5000' || companySize === '5000+';
  // client = everything except specifically-typed partner accounts
  return companyType !== 'partner';
}

function resolvePipelineForSource(
  pipelines: Array<Record<string, unknown>>,
  source: DashboardDataSource,
): Record<string, unknown> | undefined {
  const keywords = source === 'partner' ? ['partner'] : source === 'enterprise' ? ['enterprise'] : ['sales', 'client', 'main'];
  return (
    pipelines.find((p) => keywords.some((k) => String(p.name ?? '').toLowerCase().includes(k))) ??
    pipelines[0]
  );
}

function filterDealsBySource(
  deals: Array<Record<string, unknown>>,
  pipelines: Array<Record<string, unknown>>,
  source: DashboardDataSource,
): Array<Record<string, unknown>> {
  const pipeline = resolvePipelineForSource(pipelines, source);
  if (!pipeline?.id) return deals;
  return deals.filter((d) => String(d.pipelineId ?? '') === String(pipeline.id));
}

function filterContactsBySource(
  contacts: Array<Record<string, unknown>>,
  companies: Array<Record<string, unknown>>,
  source: DashboardDataSource,
): Array<Record<string, unknown>> {
  if (source === 'client') return contacts; // all contacts for default view
  const ids = new Set(companies.filter((c) => isCompanyInSource(c, source)).map((c) => String(c.id)));
  const names = new Set(companies.filter((c) => isCompanyInSource(c, source)).map((c) => String(c.name)));
  return contacts.filter((r) => {
    if (r.companyId && ids.has(String(r.companyId))) return true;
    if (r.companyName && names.has(String(r.companyName))) return true;
    return false;
  });
}

// ─── Dashboard filter helper ──────────────────────────────────────
function applyDealFilter(
  deals: Array<Record<string, unknown>>,
  filter?: DashboardFilter,
): Array<Record<string, unknown>> {
  if (!filter) return deals;
  return deals.filter((d) => {
    if (filter.status && d.status !== filter.status) return false;
    if (filter.dateFrom) {
      const at = new Date(d.createdAt as string);
      if (at < new Date(filter.dateFrom)) return false;
    }
    if (filter.dateTo) {
      const at = new Date(d.createdAt as string);
      const to = new Date(filter.dateTo);
      to.setHours(23, 59, 59, 999);
      if (at > to) return false;
    }
    return true;
  });
}

// ─── Monthly data builder ──────────────────────────────────────────
function buildMonthly(deals: Array<Record<string, unknown>>) {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const start = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const end   = new Date(now.getFullYear(), now.getMonth() - (5 - i) + 1, 0, 23, 59, 59);
    const slice = deals.filter((d) => { const at = new Date(d.createdAt as string); return at >= start && at <= end; });
    return {
      month: start.toLocaleString('default', { month: 'short' }),
      revenue: slice.filter((d) => d.status === 'won').reduce((s, d) => s + (parseFloat(d.amount as string) || 0), 0),
      pipeline: slice.reduce((s, d) => s + (parseFloat(d.amount as string) || 0), 0),
      count: slice.length,
    };
  });
}

// ─── Custom dark tooltip ───────────────────────────────────────────
function DarkTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number | string; name: string; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl border border-slate-700/60">
      {label && <p className="font-medium mb-1.5 text-slate-300">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-1.5 leading-5">
          <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: p.color }} />
          <span className="text-slate-400">{p.name}:</span>
          <span className="font-semibold ml-0.5">
            {typeof p.value === 'number' && p.value > 1000 ? formatCurrency(p.value) : p.value}
          </span>
        </p>
      ))}
    </div>
  );
}

// ─── Empty / error state ───────────────────────────────────────────
function WidgetEmpty({ title, message }: { title: string; message: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-4">
      <p className="text-[13px] font-medium text-slate-600">{title}</p>
      <p className="text-xs text-slate-400 mt-1">{message}</p>
    </div>
  );
}

// ─── Metric icon picker ────────────────────────────────────────────
function MIcon({ metric, color }: { metric?: string; color: string }) {
  const cls = 'w-5 h-5';
  const s = { color };
  switch (metric) {
    case 'contacts':      return <Users className={cls} style={s} strokeWidth={1.75} />;
    case 'companies':     return <Building2 className={cls} style={s} strokeWidth={1.75} />;
    case 'won_value':     return <Award className={cls} style={s} strokeWidth={1.75} />;
    case 'open_deals':    return <BarChart2 className={cls} style={s} strokeWidth={1.75} />;
    case 'win_rate':      return <Target className={cls} style={s} strokeWidth={1.75} />;
    case 'avg_deal_size': return <DollarSign className={cls} style={s} strokeWidth={1.75} />;
    default:              return <TrendingUp className={cls} style={s} strokeWidth={1.75} />;
  }
}

// ─── METRIC CARD ──────────────────────────────────────────────────
function MetricCard({ widget, filter }: { widget: Widget; filter?: DashboardFilter }) {
  const metric = widget.config.metric as string | undefined;
  const source = getWidgetSource(widget);
  const accent = widget.color ?? '#3b82f6';

  const { data: contactsRaw } = trpc.contacts.list.useQuery(
    { pagination: { limit: 500 } },
    { enabled: metric === 'contacts' },
  );
  const { data: companiesRaw } = trpc.dashboards.sourceCompanies.useQuery();
  const { data: pipelinesRaw = [] } = trpc.pipelines.list.useQuery(
    undefined,
    { enabled: ['pipeline_value', 'won_value', 'open_deals', 'win_rate', 'avg_deal_size'].includes(metric ?? '') },
  );
  const { data: dealsRaw } = trpc.deals.list.useQuery(
    { pagination: { limit: 500, cursor: undefined } },
    { enabled: ['pipeline_value', 'won_value', 'open_deals', 'win_rate', 'avg_deal_size'].includes(metric ?? '') },
  );

  const allCompanies = (companiesRaw ?? []) as Array<Record<string, unknown>>;
  const allContacts  = ((contactsRaw?.items ?? []) as Array<Record<string, unknown>>);
  const allDeals     = ((dealsRaw?.items ?? []) as Array<Record<string, unknown>>);
  const filteredContacts = filterContactsBySource(allContacts, allCompanies, source);
  const filteredCompanies = allCompanies.filter((c) => isCompanyInSource(c, source));
  const filteredDeals = applyDealFilter(
    filterDealsBySource(allDeals, pipelinesRaw as Array<Record<string, unknown>>, source),
    filter,
  );

  let value: string | number = '—';
  let subLine = '';

  if (metric === 'contacts') {
    value = filteredContacts.length;
    const qual = filteredContacts.filter((c) => c.status === 'qualified' || c.status === 'converted').length;
    subLine = qual > 0 ? `${qual} qualified` : `${source} view`;
  } else if (metric === 'companies') {
    const shown = filteredCompanies.length > 0 ? filteredCompanies.length : allCompanies.length;
    value = shown;
    subLine = `${source} view`;
  } else if (metric === 'pipeline_value') {
    const open = filteredDeals.filter((d) => d.status === 'open');
    const total = open.reduce((s, d) => s + (parseFloat(d.amount as string) || 0), 0);
    const wt = open.reduce((s, d) => s + (parseFloat(d.amount as string) || 0) * ((d.probability as number || 0) / 100), 0);
    value = formatCurrency(total);
    subLine = `${formatCurrency(wt)} weighted · ${open.length} prospects`;
  } else if (metric === 'won_value') {
    const won = filteredDeals.filter((d) => d.status === 'won');
    value = formatCurrency(won.reduce((s, d) => s + (parseFloat(d.amount as string) || 0), 0));
    subLine = `${won.length} prospect${won.length !== 1 ? 's' : ''} closed won`;
  } else if (metric === 'open_deals') {
    const open = filteredDeals.filter((d) => d.status === 'open');
    value = open.length;
    const tv = open.reduce((s, d) => s + (parseFloat(d.amount as string) || 0), 0);
    subLine = tv > 0 ? formatCurrency(tv) + ' total value' : 'active pipeline';
  } else if (metric === 'win_rate') {
    const closed = filteredDeals.filter((d) => d.status === 'won' || d.status === 'lost');
    const won = filteredDeals.filter((d) => d.status === 'won');
    const rate = closed.length > 0 ? Math.round((won.length / closed.length) * 100) : 0;
    value = `${rate}%`;
    subLine = `${won.length} won / ${closed.length} closed`;
  } else if (metric === 'avg_deal_size') {
    const won = filteredDeals.filter((d) => d.status === 'won');
    const total = won.reduce((s, d) => s + (parseFloat(d.amount as string) || 0), 0);
    value = won.length > 0 ? formatCurrency(total / won.length) : '—';
    subLine = `across ${won.length} won prospects`;
  }

  return (
    <div
      className="h-full flex flex-col p-1 relative overflow-hidden rounded-lg"
      style={{ background: `radial-gradient(ellipse at top right, ${accent}1a 0%, transparent 65%)` }}
    >
      {/* decorative bubble */}
      <div
        className="absolute -right-8 -top-8 w-28 h-28 rounded-full pointer-events-none"
        style={{ backgroundColor: `${accent}0d` }}
      />
      {/* left accent bar */}
      <div
        className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full"
        style={{ backgroundColor: accent }}
      />

      <div className="pl-4 flex flex-col h-full">
        <div className="flex items-start justify-between">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.08em] mt-0.5 leading-none">
            {widget.title}
          </p>
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${accent}1c` }}
          >
            <MIcon metric={metric} color={accent} />
          </div>
        </div>

        <div className="mt-auto pb-0.5">
          <p
            className="text-[32px] font-bold tracking-tight leading-none"
            style={{ color: value === '—' ? '#94a3b8' : '#0f172a' }}
          >
            {value}
          </p>
          {subLine && (
            <p className="text-[11px] text-slate-400 mt-1.5 truncate">{subLine}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── PIPELINE SUMMARY BAR CHART ───────────────────────────────────
function PipelineSummary({ widget, filter }: { widget: Widget; filter?: DashboardFilter }) {
  const source = getWidgetSource(widget);
  const { data: pipelines = [], error } = trpc.pipelines.list.useQuery();
  const sourcePipeline = resolvePipelineForSource(pipelines as Array<Record<string, unknown>>, source);
  const pipelineId = sourcePipeline?.id as string | undefined;

  const { data: pipelineData } = trpc.pipelines.getWithStages.useQuery(
    { id: pipelineId! },
    { enabled: !!pipelineId },
  );
  const { data: byStage } = trpc.deals.byStage.useQuery(
    { pipelineId: pipelineId! },
    { enabled: !!pipelineId },
  );

  if (error) return <WidgetEmpty title={widget.title} message={error.message} />;
  if (!sourcePipeline) return <WidgetEmpty title={widget.title} message="No pipeline found." />;

  type StageRow = { id: string; name: string; color: string | null; position: number };
  const stageNameMap: Record<string, string> = {};
  const stageColorMap: Record<string, string> = {};
  if (pipelineData?.stages) {
    for (const s of pipelineData.stages as StageRow[]) {
      stageNameMap[s.id] = s.name;
      stageColorMap[s.id] = s.color ?? CHART_COLORS[0]!;
    }
  }

  const stageData = byStage
    ? Object.entries(byStage as Record<string, unknown[]>)
        .map(([sid, rawDeals], i) => {
          const filtered = applyDealFilter(rawDeals as Array<Record<string, unknown>>, filter);
          return {
            name: stageNameMap[sid] ?? 'Unknown',
            deals: filtered.length,
            value: filtered.reduce((s, d) => s + (parseFloat(d.amount as string) || 0), 0),
            fill: stageColorMap[sid] ?? CHART_COLORS[i % CHART_COLORS.length]!,
            gradId: `sg_${widget.id}_${i}`,
          };
        })
        .filter((s) => s.deals > 0)
    : [];

  const showLabels = Boolean(widget.config.showLabels);
  const isHorizontal = (widget.config.chartType as string) === 'horizontal_bar';

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-[13px] font-semibold text-slate-800">{widget.title}</p>
        <p className="text-[11px] text-slate-400">{String(sourcePipeline.name ?? '')}</p>
      </div>
      {stageData.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-slate-400">No pipeline data yet</p>
        </div>
      ) : isHorizontal ? (
        <ResponsiveContainer width="100%" height="85%">
          <BarChart data={stageData} layout="vertical" margin={{ top: 4, right: showLabels ? 32 : 8, left: 4, bottom: 0 }}>
            <defs>
              {stageData.map((s) => (
                <linearGradient key={s.gradId} id={s.gradId} x1="1" y1="0" x2="0" y2="0">
                  <stop offset="0%" stopColor={s.fill} stopOpacity={1} />
                  <stop offset="100%" stopColor={s.fill} stopOpacity={0.55} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <Tooltip content={<DarkTooltip />} />
            <Bar dataKey="deals" name="Prospects" radius={[0, 5, 5, 0]} maxBarSize={32}>
              {stageData.map((s) => <Cell key={s.gradId} fill={`url(#${s.gradId})`} />)}
              {showLabels && <LabelList dataKey="deals" position="right" style={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }} />}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height="85%">
          <BarChart data={stageData} margin={{ top: showLabels ? 18 : 10, right: 8, left: -22, bottom: 0 }}>
            <defs>
              {stageData.map((s) => (
                <linearGradient key={s.gradId} id={s.gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.fill} stopOpacity={1} />
                  <stop offset="100%" stopColor={s.fill} stopOpacity={0.55} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <Tooltip content={<DarkTooltip />} />
            <Bar dataKey="deals" name="Prospects" radius={[5, 5, 0, 0]} maxBarSize={44}>
              {stageData.map((s) => <Cell key={s.gradId} fill={`url(#${s.gradId})`} />)}
              {showLabels && <LabelList dataKey="deals" position="top" style={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }} />}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ─── DEALS STATUS BAR CHART ────────────────────────────────────────
function DealStatusChart({ widget, filter }: { widget: Widget; filter?: DashboardFilter }) {
  const source = getWidgetSource(widget);
  const { data: pipelines = [], error } = trpc.pipelines.list.useQuery();
  const { data: dealsRaw } = trpc.deals.list.useQuery({ pagination: { limit: 500, cursor: undefined } });
  const deals = applyDealFilter(
    filterDealsBySource(
      (dealsRaw?.items ?? []) as Array<Record<string, unknown>>,
      pipelines as Array<Record<string, unknown>>,
      source,
    ),
    filter,
  );

  if (error) return <WidgetEmpty title={widget.title} message={error.message} />;

  const total = deals.length;
  const byStatus = [
    { name: 'Open',  count: deals.filter((d) => d.status === 'open').length,  fill: '#3b82f6', gid: `ds_open_${widget.id}` },
    { name: 'Won',   count: deals.filter((d) => d.status === 'won').length,   fill: '#10b981', gid: `ds_won_${widget.id}` },
    { name: 'Lost',  count: deals.filter((d) => d.status === 'lost').length,  fill: '#ef4444', gid: `ds_lost_${widget.id}` },
  ];
  const gradPairs: Record<string, [string, string]> = {
    [`ds_open_${widget.id}`]:  ['#3b82f6', '#6366f1'],
    [`ds_won_${widget.id}`]:   ['#10b981', '#059669'],
    [`ds_lost_${widget.id}`]:  ['#ef4444', '#dc2626'],
  };

  const showLabels = Boolean(widget.config.showLabels);
  const isHorizontal = (widget.config.chartType as string) === 'horizontal_bar';

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-[13px] font-semibold text-slate-800">{widget.title}</p>
        <p className="text-[11px] text-slate-400">{total} total</p>
      </div>
      <ResponsiveContainer width="100%" height="72%">
        {isHorizontal ? (
          <BarChart data={byStatus} layout="vertical" margin={{ top: 4, right: showLabels ? 32 : 8, left: 4, bottom: 0 }}>
            <defs>
              {byStatus.map((s) => {
                const [from, to] = gradPairs[s.gid]!;
                return (
                  <linearGradient key={s.gid} id={s.gid} x1="1" y1="0" x2="0" y2="0">
                    <stop offset="0%" stopColor={from} stopOpacity={1} />
                    <stop offset="100%" stopColor={to} stopOpacity={0.75} />
                  </linearGradient>
                );
              })}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={40} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <Tooltip content={<DarkTooltip />} />
            <Bar dataKey="count" name="Prospects" radius={[0, 6, 6, 0]} maxBarSize={40}>
              {byStatus.map((s) => <Cell key={s.gid} fill={`url(#${s.gid})`} />)}
              {showLabels && <LabelList dataKey="count" position="right" style={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} />}
            </Bar>
          </BarChart>
        ) : (
          <BarChart data={byStatus} margin={{ top: showLabels ? 18 : 8, right: 8, left: -22, bottom: 0 }}>
            <defs>
              {byStatus.map((s) => {
                const [from, to] = gradPairs[s.gid]!;
                return (
                  <linearGradient key={s.gid} id={s.gid} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={from} stopOpacity={1} />
                    <stop offset="100%" stopColor={to} stopOpacity={0.75} />
                  </linearGradient>
                );
              })}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <Tooltip content={<DarkTooltip />} />
            <Bar dataKey="count" name="Prospects" radius={[6, 6, 0, 0]} maxBarSize={64}>
              {byStatus.map((s) => <Cell key={s.gid} fill={`url(#${s.gid})`} />)}
              {showLabels && <LabelList dataKey="count" position="top" style={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} />}
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>

      {/* summary chips */}
      <div className="flex items-center gap-3 mt-3">
        {byStatus.map((s) => (
          <div key={s.name} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: s.fill }} />
            <span className="text-[11px] text-slate-500">{s.name}</span>
            <span className="text-[11px] font-bold text-slate-700">{s.count}</span>
            {total > 0 && (
              <span className="text-[10px] text-slate-400">({Math.round((s.count / total) * 100)}%)</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── CONTACTS PIE CHART ───────────────────────────────────────────
function ContactsPieChart({ widget }: { widget: Widget }) {
  const source = getWidgetSource(widget);
  const { data: contactsRaw } = trpc.contacts.list.useQuery({ pagination: { limit: 500, cursor: undefined } });
  const { data: companiesRaw, error } = trpc.dashboards.sourceCompanies.useQuery();

  const allContacts  = ((contactsRaw?.items ?? []) as Array<Record<string, unknown>>);
  const allCompanies = ((companiesRaw ?? []) as Array<Record<string, unknown>>);
  const contacts = filterContactsBySource(allContacts, allCompanies, source);

  if (error) return <WidgetEmpty title={widget.title} message={error.message} />;

  const byStatus: Record<string, number> = {};
  for (const c of contacts) { const s = c.status as string; byStatus[s] = (byStatus[s] ?? 0) + 1; }
  const pieData = Object.entries(byStatus)
    .map(([name, value]) => ({ name: STATUS_LABEL[name] ?? name, value }))
    .sort((a, b) => b.value - a.value);

  if (pieData.length === 0) return <WidgetEmpty title={widget.title} message="No contact data for this source." />;
  const total = contacts.length;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-[13px] font-semibold text-slate-800">{widget.title}</p>
        <p className="text-[11px] text-slate-400">{total} total</p>
      </div>
      <div className="flex-1 flex items-center gap-3 min-h-0">
        {/* donut */}
        <div className="relative flex-shrink-0" style={{ width: 130, height: 130 }}>
          <ResponsiveContainer width={130} height={130}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%" cy="50%"
                innerRadius={42} outerRadius={58}
                paddingAngle={2}
                dataKey="value"
                strokeWidth={0}
              >
                {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip content={<DarkTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          {/* center label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <p className="text-[22px] font-bold text-slate-800 leading-none">{total}</p>
            <p className="text-[9px] text-slate-400 uppercase tracking-widest mt-0.5">total</p>
          </div>
        </div>
        {/* legend */}
        <div className="flex-1 space-y-2 min-w-0">
          {pieData.slice(0, 6).map((entry, i) => (
            <div key={entry.name} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
              <span className="text-[11px] text-slate-600 flex-1 truncate capitalize">{entry.name}</span>
              <span className="text-[11px] font-semibold text-slate-700 flex-shrink-0">{entry.value}</span>
              <div
                className="h-1.5 rounded-full flex-shrink-0 ml-1"
                style={{ width: Math.max(12, Math.round((entry.value / total) * 48)), backgroundColor: PIE_COLORS[i % PIE_COLORS.length], opacity: 0.55 }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── REVENUE AREA CHART (line_chart) ──────────────────────────────
function RevenueAreaChart({ widget, filter }: { widget: Widget; filter?: DashboardFilter }) {
  const source = getWidgetSource(widget);
  const accent = widget.color ?? '#6366f1';
  const { data: pipelines = [] } = trpc.pipelines.list.useQuery();
  const { data: dealsRaw } = trpc.deals.list.useQuery({ pagination: { limit: 500, cursor: undefined } });
  const deals = applyDealFilter(
    filterDealsBySource(
      (dealsRaw?.items ?? []) as Array<Record<string, unknown>>,
      pipelines as Array<Record<string, unknown>>,
      source,
    ),
    filter,
  );
  const monthly = buildMonthly(deals);
  const hasData = monthly.some((m) => m.count > 0);
  const gradId = `areaGrad_${widget.id}`;

  const showLabels = Boolean(widget.config.showLabels);
  const isLine = (widget.config.chartType as string) === 'line';

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-[13px] font-semibold text-slate-800">{widget.title}</p>
        <p className="text-[11px] text-slate-400">Last 6 months</p>
      </div>
      {!hasData ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-slate-400">No prospect data for this period</p>
        </div>
      ) : isLine ? (
        <ResponsiveContainer width="100%" height="85%">
          <LineChart data={monthly} margin={{ top: showLabels ? 16 : 4, right: 8, left: -26, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <Tooltip content={<DarkTooltip />} />
            <Line
              type="monotone"
              dataKey="pipeline"
              name="Pipeline Value"
              stroke={accent}
              strokeWidth={2.5}
              dot={{ r: 4, fill: accent, strokeWidth: 0 }}
              activeDot={{ r: 6, strokeWidth: 2, stroke: '#fff' }}
            >
              {showLabels && <LabelList dataKey="pipeline" position="top" style={{ fontSize: 9, fill: '#64748b', fontWeight: 600 }} formatter={(v) => (typeof v === 'number' && v > 0 ? `₹${Math.round(v / 1000)}k` : '')} />}
            </Line>
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height="85%">
          <AreaChart data={monthly} margin={{ top: 4, right: 8, left: -26, bottom: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={accent} stopOpacity={0.3} />
                <stop offset="95%" stopColor={accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <Tooltip content={<DarkTooltip />} />
            <Area
              type="monotone"
              dataKey="pipeline"
              name="Pipeline Value"
              stroke={accent}
              strokeWidth={2.5}
              fill={`url(#${gradId})`}
              dot={{ r: 3.5, fill: accent, strokeWidth: 0 }}
              activeDot={{ r: 6, strokeWidth: 2, stroke: '#fff' }}
            >
              {showLabels && <LabelList dataKey="pipeline" position="top" style={{ fontSize: 9, fill: '#64748b', fontWeight: 600 }} formatter={(v) => (typeof v === 'number' && v > 0 ? `₹${Math.round(v / 1000)}k` : '')} />}
            </Area>
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ─── DEAL FUNNEL (funnel_chart) ────────────────────────────────────
function DealFunnelChart({ widget }: { widget: Widget }) {
  const source = getWidgetSource(widget);
  const { data: pipelines = [] } = trpc.pipelines.list.useQuery();
  const sourcePipeline = resolvePipelineForSource(pipelines as Array<Record<string, unknown>>, source);
  const pipelineId = sourcePipeline?.id as string | undefined;

  const { data: pipelineData } = trpc.pipelines.getWithStages.useQuery(
    { id: pipelineId! },
    { enabled: !!pipelineId },
  );
  const { data: byStage } = trpc.deals.byStage.useQuery(
    { pipelineId: pipelineId! },
    { enabled: !!pipelineId },
  );

  if (!sourcePipeline) return <WidgetEmpty title={widget.title} message="No pipeline found." />;

  type StageRow = { id: string; name: string; color: string | null; position: number };
  const stages = ((pipelineData?.stages ?? []) as StageRow[]).sort((a, b) => a.position - b.position);

  const funnelData = stages.map((s, i) => {
    const stageDeals = ((byStage as Record<string, unknown[]> | undefined)?.[s.id] ?? []) as Array<Record<string, unknown>>;
    return {
      name: s.name,
      deals: stageDeals.length,
      value: stageDeals.reduce((sum, d) => sum + (parseFloat(d.amount as string) || 0), 0),
      color: s.color ?? CHART_COLORS[i % CHART_COLORS.length]!,
    };
  }).filter((s) => s.deals > 0);

  const maxDeals = Math.max(...funnelData.map((f) => f.deals), 1);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-baseline justify-between mb-4">
        <p className="text-[13px] font-semibold text-slate-800">{widget.title}</p>
        <p className="text-[11px] text-slate-400">{String(sourcePipeline.name ?? '')}</p>
      </div>
      {funnelData.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-slate-400">No pipeline data</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-center gap-2">
          {funnelData.map((stage, i) => {
            const pct = Math.max(8, Math.round((stage.deals / maxDeals) * 100));
            const convRate = i > 0 && funnelData[i - 1]!.deals > 0
              ? Math.round((stage.deals / funnelData[i - 1]!.deals) * 100)
              : null;
            return (
              <div key={stage.name} className="flex items-center gap-2.5">
                <div className="w-[88px] text-[10px] text-slate-500 text-right truncate flex-shrink-0 leading-tight">
                  {stage.name}
                </div>
                <div className="flex-1 relative h-7 bg-slate-100 rounded-lg overflow-hidden">
                  <div
                    className="h-full rounded-lg flex items-center pl-2.5 transition-all duration-700"
                    style={{ width: `${pct}%`, backgroundColor: stage.color, opacity: 0.88 }}
                  >
                    <span className="text-white text-[10px] font-semibold whitespace-nowrap drop-shadow-sm">
                      {stage.deals} prospect{stage.deals !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {formatCurrency(stage.value) !== '₹0' && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-medium">
                      {formatCurrency(stage.value)}
                    </span>
                  )}
                </div>
                <div className="w-9 flex-shrink-0 text-right">
                  {convRate !== null ? (
                    <span className="text-[10px] font-medium" style={{ color: convRate >= 70 ? '#10b981' : convRate >= 40 ? '#f59e0b' : '#ef4444' }}>
                      {convRate}%
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
          <p className="text-[10px] text-slate-400 mt-1 pl-[104px]">← stage conversion rate</p>
        </div>
      )}
    </div>
  );
}

// ─── ACTIVITY FEED ────────────────────────────────────────────────
function ActivityFeedWidget({ widget }: { widget: Widget }) {
  const limit = (widget.config.limit as number) || 10;
  const { data } = trpc.activities.list.useQuery({ pagination: { limit, cursor: undefined } });
  const items = (data?.items ?? []) as Array<Record<string, unknown>>;

  return (
    <div className="h-full flex flex-col">
      <p className="text-[13px] font-semibold text-slate-800 mb-3">{widget.title}</p>
      <div className="flex-1 overflow-y-auto space-y-0.5 pr-0.5">
        {items.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">No recent activities</p>
        ) : (
          items.map((a) => {
            const aType = a.activityType as string;
            const style = ACTIVITY_STYLE[aType] ?? { color: '#94a3b8', bg: '#f8fafc' };
            const Icon = aType === 'call' ? Phone
              : aType.startsWith('email') ? Mail
              : aType === 'meeting' ? Calendar
              : aType === 'task' ? CheckCircle
              : aType === 'note' ? MessageSquare
              : Activity;
            return (
              <div key={a.id as string} className="flex items-center gap-2.5 py-1.5 px-1.5 rounded-lg hover:bg-slate-50 transition-colors group">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: style.bg }}
                >
                  <Icon className="w-3.5 h-3.5" style={{ color: style.color }} strokeWidth={1.75} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-slate-700 truncate font-medium leading-snug">
                    {(a.subject as string) || aType.replace(/_/g, ' ')}
                  </p>
                  <p className="text-[10px] text-slate-400 leading-none mt-0.5">{formatRelative(a.occurredAt as string)}</p>
                </div>
                <span
                  className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full capitalize flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: style.color, backgroundColor: style.bg }}
                >
                  {aType.replace(/_/g, ' ')}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── DISPATCHER ───────────────────────────────────────────────────
export function WidgetRenderer({ widget, filter }: { widget: Widget; filter?: DashboardFilter }) {
  switch (widget.widgetType as WidgetType) {
    case 'metric_card':     return <MetricCard widget={widget} filter={filter} />;
    case 'activity_feed':   return <ActivityFeedWidget widget={widget} />;
    case 'pipeline_summary': return <PipelineSummary widget={widget} filter={filter} />;
    case 'bar_chart':       return <DealStatusChart widget={widget} filter={filter} />;
    case 'pie_chart':       return <ContactsPieChart widget={widget} />;
    case 'line_chart':      return <RevenueAreaChart widget={widget} filter={filter} />;
    case 'funnel_chart':    return <DealFunnelChart widget={widget} />;
    default:
      return (
        <div className="flex items-center justify-center h-full text-xs text-slate-400">
          {widget.title}
        </div>
      );
  }
}

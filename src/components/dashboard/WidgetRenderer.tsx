'use client';

import React from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { trpc } from '@/lib/trpc';
import { formatCurrency, formatRelative } from '@/lib/formatters';
import { TrendingUp, Users, Building2, Activity, Phone, Mail } from 'lucide-react';
import type { DashboardDataSource, WidgetType } from '@/lib/types';

interface Widget {
  id: string;
  widgetType: string;
  title: string;
  subtitle: string | null;
  color: string | null;
  config: Record<string, unknown>;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

function getWidgetSource(widget: Widget): DashboardDataSource {
  const source = widget.config?.sourceContext;
  return source === 'partner' || source === 'enterprise' ? source : 'client';
}

function isCompanyInSource(company: Record<string, unknown>, source: DashboardDataSource): boolean {
  const companyType = company.companyType as string | null | undefined;
  const companySize = company.companySize as string | null | undefined;

  if (source === 'partner') return companyType === 'partner';
  if (source === 'enterprise') return companySize === '1001-5000' || companySize === '5000+';
  return companyType === 'customer';
}

function getPipelineKeywords(source: DashboardDataSource): string[] {
  if (source === 'partner') return ['partner'];
  if (source === 'enterprise') return ['enterprise'];
  return ['sales', 'client'];
}

function resolvePipelineForSource(
  pipelines: Array<Record<string, unknown>>,
  source: DashboardDataSource
): Record<string, unknown> | undefined {
  const keywords = getPipelineKeywords(source);
  return pipelines.find((pipeline) => {
    const name = String(pipeline.name ?? '').toLowerCase();
    return keywords.some((keyword) => name.includes(keyword));
  }) ?? pipelines[0];
}

function filterDealsByPipelineSource(
  deals: Array<Record<string, unknown>>,
  pipelines: Array<Record<string, unknown>>,
  source: DashboardDataSource
): Array<Record<string, unknown>> {
  const pipeline = resolvePipelineForSource(pipelines, source);
  if (!pipeline?.id) return [];
  return deals.filter((deal) => String(deal.pipelineId ?? '') === String(pipeline.id));
}

function filterRecordsBySource<T extends Record<string, unknown>>(
  records: T[],
  companies: Array<Record<string, unknown>>,
  source: DashboardDataSource,
  companyIdField: string,
  companyNameField?: string
): T[] {
  const matchingCompanyIds = new Set(
    companies
      .filter((company) => isCompanyInSource(company, source))
      .map((company) => String(company.id))
  );
  const matchingCompanyNames = new Set(
    companies
      .filter((company) => isCompanyInSource(company, source))
      .map((company) => String(company.name))
  );

  return records.filter((record) => {
    const companyId = record[companyIdField];
    if (companyId && matchingCompanyIds.has(String(companyId))) return true;
    if (companyNameField) {
      const companyName = record[companyNameField];
      if (companyName && matchingCompanyNames.has(String(companyName))) return true;
    }
    return false;
  });
}

function WidgetState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-4">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      <p className="text-xs text-slate-400 mt-1">{message}</p>
    </div>
  );
}

function MetricCard({ widget }: { widget: Widget }) {
  const config = widget.config as Record<string, unknown>;
  const metric = config.metric as string | undefined;
  const source = getWidgetSource(widget);

  const { data: contactsData } = trpc.contacts.list.useQuery({ pagination: { limit: 1, cursor: undefined } }, { enabled: metric === 'contacts' });
  const { data: allContactsData, error: contactsError } = trpc.contacts.list.useQuery({ pagination: { limit: 500, cursor: undefined } }, { enabled: metric === 'contacts' });
  const { data: companiesData, error: companiesError } = trpc.dashboards.sourceCompanies.useQuery();
  const { data: pipelines = [], error: pipelinesError } = trpc.pipelines.list.useQuery(
    undefined,
    { enabled: metric === 'pipeline_value' || metric === 'won_value' || metric === 'open_deals' }
  );
  const { data: dealsData } = trpc.deals.list.useQuery({ pagination: { limit: 500, cursor: undefined } }, { enabled: metric === 'pipeline_value' || metric === 'won_value' || metric === 'open_deals' });
  const dealsError = trpc.deals.list.useQuery({ pagination: { limit: 1, cursor: undefined } }, { enabled: false }).error;

  const allCompanies = (companiesData ?? []) as Array<Record<string, unknown>>;
  const filteredCompanies = allCompanies.filter((company) => isCompanyInSource(company, source));
  const filteredContacts = filterRecordsBySource(
    ((allContactsData?.items ?? []) as Array<Record<string, unknown>>),
    allCompanies,
    source,
    'companyId',
    'companyName'
  );
  const filteredDeals = filterDealsByPipelineSource(
    ((dealsData?.items ?? []) as Array<Record<string, unknown>>),
    (pipelines as Array<Record<string, unknown>>),
    source
  );

  let value: string | number = '—';
  let subtitle = '';

  if (metric === 'contacts') {
    const total = filteredContacts.length;
    value = total;
    subtitle = `${source} contacts`;
  } else if (metric === 'companies') {
    const total = filteredCompanies.length;
    value = total;
    subtitle = `${source} companies`;
  } else if (metric === 'pipeline_value') {
    const open = filteredDeals.filter((d) => d.status === 'open');
    value = formatCurrency(open.reduce((s, d) => s + (parseFloat(d.amount as string) || 0), 0));
    subtitle = `${open.length} open ${source} deals`;
  } else if (metric === 'won_value') {
    const won = filteredDeals.filter((d) => d.status === 'won');
    value = formatCurrency(won.reduce((s, d) => s + (parseFloat(d.amount as string) || 0), 0));
    subtitle = `${won.length} ${source} deals won`;
  } else if (metric === 'open_deals') {
    value = filteredDeals.filter((d) => d.status === 'open').length;
    subtitle = `Open ${source} deals`;
  }

  const queryError = contactsError ?? companiesError ?? dealsError ?? pipelinesError;
  if (queryError) {
    return <WidgetState title={widget.title} message={queryError.message} />;
  }

  const iconColor = widget.color ?? '#3b82f6';

  return (
    <div className="h-full flex flex-col justify-between p-1">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[12px] font-medium text-slate-500 uppercase tracking-wide">{widget.title}</p>
          {widget.subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{widget.subtitle}</p>}
        </div>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${iconColor}18` }}>
          <TrendingUp className="w-3.5 h-3.5" style={{ color: iconColor }} strokeWidth={1.75} />
        </div>
      </div>
      <div>
        <p className="text-[26px] font-semibold text-slate-900 tracking-tight font-data leading-none mt-3">{value}</p>
        {subtitle && <p className="text-[11px] text-slate-400 mt-1.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function ActivityFeed({ widget }: { widget: Widget }) {
  const config = widget.config as Record<string, unknown>;
  const limit = (config.limit as number) || 8;
  const { data } = trpc.activities.list.useQuery({ pagination: { limit, cursor: undefined } });
  const { data: companiesData, error: companiesError } = trpc.dashboards.sourceCompanies.useQuery();
  const source = getWidgetSource(widget);
  const items = filterRecordsBySource(
    ((data?.items ?? []) as Array<Record<string, unknown>>),
    ((companiesData ?? []) as Array<Record<string, unknown>>),
    source,
    'companyId',
    'companyName'
  );

  if (companiesError) {
    return <WidgetState title={widget.title} message={companiesError.message} />;
  }

  return (
    <div className="h-full flex flex-col">
      <p className="text-sm font-semibold text-slate-700 mb-2">{widget.title}</p>
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
        {items.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">No recent activities</p>
        ) : (
          items.map((activity) => {
            const a = activity as Record<string, unknown>;
            const Icon = a.activityType === 'call' ? Phone
              : a.activityType === 'email_sent' || a.activityType === 'email_received' ? Mail
              : Activity;
            return (
              <div key={a.id as string} className="flex items-center gap-2 py-2">
                <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-3 h-3 text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-700 truncate">
                    {(a.subject as string) || (a.activityType as string).replace(/_/g, ' ')}
                  </p>
                  <p className="text-xs text-slate-400">{formatRelative(a.occurredAt as string)}</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function PipelineSummary({ widget }: { widget: Widget }) {
  const source = getWidgetSource(widget);
  const { data: pipelines = [], error: pipelinesError } = trpc.pipelines.list.useQuery();
  const sourcePipeline = resolvePipelineForSource(pipelines as Array<Record<string, unknown>>, source);
  const pipelineId = sourcePipeline?.id as string | undefined;

  const { data: pipelineData } = trpc.pipelines.getWithStages.useQuery(
    { id: pipelineId! },
    { enabled: !!pipelineId }
  );

  const { data: byStage } = trpc.deals.byStage.useQuery(
    { pipelineId: pipelineId! },
    { enabled: !!pipelineId }
  );

  const stageNameMap: Record<string, string> = {};
  if (pipelineData?.stages) {
    for (const s of pipelineData.stages as Array<{ id: string; name: string }>) {
      stageNameMap[s.id] = s.name;
    }
  }

  const stageData = byStage
    ? Object.entries(byStage as Record<string, unknown[]>).map(([stageId, deals]) => ({
        name: stageNameMap[stageId] ?? stageId,
        deals: (deals as Array<Record<string, unknown>>).length,
        value: (deals as Array<Record<string, unknown>>)
          .reduce((s, d) => s + (parseFloat(d.amount as string) || 0), 0),
      })).filter((stage) => stage.deals > 0)
    : [];

  if (pipelinesError) {
    return <WidgetState title={widget.title} message={pipelinesError.message} />;
  }

  if (!sourcePipeline) {
    return <WidgetState title={widget.title} message={`No ${source} pipeline found.`} />;
  }

  return (
    <div className="h-full flex flex-col">
      <p className="text-sm font-semibold text-slate-700 mb-3">{widget.title}</p>
      {stageData.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-4">No pipeline data</p>
      ) : (
        <ResponsiveContainer width="100%" height="80%">
          <BarChart data={stageData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v) => [v, 'Deals']} />
            <Bar dataKey="deals" fill="#3b82f6" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function DealsBarChart({ widget }: { widget: Widget }) {
  const source = getWidgetSource(widget);
  const { data: pipelines = [], error: pipelinesError } = trpc.pipelines.list.useQuery();
  const { data: dealsData } = trpc.deals.list.useQuery({ pagination: { limit: 200, cursor: undefined } });
  const deals = filterDealsByPipelineSource(
    ((dealsData?.items ?? []) as Array<Record<string, unknown>>),
    (pipelines as Array<Record<string, unknown>>),
    source
  );

  if (pipelinesError) {
    return <WidgetState title={widget.title} message={pipelinesError.message} />;
  }

  // Group by status
  const byStatus = [
    { name: 'Open', count: deals.filter((d) => d.status === 'open').length, color: '#3b82f6' },
    { name: 'Won', count: deals.filter((d) => d.status === 'won').length, color: '#10b981' },
    { name: 'Lost', count: deals.filter((d) => d.status === 'lost').length, color: '#ef4444' },
  ];

  return (
    <div className="h-full flex flex-col">
      <p className="text-sm font-semibold text-slate-700 mb-3">{widget.title}</p>
      <ResponsiveContainer width="100%" height="80%">
        <BarChart data={byStatus} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {byStatus.map((entry, index) => (
              <Cell key={index} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ContactsPieChart({ widget }: { widget: Widget }) {
  const source = getWidgetSource(widget);
  const { data: contactsData } = trpc.contacts.list.useQuery({ pagination: { limit: 500, cursor: undefined } });
  const { data: companiesData, error: companiesError } = trpc.dashboards.sourceCompanies.useQuery();
  const contacts = filterRecordsBySource(
    ((contactsData?.items ?? []) as Array<Record<string, unknown>>),
    ((companiesData ?? []) as Array<Record<string, unknown>>),
    source,
    'companyId',
    'companyName'
  );

  if (companiesError) {
    return <WidgetState title={widget.title} message={companiesError.message} />;
  }

  // Group by status
  const byStatus: Record<string, number> = {};
  for (const c of contacts) {
    const s = (c as Record<string, unknown>).status as string;
    byStatus[s] = (byStatus[s] ?? 0) + 1;
  }
  const pieData = Object.entries(byStatus).map(([name, value]) => ({ name, value }));

  if (pieData.length === 0) {
    return <WidgetState title={widget.title} message={`No ${source} contact data matched this widget.`} />;
  }

  return (
    <div className="h-full flex flex-col">
      <p className="text-sm font-semibold text-slate-700 mb-2">{widget.title}</p>
      <div className="flex-1 flex items-center">
        <ResponsiveContainer width="60%" height={140}>
          <PieChart>
            <Pie data={pieData} cx="50%" cy="50%" innerRadius={35} outerRadius={55} dataKey="value">
              {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex-1 space-y-1">
          {pieData.slice(0, 5).map((entry, i) => (
            <div key={entry.name} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              <span className="text-xs text-slate-600 capitalize">{entry.name}</span>
              <span className="text-xs text-slate-400 ml-auto">{entry.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function WidgetRenderer({ widget }: { widget: Widget }) {
  const type = widget.widgetType as WidgetType;

  switch (type) {
    case 'metric_card':
      return <MetricCard widget={widget} />;
    case 'activity_feed':
      return <ActivityFeed widget={widget} />;
    case 'pipeline_summary':
      return <PipelineSummary widget={widget} />;
    case 'bar_chart':
      return <DealsBarChart widget={widget} />;
    case 'pie_chart':
      return <ContactsPieChart widget={widget} />;
    default:
      return (
        <div className="flex items-center justify-center h-full text-xs text-slate-400">
          {widget.title}
        </div>
      );
  }
}

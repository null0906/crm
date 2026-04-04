'use client';

import React from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { trpc } from '@/lib/trpc';
import { formatCurrency, formatRelative } from '@/lib/formatters';
import { TrendingUp, Users, Building2, Activity, Phone, Mail } from 'lucide-react';
import type { WidgetType } from '@/lib/types';

interface Widget {
  id: string;
  widgetType: string;
  title: string;
  subtitle: string | null;
  color: string | null;
  config: unknown;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

function MetricCard({ widget }: { widget: Widget }) {
  const config = widget.config as Record<string, unknown>;
  const metric = config.metric as string | undefined;

  const { data: contactsData } = trpc.contacts.list.useQuery({ pagination: { limit: 1, cursor: undefined } }, { enabled: metric === 'contacts' });
  const { data: companiesData } = trpc.companies.list.useQuery({ pagination: { limit: 1, cursor: undefined } }, { enabled: metric === 'companies' });
  const { data: dealsData } = trpc.deals.list.useQuery({ pagination: { limit: 500, cursor: undefined } }, { enabled: metric === 'pipeline_value' || metric === 'won_value' || metric === 'open_deals' });

  let value: string | number = '—';
  let subtitle = '';

  if (metric === 'contacts') {
    const total = (contactsData as { total?: number })?.total ?? contactsData?.items?.length ?? '—';
    value = total;
    subtitle = 'Total contacts';
  } else if (metric === 'companies') {
    const total = (companiesData as { total?: number })?.total ?? companiesData?.items?.length ?? '—';
    value = total;
    subtitle = 'Total companies';
  } else if (metric === 'pipeline_value') {
    const deals = (dealsData?.items ?? []) as Array<Record<string, unknown>>;
    const open = deals.filter((d) => d.status === 'open');
    value = formatCurrency(open.reduce((s, d) => s + (parseFloat(d.amount as string) || 0), 0));
    subtitle = `${open.length} open deals`;
  } else if (metric === 'won_value') {
    const deals = (dealsData?.items ?? []) as Array<Record<string, unknown>>;
    const won = deals.filter((d) => d.status === 'won');
    value = formatCurrency(won.reduce((s, d) => s + (parseFloat(d.amount as string) || 0), 0));
    subtitle = `${won.length} deals won`;
  } else if (metric === 'open_deals') {
    const deals = (dealsData?.items ?? []) as Array<Record<string, unknown>>;
    value = deals.filter((d) => d.status === 'open').length;
    subtitle = 'Open deals';
  }

  const iconColor = widget.color ?? '#3b82f6';

  return (
    <div className="h-full flex flex-col justify-between p-1">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{widget.title}</p>
          {widget.subtitle && <p className="text-xs text-slate-400 mt-0.5">{widget.subtitle}</p>}
        </div>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${iconColor}20` }}>
          <TrendingUp className="w-4 h-4" style={{ color: iconColor }} />
        </div>
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function ActivityFeed({ widget }: { widget: Widget }) {
  const config = widget.config as Record<string, unknown>;
  const limit = (config.limit as number) || 8;
  const { data } = trpc.activities.list.useQuery({ pagination: { limit, cursor: undefined } });
  const items = data?.items ?? [];

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
  const { data: pipelines = [] } = trpc.pipelines.list.useQuery();
  const firstPipeline = pipelines[0] as Record<string, unknown> | undefined;
  const pipelineId = firstPipeline?.id as string | undefined;

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
        deals: deals.length,
        value: (deals as Array<Record<string, unknown>>).reduce((s, d) => s + (parseFloat(d.amount as string) || 0), 0),
      }))
    : [];

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
  const { data: dealsData } = trpc.deals.list.useQuery({ pagination: { limit: 200, cursor: undefined } });
  const deals = (dealsData?.items ?? []) as Array<Record<string, unknown>>;

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
  const { data: contactsData } = trpc.contacts.list.useQuery({ pagination: { limit: 500, cursor: undefined } });
  const contacts = contactsData?.items ?? [];

  // Group by status
  const byStatus: Record<string, number> = {};
  for (const c of contacts) {
    const s = (c as Record<string, unknown>).status as string;
    byStatus[s] = (byStatus[s] ?? 0) + 1;
  }
  const pieData = Object.entries(byStatus).map(([name, value]) => ({ name, value }));

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

'use client';

import React from 'react';
import { CheckSquare, CalendarDays, TrendingUp, Activity, Clock, AlertCircle } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { ActivityFeed } from '@/components/activities/ActivityFeed';
import { formatDate, formatRelative } from '@/lib/formatters';

// ── helpers ───────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${color}`}>
        <Icon className="h-5 w-5 text-white" strokeWidth={1.75} />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900 leading-tight">{value}</p>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
      </div>
    </div>
  );
}

const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-red-500', high: 'bg-orange-500', medium: 'bg-amber-400', low: 'bg-slate-300',
};

const OUTCOME_CLASS: Record<string, string> = {
  interested:      'bg-indigo-100 text-indigo-700',
  completed:       'bg-emerald-100 text-emerald-700',
  needs_follow_up: 'bg-orange-100 text-orange-700',
  no_show:         'bg-red-100 text-red-700',
  not_interested:  'bg-red-100 text-red-700',
  rescheduled:     'bg-amber-100 text-amber-700',
  cancelled:       'bg-slate-100 text-slate-500',
};

// ── main page ─────────────────────────────────────────────────────────────────

export default function CommandCenterPage() {
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // All open follow-up tasks
  const { data: taskData } = trpc.activities.list.useQuery({
    activityType: 'task',
    pagination: { limit: 100 },
  });
  const allTasks = taskData?.items ?? [];
  const openTasks = (allTasks as Array<Record<string, unknown>>)
    .filter((t) => !t.taskCompletedAt)
    .sort((a, b) => {
      const da = a.taskDueDate ? new Date(String(a.taskDueDate)).getTime() : Infinity;
      const db = b.taskDueDate ? new Date(String(b.taskDueDate)).getTime() : Infinity;
      return da - db;
    });

  const today0 = new Date(); today0.setHours(0, 0, 0, 0);
  const overdueTasks  = openTasks.filter((t) => t.taskDueDate && new Date(String(t.taskDueDate)) < today0);
  const dueTodayTasks = openTasks.filter((t) => {
    if (!t.taskDueDate) return false;
    const d = new Date(String(t.taskDueDate)); d.setHours(0, 0, 0, 0);
    return d.getTime() === today0.getTime();
  });

  // Recent demo records
  const { data: demos = [] } = trpc.demoRecords.list.useQuery({});
  const recentDemos = (demos as Array<Record<string, unknown>>).slice(0, 8);

  // Active deals
  const { data: dealsData } = trpc.deals.list.useQuery({
    pagination: { limit: 8 },
  });
  const activeDeals = (dealsData?.items ?? []) as Array<Record<string, unknown>>;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1400px] mx-auto">

      {/* ── Page header ── */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Command Center</h1>
        <p className="mt-0.5 text-sm text-slate-500">{today}</p>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Open Tasks"
          value={openTasks.length}
          sub={overdueTasks.length > 0 ? `${overdueTasks.length} overdue` : 'all on track'}
          icon={CheckSquare}
          color="bg-blue-600"
        />
        <StatCard
          label="Due Today"
          value={dueTodayTasks.length}
          icon={Clock}
          color={dueTodayTasks.length > 0 ? 'bg-orange-500' : 'bg-slate-400'}
        />
        <StatCard
          label="Active Deals"
          value={activeDeals.filter((d) => d.status === 'open').length}
          icon={TrendingUp}
          color="bg-emerald-600"
        />
        <StatCard
          label="Demo Records"
          value={recentDemos.length}
          icon={CalendarDays}
          color="bg-indigo-600"
        />
      </div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

        {/* Activity feed — spans 1 col */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
            <Activity className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-800">Recent Activity</h2>
          </div>
          <div className="p-4">
            <ActivityFeed />
          </div>
        </div>

        {/* Follow-up tasks */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-800">Open Follow-ups</h2>
            </div>
            {overdueTasks.length > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-600">
                <AlertCircle className="h-3 w-3" />
                {overdueTasks.length} overdue
              </span>
            )}
          </div>
          <div className="divide-y divide-slate-50 max-h-[520px] overflow-y-auto">
            {openTasks.length === 0 ? (
              <div className="px-4 py-10 text-center text-slate-400">
                <CheckSquare className="mx-auto mb-2 h-8 w-8" />
                <p className="text-sm">No open tasks — all clear!</p>
              </div>
            ) : openTasks.map((t) => {
              const due = t.taskDueDate ? new Date(String(t.taskDueDate)) : null;
              const due0 = due ? new Date(due) : null;
              due0?.setHours(0, 0, 0, 0);
              const isOverdue  = due0 ? due0 < today0 : false;
              const isDueToday = due0 ? due0.getTime() === today0.getTime() : false;
              const pri = String(t.taskPriority ?? 'medium');
              const linkedTo = [
                t.contactFullName,
                t.companyName,
                t.dealTitle,
              ].filter(Boolean).join(' · ');
              return (
                <div key={String(t.id)} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[pri] ?? PRIORITY_DOT.medium}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-slate-800 truncate">{String(t.subject ?? '')}</p>
                    {linkedTo && <p className="text-[11px] text-slate-400 truncate">{linkedTo}</p>}
                  </div>
                  <span className={`shrink-0 text-[11px] font-mono whitespace-nowrap ${
                    isOverdue ? 'font-semibold text-red-600' :
                    isDueToday ? 'font-semibold text-orange-600' :
                    'text-slate-400'
                  }`}>
                    {due ? formatDate(due) : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right col — demos + deals */}
        <div className="flex flex-col gap-4">

          {/* Recent demos */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
              <CalendarDays className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-800">Recent Demos</h2>
            </div>
            <div className="divide-y divide-slate-50 max-h-[240px] overflow-y-auto">
              {recentDemos.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-400">No demo records yet.</p>
              ) : recentDemos.map((d) => {
                const outcome = String(d.outcome ?? '');
                const callType = String(d.callType ?? 'demo').replace(/_/g, ' ');
                const name = [d.contactFirstName, d.contactLastName].filter(Boolean).join(' ').trim()
                  || String(d.companyName ?? '');
                return (
                  <div key={String(d.id)} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold capitalize text-blue-600">{callType}</span>
                        {outcome && (
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold capitalize ${OUTCOME_CLASS[outcome] ?? 'bg-slate-100 text-slate-500'}`}>
                            {outcome.replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                      {name && <p className="truncate text-[12px] text-slate-600">{name}</p>}
                    </div>
                    <span className="shrink-0 font-mono text-[11px] text-slate-400">
                      {d.scheduledAt ? formatDate(new Date(String(d.scheduledAt))) : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active deals */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
              <TrendingUp className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-800">Active Deals</h2>
            </div>
            <div className="divide-y divide-slate-50 max-h-[240px] overflow-y-auto">
              {activeDeals.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-400">No active deals.</p>
              ) : activeDeals.filter((d) => d.status === 'open').map((d) => (
                  <div key={String(d.id)} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-slate-800">{String(d.title ?? '')}</p>
                      <p className="truncate text-[11px] text-slate-400">
                        {[d.stageName, d.primaryContactName || d.companyName].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

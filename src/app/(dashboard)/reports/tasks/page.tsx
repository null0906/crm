'use client';

import React from 'react';
import { useSession } from 'next-auth/react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';

type TaskRow = Record<string, any>;
type SummaryRow = Record<string, any>;

function weekRange() {
  const now = new Date();
  const from = new Date(now);
  from.setDate(now.getDate() - 6);
  from.setHours(0, 0, 0, 0);
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function h(value: unknown) {
  return Number(value ?? 0).toFixed(1);
}

function dt(value: unknown) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(String(value)));
}

function linked(task: TaskRow) {
  if (task.linkedProjectId) return task.linkedProjectName ?? 'Project';
  if (task.linkedDealId) return task.linkedDealTitle ?? 'Prospect';
  if (task.isInternal) return 'Internal';
  return 'Unlinked';
}

function downloadCsv(rows: TaskRow[]) {
  const headers = ['Member', 'Task', 'Linked to', 'Status', 'Hours', 'Started', 'Completed'];
  const lines = rows.map((task) => [
    `${task.userFirstName ?? ''} ${task.userLastName ?? ''}`.trim(),
    task.taskName ?? '',
    linked(task),
    task.status ?? '',
    task.hoursSpent ?? '',
    task.startedAt ?? '',
    task.completedAt ?? '',
  ].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','));
  const blob = new Blob([[headers.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `personal-task-report-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function TaskReportsPage() {
  const { data: session } = useSession();
  const role = (((session?.user as Record<string, unknown> | undefined)?.role as Record<string, unknown> | undefined)?.slug);
  const defaultRange = React.useMemo(weekRange, []);
  const [from, setFrom] = React.useState(defaultRange.from);
  const [to, setTo] = React.useState(defaultRange.to);
  const [userId, setUserId] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [linkType, setLinkType] = React.useState('');
  const { data: users = [] } = trpc.users.list.useQuery();
  const { data: summary = [] } = trpc.personalTasks.teamSummary.useQuery(
    { from: new Date(from).toISOString(), to: new Date(`${to}T23:59:59`).toISOString() },
    { enabled: role === 'super_admin' }
  );
  const { data: tasks = [] } = trpc.personalTasks.listAll.useQuery(
    {
      userId: userId || undefined,
      status: (status as 'in_progress' | 'completed' | 'cancelled') || undefined,
      linkType: (linkType as 'project' | 'deal' | 'internal' | 'any') || undefined,
      from: new Date(from).toISOString(),
      to: new Date(`${to}T23:59:59`).toISOString(),
    },
    { enabled: role === 'super_admin' }
  );

  if (role && role !== 'super_admin') {
    return <div className="flex h-full items-center justify-center text-sm text-slate-500">Task reports are restricted to super admins.</div>;
  }

  return (
    <div className="min-h-screen bg-[var(--surface-page)] p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-2xl border border-[var(--border-subtle)] bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]"><FileSpreadsheet className="h-5 w-5 text-[var(--accent)]" />Task Reports</h1>
              <p className="text-sm text-[var(--text-tertiary)]">Team time tracking across personal task logs.</p>
            </div>
            <Button onClick={() => downloadCsv(tasks as TaskRow[])}><Download className="h-4 w-4" />Export CSV</Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-3 text-sm" />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-3 text-sm" />
            <select value={userId} onChange={(e) => setUserId(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm">
              <option value="">All members</option>{users.map((user) => <option key={user.id} value={user.id}>{user.firstName} {user.lastName}</option>)}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm">
              <option value="">All statuses</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option>
            </select>
            <select value={linkType} onChange={(e) => setLinkType(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm">
              <option value="">All links</option><option value="project">Projects</option><option value="deal">Prospects</option><option value="internal">Internal</option>
            </select>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-white shadow-sm">
          <div className="border-b border-[var(--border-subtle)] px-4 py-3 text-sm font-black uppercase tracking-[0.06em] text-[var(--text-tertiary)]">Team Summary</div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-400"><tr><th className="px-4 py-3">Member</th><th>Total</th><th>Completed</th><th>Hours</th><th>Projects</th><th>Prospects</th><th>Internal</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {(summary as SummaryRow[]).map((row) => <tr key={row.user_id} className="cursor-pointer hover:bg-blue-50/50" onClick={() => setUserId(String(row.user_id))}><td className="px-4 py-3 font-bold">{row.first_name} {row.last_name}</td><td>{row.total_tasks}</td><td>{row.completed_tasks}</td><td>{h(row.total_hours)}</td><td>{h(row.project_hours)}</td><td>{h(row.prospect_hours)}</td><td>{h(row.internal_hours)}</td></tr>)}
              </tbody>
            </table>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-white shadow-sm">
          <div className="border-b border-[var(--border-subtle)] px-4 py-3 text-sm font-black uppercase tracking-[0.06em] text-[var(--text-tertiary)]">Detailed Task Log</div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-400"><tr><th className="px-4 py-3">Member</th><th>Task</th><th>Linked to</th><th>Status</th><th>Hours</th><th>Started</th><th>Completed</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {(tasks as TaskRow[]).map((task) => <tr key={task.id}><td className="px-4 py-3 font-semibold">{task.userFirstName} {task.userLastName}</td><td className="font-bold text-slate-900">{task.taskName}</td><td>{linked(task)}</td><td><span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold">{String(task.status).replace('_', ' ')}</span></td><td>{task.hoursSpent ? h(task.hoursSpent) : '-'}</td><td>{dt(task.startedAt)}</td><td>{dt(task.completedAt)}</td></tr>)}
                {(tasks as TaskRow[]).length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">No task rows match these filters.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}


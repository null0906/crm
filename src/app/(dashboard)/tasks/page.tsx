'use client';

import React from 'react';
import { CheckSquare, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SlideOverPanel } from '@/components/shared/SlideOverPanel';

type TaskRow = Record<string, any>;
type LinkType = 'project' | 'deal' | 'internal';

function dateTimeInput(value: unknown) {
  const date = value ? new Date(String(value)) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function formatDateTime(value: unknown) {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(String(value)));
}

function hours(value: unknown) {
  return `${Number(value ?? 0).toFixed(1)}h`;
}

function linkLabel(task: TaskRow) {
  if (task.linkedProjectId) return `Project: ${task.linkedProjectName ?? 'Unnamed project'}`;
  if (task.linkedDealId) return `Prospect: ${task.linkedDealTitle ?? 'Unnamed prospect'}`;
  if (task.isInternal) return 'SecComply Internal';
  return 'Unlinked';
}

function thisWeekRange() {
  const now = new Date();
  const from = new Date(now);
  from.setDate(now.getDate() - 6);
  from.setHours(0, 0, 0, 0);
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

export default function MyTasksPage() {
  const utils = trpc.useUtils();
  const range = React.useMemo(thisWeekRange, []);
  const [status, setStatus] = React.useState('');
  const [linkType, setLinkType] = React.useState('');
  const [addOpen, setAddOpen] = React.useState(false);
  const [completeTask, setCompleteTask] = React.useState<TaskRow | null>(null);
  const { data: tasks = [], isLoading } = trpc.personalTasks.listMy.useQuery({
    status: (status as 'in_progress' | 'completed' | 'cancelled') || undefined,
    linkType: (linkType as 'project' | 'deal' | 'internal' | 'any') || undefined,
  });
  const { data: stats = {} } = trpc.personalTasks.myStats.useQuery({ from: range.from.toISOString(), to: range.to.toISOString() });
  const cancelTask = trpc.personalTasks.cancel.useMutation({
    onSuccess: async () => { toast.success('Task cancelled'); await utils.personalTasks.invalidate(); },
    onError: (error) => toast.error('Could not cancel task', { description: error.message }),
  });
  const deleteTask = trpc.personalTasks.delete.useMutation({
    onSuccess: async () => { toast.success('Task deleted'); await utils.personalTasks.invalidate(); },
    onError: (error) => toast.error('Could not delete task', { description: error.message }),
  });

  const totalHours = Number((stats as Record<string, unknown>).total_hours ?? 0);
  const projectHours = Number((stats as Record<string, unknown>).project_hours ?? 0);
  const prospectHours = Number((stats as Record<string, unknown>).prospect_hours ?? 0);
  const internalHours = Number((stats as Record<string, unknown>).internal_hours ?? 0);

  return (
    <div className="flex h-full flex-col bg-[var(--surface-page)]">
      <header className="border-b border-[var(--border-subtle)] bg-white px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-black tracking-[-0.03em] text-[var(--text-primary)]"><CheckSquare className="h-5 w-5 text-[var(--accent)]" />My Tasks</h1>
            <p className="text-sm text-[var(--text-tertiary)]">Personal task log and manual hours tracking.</p>
          </div>
          <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" />Add Task</Button>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6">
        <div className="mb-5 grid gap-3 md:grid-cols-4">
          <Stat label="Total tasks" value={String((stats as Record<string, unknown>).total_tasks ?? 0)} />
          <Stat label="Completed" value={String((stats as Record<string, unknown>).completed_tasks ?? 0)} tone="green" />
          <Stat label="Hours logged" value={hours(totalHours)} />
          <Stat label="Avg / day" value={hours(totalHours / 5)} />
        </div>
        <div className="mb-5 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-white">
          <div className="flex h-3">
            <div className="bg-indigo-500" style={{ width: `${totalHours ? (projectHours / totalHours) * 100 : 0}%` }} />
            <div className="bg-blue-500" style={{ width: `${totalHours ? (prospectHours / totalHours) * 100 : 0}%` }} />
            <div className="bg-slate-400" style={{ width: `${totalHours ? (internalHours / totalHours) * 100 : 0}%` }} />
          </div>
          <div className="flex flex-wrap gap-3 px-4 py-2 text-xs text-slate-500">
            <span>Project {hours(projectHours)}</span><span>Prospect {hours(prospectHours)}</span><span>Internal {hours(internalHours)}</span>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded-lg border border-[var(--border-default)] bg-white px-3 text-sm">
            <option value="">All statuses</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option>
          </select>
          <select value={linkType} onChange={(event) => setLinkType(event.target.value)} className="h-9 rounded-lg border border-[var(--border-default)] bg-white px-3 text-sm">
            <option value="">All links</option><option value="project">Projects</option><option value="deal">Prospects</option><option value="internal">Internal</option>
          </select>
        </div>

        {isLoading ? <div className="text-sm text-slate-400">Loading...</div> : (
          <div className="space-y-2">
            {(tasks as TaskRow[]).map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onComplete={() => setCompleteTask(task)}
                onCancel={() => cancelTask.mutate({ id: task.id })}
                onDelete={() => {
                  if (window.confirm('Delete this task permanently?')) deleteTask.mutate({ id: task.id });
                }}
                deleting={deleteTask.isPending}
              />
            ))}
            {(tasks as TaskRow[]).length === 0 && <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">No personal tasks found.</div>}
          </div>
        )}
      </main>
      <AddTaskPanel open={addOpen} onClose={() => setAddOpen(false)} />
      <CompleteTaskPanel task={completeTask} onClose={() => setCompleteTask(null)} />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'green' }) {
  return <div className="rounded-xl border border-[var(--border-subtle)] bg-white p-4 shadow-sm"><p className={`text-2xl font-black ${tone === 'green' ? 'text-emerald-600' : 'text-[var(--text-primary)]'}`}>{value}</p><p className="text-xs font-bold uppercase tracking-[0.06em] text-[var(--text-tertiary)]">{label}</p></div>;
}

function TaskCard({ task, onComplete, onCancel, onDelete, deleting }: { task: TaskRow; onComplete: () => void; onCancel: () => void; onDelete: () => void; deleting: boolean }) {
  const active = task.status === 'in_progress';
  return (
    <div className={`rounded-xl border border-l-[3px] bg-white p-4 shadow-sm ${active ? 'border-l-amber-500' : task.status === 'completed' ? 'border-l-emerald-500' : 'border-l-slate-300'}`}>
      <div className="mb-1 flex items-start justify-between gap-3">
        <div className="min-w-0 text-[10.5px] font-black uppercase tracking-[0.06em]">
          <span className={active ? 'text-amber-600' : task.status === 'completed' ? 'text-emerald-600' : 'text-slate-400'}>{active ? 'In Progress' : task.status}</span>
          <span className="ml-2 text-slate-400">{active ? `Started ${formatDateTime(task.startedAt)}` : `${formatDateTime(task.completedAt)} · ${hours(task.hoursSpent)}`}</span>
        </div>
        <Button size="icon" variant="ghost" onClick={onDelete} disabled={deleting} title="Delete task" className="h-7 w-7 shrink-0 text-slate-400 hover:text-red-600">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-sm font-bold text-slate-900">{task.taskName}</p>
      {task.description && <p className="mt-1 text-xs text-slate-500">{task.description}</p>}
      <p className="mt-2 text-xs font-semibold text-slate-400">{linkLabel(task)}</p>
      {active && <div className="mt-3 flex justify-end gap-2"><Button size="sm" onClick={onComplete}>Mark Complete</Button><Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button></div>}
    </div>
  );
}

function AddTaskPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [taskName, setTaskName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [linkType, setLinkType] = React.useState<LinkType>('internal');
  const [linkedProjectId, setLinkedProjectId] = React.useState('');
  const [linkedDealId, setLinkedDealId] = React.useState('');
  const { data: linkables } = trpc.personalTasks.linkableEntities.useQuery(undefined, { enabled: open });
  const create = trpc.personalTasks.create.useMutation({
    onSuccess: async () => {
      toast.success('Task started');
      setTaskName(''); setDescription(''); setLinkType('internal'); setLinkedProjectId(''); setLinkedDealId('');
      onClose();
      await utils.personalTasks.invalidate();
    },
    onError: (error) => toast.error('Could not start task', { description: error.message }),
  });
  const valid = taskName.trim() && (linkType === 'internal' || (linkType === 'project' && linkedProjectId) || (linkType === 'deal' && linkedDealId));
  return <SlideOverPanel open={open} onClose={onClose} title="Add Task" width="md">
    <div className="space-y-4 p-5">
      <div><label className="text-xs font-bold uppercase text-slate-500">Task name</label><Input value={taskName} onChange={(e) => setTaskName(e.target.value)} placeholder="What are you working on?" autoFocus /></div>
      <div><label className="text-xs font-bold uppercase text-slate-500">Description</label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Add context if helpful..." /></div>
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase text-slate-500">Link to</p>
        {(['project', 'deal', 'internal'] as const).map((type) => <label key={type} className="flex items-center gap-2 text-sm"><input type="radio" checked={linkType === type} onChange={() => { setLinkType(type); setLinkedProjectId(''); setLinkedDealId(''); }} />{type === 'deal' ? 'A prospect I am working on' : type === 'project' ? 'A project I am working on' : 'SecComply Internal'}</label>)}
      </div>
      {linkType === 'project' && <select value={linkedProjectId} onChange={(e) => setLinkedProjectId(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">Select project</option>{(linkables?.projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.companyName ? ` (${p.companyName})` : ''}</option>)}</select>}
      {linkType === 'deal' && <select value={linkedDealId} onChange={(e) => setLinkedDealId(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">Select prospect</option>{(linkables?.deals ?? []).map((d) => <option key={d.id} value={d.id}>{d.title}{d.companyName ? ` - ${d.companyName}` : ''}</option>)}</select>}
      <p className="text-xs text-slate-400">Started time is captured automatically. You will log hours when marking it complete.</p>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!valid || create.isPending} onClick={() => create.mutate({ taskName: taskName.trim(), description: description || undefined, linkedProjectId: linkType === 'project' ? linkedProjectId : undefined, linkedDealId: linkType === 'deal' ? linkedDealId : undefined, isInternal: linkType === 'internal' })}>Start Task</Button></div>
    </div>
  </SlideOverPanel>;
}

function CompleteTaskPanel({ task, onClose }: { task: TaskRow | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [hoursSpent, setHoursSpent] = React.useState('1');
  const [startedAt, setStartedAt] = React.useState('');
  const [completedAt, setCompletedAt] = React.useState('');
  React.useEffect(() => {
    if (task) {
      setHoursSpent('1');
      setStartedAt(dateTimeInput(task.startedAt));
      setCompletedAt(dateTimeInput(new Date()));
    }
  }, [task]);
  const complete = trpc.personalTasks.complete.useMutation({
    onSuccess: async () => { toast.success('Task completed'); onClose(); await utils.personalTasks.invalidate(); },
    onError: (error) => toast.error('Could not complete task', { description: error.message }),
  });
  const startTime = startedAt ? new Date(startedAt) : null;
  const completionTime = completedAt ? new Date(completedAt) : null;
  const invalidRange = Boolean(startTime && completionTime && startTime > completionTime);
  const invalidHours = !Number.isFinite(Number(hoursSpent)) || Number(hoursSpent) < 0.1 || Number(hoursSpent) > 24;
  return <SlideOverPanel open={Boolean(task)} onClose={onClose} title="Complete Task" width="md">
    {task && <div className="space-y-5 p-5">
      <div><p className="text-sm font-bold text-slate-900">{task.taskName}</p><p className="text-xs text-slate-500">Started {formatDateTime(task.startedAt)}</p></div>
      <div><label className="text-xs font-bold uppercase text-slate-500">Hours spent</label><Input type="number" min="0.1" max="24" step="0.1" value={hoursSpent} onChange={(e) => setHoursSpent(e.target.value)} /></div>
      <div className="flex flex-wrap gap-1.5">{[0.5, 1, 2, 3, 4, 5, 6, 8].map((h) => <button key={h} onClick={() => setHoursSpent(String(h))} className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50">{h}</button>)}</div>
      <div><label className="text-xs font-bold uppercase text-slate-500">Started at</label><Input type="datetime-local" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} /></div>
      <div><label className="text-xs font-bold uppercase text-slate-500">Completed at</label><Input type="datetime-local" value={completedAt} onChange={(e) => setCompletedAt(e.target.value)} /></div>
      {invalidRange && <p className="text-xs font-semibold text-red-600">Started time cannot be after completed time.</p>}
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={complete.isPending || invalidHours || invalidRange} onClick={() => complete.mutate({ id: task.id, hoursSpent: Number(hoursSpent), startedAt: startedAt ? new Date(startedAt).toISOString() : undefined, completedAt: completedAt ? new Date(completedAt).toISOString() : undefined })}>Save & Complete</Button></div>
    </div>}
  </SlideOverPanel>;
}

'use client';

import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CalendarDays, CheckSquare, Clock, Link2, Plus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { PROJECT_STAGES, PROJECT_TASK_STATUSES, getProjectStageColor, getProjectStageProgress, getServiceTypeConfig } from '@/lib/projects';
import type { ProjectStage, ProjectTaskStatus } from '@/lib/types';

type ProjectRecord = Record<string, any>;

function formatINR(value: unknown) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value ?? 0));
}

function formatDate(value: unknown) {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(String(value)));
}

function ServiceTypeBadge({ type }: { type: string | null | undefined }) {
  const cfg = getServiceTypeConfig(type);
  return (
    <span className="inline-flex rounded px-2 py-0.5 text-[11px] font-bold" style={{ background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}` }}>
      {cfg.label}
    </span>
  );
}

function ProgressBar({ percent, delayed }: { percent: number; delayed?: boolean }) {
  const safePercent = Math.max(0, Math.min(100, percent));
  const color = delayed ? '#EF4444' : safePercent >= 80 ? '#16A34A' : safePercent >= 40 ? 'var(--accent)' : '#94A3B8';
  return (
    <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-subtle)]">
      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${safePercent}%`, background: color }} />
    </div>
  );
}

function StagePills({ project }: { project: ProjectRecord }) {
  const utils = trpc.useUtils();
  const moveStage = trpc.projects.moveStage.useMutation({
    onSuccess: () => {
      toast.success('Project stage updated');
      void utils.projects.getById.invalidate({ id: project.id });
      void utils.projects.list.invalidate();
    },
    onError: (err) => toast.error('Could not update stage', { description: err.message }),
  });

  return (
    <div className="flex flex-wrap gap-1.5">
      {PROJECT_STAGES.filter((stage) => !['on_hold', 'cancelled'].includes(stage.key)).map((stage) => {
        const active = project.stage === stage.key;
        return (
          <button
            key={stage.key}
            type="button"
            onClick={() => {
              if (!active && window.confirm(`Move project to ${stage.label}?`)) {
                moveStage.mutate({ id: project.id, stage: stage.key });
              }
            }}
            className={`rounded-full border px-3 py-1 text-xs font-bold transition-all ${
              active
                ? 'border-[var(--accent)] bg-[var(--accent)] text-white shadow-sm'
                : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)] hover:border-[var(--accent-medium)] hover:bg-[var(--accent-light)] hover:text-[var(--accent)]'
            }`}
          >
            {stage.label}
          </button>
        );
      })}
    </div>
  );
}

function ProgressEditor({ project }: { project: ProjectRecord }) {
  const utils = trpc.useUtils();
  const stageProgress = getProjectStageProgress(project.stage);
  const [isDelayed, setIsDelayed] = React.useState(Boolean(project.isDelayed));
  const [delayReason, setDelayReason] = React.useState(String(project.delayReason ?? ''));
  const [revisedEndDate, setRevisedEndDate] = React.useState(String(project.revisedEndDate ?? ''));

  React.useEffect(() => {
    setIsDelayed(Boolean(project.isDelayed));
    setDelayReason(String(project.delayReason ?? ''));
    setRevisedEndDate(String(project.revisedEndDate ?? ''));
  }, [project.id, project.progressPercent, project.isDelayed, project.delayReason, project.revisedEndDate]);

  const updateProgress = trpc.projects.updateProgress.useMutation({
    onSuccess: () => {
      toast.success('Progress updated');
      void utils.projects.getById.invalidate({ id: project.id });
      void utils.projects.list.invalidate();
    },
    onError: (err) => toast.error('Could not update progress', { description: err.message }),
  });

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-[var(--text-primary)]">Timeline Progress</h2>
          <p className="text-xs text-[var(--text-tertiary)]">{formatDate(project.startDate)} to {formatDate(project.revisedEndDate ?? project.endDate)}</p>
        </div>
        <span className="font-mono text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">{stageProgress}%</span>
      </div>
      <ProgressBar percent={stageProgress} delayed={isDelayed} />
      <p className="mt-2 text-xs font-medium text-[var(--text-tertiary)]">
        Progress is linked to stage movement. Move the project stage above to change completion.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
            <input type="checkbox" checked={isDelayed} onChange={(event) => setIsDelayed(event.target.checked)} />
            Mark as delayed
          </label>
          {isDelayed && (
            <div className="grid gap-2 md:grid-cols-2">
              <input value={delayReason} onChange={(event) => setDelayReason(event.target.value)} placeholder="Delay reason" className="h-9 rounded-lg border border-[var(--border-default)] px-3 text-sm" />
              <input type="date" value={revisedEndDate} onChange={(event) => setRevisedEndDate(event.target.value)} className="h-9 rounded-lg border border-[var(--border-default)] px-3 text-sm" />
            </div>
          )}
        </div>
        <button
          type="button"
          disabled={updateProgress.isPending}
          onClick={() => updateProgress.mutate({
            id: project.id,
            progressPercent: stageProgress,
            isDelayed,
            delayReason: isDelayed ? delayReason : null,
            revisedEndDate: isDelayed ? revisedEndDate || null : null,
          })}
          className="btn-primary h-9 rounded-lg px-4 text-sm"
        >
          {updateProgress.isPending ? 'Saving...' : 'Update Progress'}
        </button>
      </div>
      {project.isDelayed && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Delayed: {project.delayReason || 'No reason added'} {project.revisedEndDate ? `· Revised ${formatDate(project.revisedEndDate)}` : ''}
        </div>
      )}
    </div>
  );
}

function TasksTab({ project }: { project: ProjectRecord }) {
  const utils = trpc.useUtils();
  const [title, setTitle] = React.useState('');
  const createTask = trpc.projects.createTask.useMutation({
    onSuccess: () => {
      setTitle('');
      void utils.projects.getById.invalidate({ id: project.id });
    },
    onError: (err) => toast.error('Could not add task', { description: err.message }),
  });
  const updateTask = trpc.projects.updateTask.useMutation({
    onSuccess: () => void utils.projects.getById.invalidate({ id: project.id }),
  });

  const tasks = (project.tasks ?? []) as ProjectRecord[];

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Add a project task..." className="h-9 flex-1 rounded-lg border border-[var(--border-default)] px-3 text-sm" />
        <button type="button" className="btn-primary h-9 rounded-lg px-3 text-sm" onClick={() => title.trim() && createTask.mutate({ projectId: project.id, title })}>
          <Plus className="h-4 w-4" />
          Add
        </button>
      </div>
      <div className="grid gap-3 lg:grid-cols-4">
        {PROJECT_TASK_STATUSES.filter((status) => status.key !== 'not_applicable').map((status) => {
          const statusTasks = tasks.filter((task) => task.status === status.key);
          return (
            <section key={status.key} className="rounded-xl border border-white/80 bg-white/55 p-3 shadow-sm backdrop-blur">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold text-[var(--text-primary)]">{status.label}</h3>
                <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs font-bold text-[var(--text-tertiary)]">{statusTasks.length}</span>
              </div>
              <div className="space-y-2">
                {statusTasks.map((task) => (
                  <div key={task.id} className="rounded-lg border border-[var(--border-subtle)] bg-white p-3 shadow-sm">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{task.title}</p>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--text-tertiary)]">
                      <span>{task.dueDate ? formatDate(task.dueDate) : 'No due date'}</span>
                      <select
                        value={task.status}
                        onChange={(event) => updateTask.mutate({ id: task.id, data: { status: event.target.value as ProjectTaskStatus } })}
                        className="rounded border border-[var(--border-default)] bg-white px-1 py-0.5"
                      >
                        {PROJECT_TASK_STATUSES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TeamTab({ project }: { project: ProjectRecord }) {
  const utils = trpc.useUtils();
  const members = (project.members ?? []) as ProjectRecord[];
  const { data: users = [] } = trpc.users.list.useQuery();
  const [userId, setUserId] = React.useState('');
  const [role, setRole] = React.useState<'lead' | 'member' | 'reviewer' | 'consultant'>('member');
  const addMember = trpc.projects.addMember.useMutation({
    onSuccess: () => {
      toast.success('Team member added');
      setUserId('');
      setRole('member');
      void utils.projects.getById.invalidate({ id: project.id });
      void utils.projects.list.invalidate();
    },
    onError: (err) => toast.error('Could not add member', { description: err.message }),
  });
  const removeMember = trpc.projects.removeMember.useMutation({
    onSuccess: () => {
      toast.success('Team member removed');
      void utils.projects.getById.invalidate({ id: project.id });
      void utils.projects.list.invalidate();
    },
    onError: (err) => toast.error('Could not remove member', { description: err.message }),
  });

  const memberUserIds = new Set(members.map((member) => member.user?.id).filter(Boolean));
  const availableUsers = users.filter((user) => !memberUserIds.has(user.id));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border-subtle)] bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-[var(--text-primary)]">Add Team Member</h2>
            <p className="text-xs text-[var(--text-tertiary)]">Any CRM user can be assigned for now; roles identify who leads delivery.</p>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-[1fr_160px_auto]">
          <select
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            className="h-9 rounded-lg border border-[var(--border-default)] bg-white px-3 text-sm"
          >
            <option value="">Select user</option>
            {availableUsers.map((user) => (
              <option key={user.id} value={user.id}>{user.firstName} {user.lastName}</option>
            ))}
          </select>
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as typeof role)}
            className="h-9 rounded-lg border border-[var(--border-default)] bg-white px-3 text-sm"
          >
            <option value="lead">Lead</option>
            <option value="member">Member</option>
            <option value="reviewer">Reviewer</option>
            <option value="consultant">Consultant</option>
          </select>
          <button
            type="button"
            disabled={!userId || addMember.isPending}
            onClick={() => userId && addMember.mutate({ projectId: project.id, userId, role })}
            className="btn-primary h-9 rounded-lg px-4 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border-subtle)] bg-white shadow-sm">
        {members.length === 0 ? (
          <div className="p-6 text-center text-sm text-[var(--text-tertiary)]">No team members added yet.</div>
        ) : members.map((member) => {
          const user = member.user ?? {};
          const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
          const initials = name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
          return (
            <div key={member.id} className="flex items-center gap-3 border-b border-[var(--border-subtle)] p-4 last:border-b-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent-light)] text-sm font-bold text-[var(--accent)]">{initials || 'U'}</div>
              <div className="flex-1">
                <p className="text-sm font-bold text-[var(--text-primary)]">{name || 'Team member'}</p>
                <p className="text-xs text-[var(--text-tertiary)]">{member.role ?? 'member'}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (user.id && window.confirm(`Remove ${name || 'this user'} from the project?`)) {
                    removeMember.mutate({ projectId: project.id, userId: user.id });
                  }
                }}
                className="rounded-md px-2 py-1 text-xs font-semibold text-[var(--text-tertiary)] hover:bg-red-50 hover:text-red-600"
              >
                Remove
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const projectId = String(params.id ?? '');
  const [tab, setTab] = React.useState<'overview' | 'tasks' | 'team' | 'timeline' | 'linked'>('overview');
  const { data: project, isLoading } = trpc.projects.getById.useQuery({ id: projectId }, { enabled: Boolean(projectId) });

  if (isLoading) {
    return (
      <div className="bg-[var(--surface-page)] p-6">
        <div className="skeleton h-32 rounded-xl" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--surface-page)]">
        <div className="text-center">
          <p className="text-lg font-bold text-[var(--text-primary)]">Project not found</p>
          <Link href="/projects" className="mt-2 inline-block text-sm font-semibold text-[var(--accent)]">Back to Projects</Link>
        </div>
      </div>
    );
  }

  const record = project as ProjectRecord;
  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'tasks', label: 'Tasks' },
    { key: 'team', label: 'Team' },
    { key: 'timeline', label: 'Timeline' },
    { key: 'linked', label: 'Linked Deal' },
  ] as const;

  return (
    <div className="min-h-full overflow-auto bg-[var(--surface-page)] p-4 lg:p-6">
      <div className="mb-4">
        <Link href="/projects" className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--text-tertiary)] hover:text-[var(--accent)]">
          <ArrowLeft className="h-4 w-4" />
          Projects
        </Link>
      </div>

      <div className="rounded-2xl border border-[var(--border-subtle)] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <ServiceTypeBadge type={record.serviceType} />
            <h1 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">{record.name}</h1>
            <p className="mt-1 text-sm text-[var(--text-tertiary)]">
              {record.company?.name ?? 'No company'} {record.primaryContact?.firstName ? `· Primary: ${record.primaryContact.firstName} ${record.primaryContact.lastName ?? ''}` : ''}
            </p>
          </div>
          <div className="text-left lg:text-right">
            <p className="font-mono text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">{formatINR(record.contractValue)}</p>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">Contract Value</p>
          </div>
        </div>
        <div className="mt-5">
          <StagePills project={record} />
        </div>
      </div>

      <div className="mt-4">
        <ProgressEditor project={record} />
      </div>

      <div className="mt-4 flex gap-1 overflow-x-auto rounded-xl border border-[var(--border-default)] bg-[var(--surface-input)] p-1">
        {tabs.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`h-9 rounded-lg px-4 text-sm font-bold transition-all ${
              tab === item.key ? 'bg-white text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === 'overview' && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-[var(--border-subtle)] bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-bold text-[var(--text-primary)]">Project Details</h2>
              <dl className="grid gap-3 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-[var(--text-tertiary)]">Stage</dt><dd className="font-semibold text-[var(--text-primary)]" style={{ color: getProjectStageColor(record.stage) }}>{PROJECT_STAGES.find((s) => s.key === record.stage)?.label}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-[var(--text-tertiary)]">Status</dt><dd className="font-semibold text-[var(--text-primary)]">{record.status}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-[var(--text-tertiary)]">Start</dt><dd className="font-mono text-[var(--text-primary)]">{formatDate(record.startDate)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-[var(--text-tertiary)]">End</dt><dd className="font-mono text-[var(--text-primary)]">{formatDate(record.revisedEndDate ?? record.endDate)}</dd></div>
              </dl>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-bold text-[var(--text-primary)]">Quick Links</h2>
              <div className="space-y-2 text-sm">
                {record.companyId && <Link href={`/companies/${record.companyId}`} className="flex items-center gap-2 font-semibold text-[var(--accent)]"><Users className="h-4 w-4" /> View company</Link>}
                {record.dealId && <Link href={`/deals/${record.dealId}`} className="flex items-center gap-2 font-semibold text-[var(--accent)]"><Link2 className="h-4 w-4" /> View linked deal</Link>}
              </div>
            </div>
          </div>
        )}
        {tab === 'tasks' && <TasksTab project={record} />}
        {tab === 'team' && <TeamTab project={record} />}
        {tab === 'timeline' && (
          <div className="rounded-xl border border-[var(--border-subtle)] bg-white p-4 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><Clock className="h-4 w-4 text-[var(--accent)]" /> Stage History</h2>
            <div className="space-y-3">
              {(record.stageHistory ?? []).map((history: ProjectRecord) => (
                <div key={history.id} className="flex items-center gap-3 rounded-lg bg-[var(--surface-input)] p-3 text-sm">
                  <span className="h-2 w-2 rounded-full" style={{ background: getProjectStageColor(history.toStage) }} />
                  <span className="font-semibold text-[var(--text-primary)]">{PROJECT_STAGES.find((s) => s.key === history.toStage)?.label ?? history.toStage}</span>
                  <span className="ml-auto font-mono text-xs text-[var(--text-tertiary)]">{formatDate(history.enteredAt)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'linked' && (
          <div className="rounded-xl border border-[var(--border-subtle)] bg-white p-4 shadow-sm">
            {record.deal?.id ? (
              <div>
                <h2 className="text-sm font-bold text-[var(--text-primary)]">Linked Deal</h2>
                <p className="mt-2 text-lg font-bold text-[var(--text-primary)]">{record.deal.title}</p>
                <p className="mt-1 font-mono text-xl font-black text-[var(--text-primary)]">{formatINR(record.deal.amount)}</p>
                <Link href={`/deals/${record.deal.id}`} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent)]">
                  View in pipeline
                  <Link2 className="h-4 w-4" />
                </Link>
              </div>
            ) : (
              <p className="text-sm text-[var(--text-tertiary)]">This project is not linked to a deal.</p>
            )}
          </div>
        )}
      </div>
      <div className="hidden">
        <CheckSquare />
        <CalendarDays />
      </div>
    </div>
  );
}

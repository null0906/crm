'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { CalendarDays, Filter, FolderKanban, LayoutGrid, List, Plus, RotateCcw, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import {
  PROJECT_STAGES,
  getProjectStageProgress,
  getProjectStagesFromPipelineStages,
  getServiceTypeConfig,
  type ProjectStageOption,
} from '@/lib/projects';
import type { ProjectStage } from '@/lib/types';
import { SavedViewsBar } from '@/components/saved-views/SavedViewsBar';

type ProjectRecord = Record<string, any>;
type ViewMode = 'board' | 'list' | 'timeline';

function getStageOption(stages: ProjectStageOption[], stage: string | null | undefined) {
  return stages.find((item) => item.key === stage) ?? PROJECT_STAGES.find((item) => item.key === stage) ?? PROJECT_STAGES[0]!;
}

function getSyncedStageColor(stages: ProjectStageOption[], stage: string | null | undefined) {
  return getStageOption(stages, stage).color;
}

function getSyncedStageLabel(stages: ProjectStageOption[], stage: string | null | undefined) {
  return getStageOption(stages, stage).label;
}

function formatDate(value: unknown) {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(String(value)));
}

function ServiceTypeBadge({ type }: { type: string | null | undefined }) {
  const cfg = getServiceTypeConfig(type);
  return (
    <span
      className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}` }}
    >
      {cfg.label}
    </span>
  );
}

function ProgressBar({ percent, delayed }: { percent: number; delayed?: boolean }) {
  const safePercent = Math.max(0, Math.min(100, percent));
  const color = delayed ? '#EF4444' : safePercent >= 80 ? '#16A34A' : safePercent >= 40 ? 'var(--accent)' : '#94A3B8';
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-subtle)]">
      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${safePercent}%`, background: color }} />
    </div>
  );
}

function TeamAvatarStack({ members }: { members: ProjectRecord[] | undefined }) {
  const visibleMembers = (members ?? []).slice(0, 4);
  if (visibleMembers.length === 0) return null;

  return (
    <div className="mt-2 flex items-center">
      {visibleMembers.map((member, index) => {
        const user = member.user ?? {};
        const initials = `${String(user.firstName ?? '').charAt(0)}${String(user.lastName ?? '').charAt(0)}`.toUpperCase() || 'U';
        return (
          <div
            key={member.id ?? user.id ?? index}
            className="flex h-5 w-5 items-center justify-center rounded-md border border-white bg-[var(--accent-light)] text-[9px] font-bold text-[var(--accent)] shadow-sm"
            style={{ marginLeft: index === 0 ? 0 : -5 }}
            title={`${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()}
          >
            {initials}
          </div>
        );
      })}
      {(members?.length ?? 0) > 4 && (
        <span className="ml-1.5 text-[10px] font-semibold text-[var(--text-tertiary)]">+{(members?.length ?? 0) - 4}</span>
      )}
    </div>
  );
}

function ProjectCard({ project, stages }: { project: ProjectRecord; stages: ProjectStageOption[] }) {
  const router = useRouter();
  const stageProgress = getProjectStageProgress(project.stage);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: project.id,
    data: { project },
  });
  const style = {
    transform: CSS.Translate.toString(transform),
    borderLeftColor: getSyncedStageColor(stages, project.stage),
  } as React.CSSProperties;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/projects/${project.id}`)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') router.push(`/projects/${project.id}`);
      }}
      className={`mx-2 mt-1.5 rounded-[10px] border border-l-[3px] border-[var(--border-subtle)] bg-white p-3 shadow-[var(--shadow-card)] transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)] ${
        isDragging ? 'z-50 rotate-1 scale-[1.02] opacity-90 shadow-[var(--shadow-xl)]' : ''
      }`}
    >
      <ServiceTypeBadge type={project.serviceType} />
      <p className="mt-2 line-clamp-2 text-[13.5px] font-semibold leading-snug tracking-[-0.015em] text-[var(--text-primary)]">
        {project.name}
      </p>
      {project.company?.name && (
        <p className="mt-1.5 truncate text-xs text-[var(--text-secondary)]">{project.company.name}</p>
      )}
      <div className="mt-2">
        <div className="mb-1 flex justify-between text-[10.5px] font-medium text-[var(--text-tertiary)]">
          <span>{formatDate(project.startDate)}</span>
          <span className={project.isDelayed ? 'text-red-600' : ''}>
            {project.isDelayed ? 'Late ' : ''}{formatDate(project.revisedEndDate ?? project.endDate)}
          </span>
        </div>
        <ProgressBar percent={stageProgress} delayed={Boolean(project.isDelayed)} />
        <p className="mt-1 text-[10.5px] font-medium text-[var(--text-tertiary)]">{stageProgress}% complete by stage</p>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-[var(--text-tertiary)]">
        <span>{Number(project.completedTaskCount ?? 0)}/{Number(project.taskCount ?? 0)} tasks</span>
      </div>
      <TeamAvatarStack members={project.members} />
    </div>
  );
}

function ProjectColumn({ stage, projects, stages }: { stage: ProjectStageOption; projects: ProjectRecord[]; stages: ProjectStageOption[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key });
  return (
    <section
      ref={setNodeRef}
      className={`flex w-[282px] shrink-0 flex-col rounded-[14px] border border-white/80 bg-white/55 pb-2 shadow-sm backdrop-blur-md transition-all ${
        isOver ? 'border-[var(--accent-medium)] bg-[rgba(45,91,227,0.06)] shadow-[0_0_0_2px_var(--accent-medium)]' : ''
      }`}
    >
      <div className="flex items-center gap-2 rounded-t-[14px] border-b border-[rgba(226,229,240,0.7)] bg-white/70 px-3.5 py-3 backdrop-blur-md">
        <span className="h-2 w-2 rounded-full" style={{ background: stage.color, boxShadow: `0 0 0 3px ${stage.color}22` }} />
        <span className="text-[12.5px] font-bold tracking-[-0.01em] text-[var(--text-primary)]">{stage.label}</span>
        <span className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-semibold text-[var(--text-secondary)]">{projects.length}</span>
      </div>
      <div className="min-h-[240px] py-1">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} stages={stages} />
        ))}
      </div>
    </section>
  );
}

function BoardView({ projects, stages }: { projects: ProjectRecord[]; stages: ProjectStageOption[] }) {
  const utils = trpc.useUtils();
  const moveStage = trpc.projects.moveStage.useMutation({
    onSuccess: () => void utils.projects.list.invalidate(),
    onError: (err) => toast.error('Could not move project', { description: err.message }),
  });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragEnd(event: DragEndEvent) {
    const project = event.active.data.current?.project as ProjectRecord | undefined;
    const targetStage = event.over?.id as ProjectStage | undefined;
    if (!project || !targetStage || project.stage === targetStage) return;
    moveStage.mutate({ id: project.id, stage: targetStage });
  }

  if (projects.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-dashed border-[var(--border-default)] bg-white p-8 text-center shadow-sm">
          <FolderKanban className="mx-auto mb-3 h-10 w-10 text-[var(--accent)]" />
          <h2 className="text-lg font-black tracking-[-0.03em] text-[var(--text-primary)]">No projects yet</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--text-tertiary)]">
            Run the one-time backfill to create Projects from existing Active Pipeline prospects, or add a new project manually.
          </p>
          <code className="mt-4 block rounded-lg bg-[var(--surface-input)] px-3 py-2 text-xs text-[var(--text-secondary)]">
            npm run backfill:projects
          </code>
        </div>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex flex-1 gap-4 overflow-x-auto p-4">
        {stages.map((stage) => (
          <ProjectColumn
            key={stage.key}
            stage={stage}
            stages={stages}
            projects={projects.filter((project) => project.stage === stage.key)}
          />
        ))}
      </div>
    </DndContext>
  );
}

function ListView({ projects, stages }: { projects: ProjectRecord[]; stages: ProjectStageOption[] }) {
  const router = useRouter();
  return (
    <div className="m-4 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-white shadow-sm">
      <table className="w-full text-left">
        <thead className="bg-[var(--surface-subtle)] text-[10.5px] font-bold uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
          <tr>
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Service</th>
            <th className="px-4 py-3">Company</th>
            <th className="px-4 py-3">Stage</th>
            <th className="px-4 py-3">Progress</th>
            <th className="px-4 py-3">End Date</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => (
            <tr
              key={project.id}
              className="cursor-pointer border-b border-[var(--border-subtle)] bg-white transition-colors hover:bg-[var(--accent-light)]"
              onClick={() => router.push(`/projects/${project.id}`)}
            >
              <td className="px-4 py-3 text-[13.5px] font-semibold text-[var(--text-primary)]">{project.name}</td>
              <td className="px-4 py-3"><ServiceTypeBadge type={project.serviceType} /></td>
              <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">{project.company?.name ?? '-'}</td>
              <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">{getSyncedStageLabel(stages, project.stage)}</td>
              <td className="px-4 py-3">
                <div className="w-32"><ProgressBar percent={getProjectStageProgress(project.stage)} delayed={Boolean(project.isDelayed)} /></div>
              </td>
              <td className="px-4 py-3 font-mono text-xs text-[var(--text-tertiary)]">{formatDate(project.revisedEndDate ?? project.endDate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TimelineView({ projects, stages }: { projects: ProjectRecord[]; stages: ProjectStageOption[] }) {
  const router = useRouter();
  const validProjects = projects.filter((project) => project.startDate && project.endDate);
  const dates = validProjects.flatMap((project) => [new Date(String(project.startDate)), new Date(String(project.revisedEndDate ?? project.endDate))]);
  const min = dates.length ? new Date(Math.min(...dates.map((date) => date.getTime()))) : new Date();
  const max = dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))) : new Date();
  const totalDays = Math.max(1, Math.ceil((max.getTime() - min.getTime()) / 86400000) + 7);

  return (
    <div className="m-4 overflow-auto rounded-xl border border-[var(--border-subtle)] bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
        <CalendarDays className="h-4 w-4 text-[var(--accent)]" />
        Project Timeline
      </div>
      <div className="min-w-[820px] space-y-3">
        {validProjects.map((project) => {
          const start = new Date(String(project.startDate));
          const end = new Date(String(project.revisedEndDate ?? project.endDate));
          const left = ((start.getTime() - min.getTime()) / 86400000 / totalDays) * 100;
          const width = Math.max(4, ((end.getTime() - start.getTime()) / 86400000 / totalDays) * 100);
          return (
            <div key={project.id} className="grid grid-cols-[220px_1fr] items-center gap-4">
              <button
                type="button"
                onClick={() => router.push(`/projects/${project.id}`)}
                className="truncate text-left text-sm font-semibold text-[var(--text-primary)] hover:text-[var(--accent)]"
              >
                {project.name}
              </button>
              <div className="relative h-8 rounded-lg bg-[var(--surface-input)]">
                <button
                  type="button"
                  className="absolute top-1 h-6 rounded-md px-2 text-left text-[11px] font-semibold text-white shadow-sm"
                  style={{ left: `${left}%`, width: `${width}%`, background: getSyncedStageColor(stages, project.stage) }}
                  title={`${project.name}: ${Number(project.progressPercent ?? 0)}%`}
                  onClick={() => router.push(`/projects/${project.id}`)}
                >
                  <span className="truncate">{getProjectStageProgress(project.stage)}%</span>
                </button>
              </div>
            </div>
          );
        })}
        {validProjects.length === 0 && (
          <div className="rounded-lg border border-dashed border-[var(--border-default)] p-8 text-center text-sm text-[var(--text-tertiary)]">
            Add start and end dates to projects to see them on the timeline.
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const [view, setView] = React.useState<ViewMode>('board');
  const [showFilters, setShowFilters] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [stage, setStage] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [serviceType, setServiceType] = React.useState('');
  const [assignedUserId, setAssignedUserId] = React.useState('');
  const [companyId, setCompanyId] = React.useState('');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');
  const [isDelayed, setIsDelayed] = React.useState(false);
  const [activeViewId, setActiveViewId] = React.useState('');
  const utils = trpc.useUtils();
  const createProject = trpc.projects.create.useMutation({
    onSuccess: (project) => {
      toast.success('Project created');
      void utils.projects.list.invalidate();
      window.location.href = `/projects/${project.id}`;
    },
    onError: (err) => toast.error('Could not create project', { description: err.message }),
  });
  const { data: pipelines = [] } = trpc.pipelines.list.useQuery();
  const { data: users = [] } = trpc.users.list.useQuery();
  const { data: companiesData } = trpc.companies.list.useQuery({ pagination: { limit: 500 } });
  const companies = (companiesData?.items ?? []) as ProjectRecord[];
  const activePipelineId = React.useMemo(() => {
    const activePipeline = pipelines.find((pipeline) => String((pipeline as Record<string, unknown>).pipelineType ?? '') === 'active_delivery');
    return activePipeline ? String(activePipeline.id) : '';
  }, [pipelines]);
  const { data: activePipeline } = trpc.pipelines.getWithStages.useQuery(
    { id: activePipelineId },
    { enabled: Boolean(activePipelineId) }
  );
  const projectStages = React.useMemo(
    () => getProjectStagesFromPipelineStages((activePipeline?.stages ?? []) as Array<Record<string, unknown>>),
    [activePipeline?.stages]
  );

  const { data = [], isLoading } = trpc.projects.list.useQuery({
    search: search || undefined,
    stage: (stage as ProjectStage) || undefined,
    serviceType: (serviceType as any) || undefined,
    status: (status as 'active' | 'completed' | 'on_hold' | 'cancelled') || undefined,
    assignedUserId: assignedUserId || undefined,
    companyId: companyId || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    isDelayed: isDelayed || undefined,
  });

  const projects = data as ProjectRecord[];
  const activeFilters = [
    search && { field: 'search', operator: 'contains', value: search },
    stage && { field: 'stage', operator: 'eq', value: stage },
    status && { field: 'status', operator: 'eq', value: status },
    serviceType && { field: 'serviceType', operator: 'eq', value: serviceType },
    assignedUserId && { field: 'assignedUserId', operator: 'eq', value: assignedUserId },
    companyId && { field: 'companyId', operator: 'eq', value: companyId },
    dateFrom && { field: 'dateFrom', operator: 'gte', value: dateFrom },
    dateTo && { field: 'dateTo', operator: 'lte', value: dateTo },
    isDelayed && { field: 'isDelayed', operator: 'eq', value: true },
  ].filter(Boolean) as Array<{ field: string; operator: string; value: unknown }>;

  function resetFilters() {
    setSearch('');
    setStage('');
    setStatus('');
    setServiceType('');
    setAssignedUserId('');
    setCompanyId('');
    setDateFrom('');
    setDateTo('');
    setIsDelayed(false);
    setActiveViewId('');
  }

  function loadSavedView(savedView: { id: string; filters: unknown }) {
    resetFilters();
    const conditions = ((savedView.filters as { conditions?: Array<{ field: string; value: unknown }> })?.conditions ?? []);
    for (const condition of conditions) {
      const value = String(condition.value ?? '');
      if (condition.field === 'search') setSearch(value);
      if (condition.field === 'stage') setStage(value);
      if (condition.field === 'status') setStatus(value);
      if (condition.field === 'serviceType') setServiceType(value);
      if (condition.field === 'assignedUserId' || condition.field === 'ownerId') setAssignedUserId(value);
      if (condition.field === 'companyId') setCompanyId(value);
      if (condition.field === 'dateFrom') setDateFrom(value);
      if (condition.field === 'dateTo') setDateTo(value);
      if (condition.field === 'isDelayed') setIsDelayed(condition.value === true || value === 'true');
    }
    setActiveViewId(savedView.id);
  }

  function removeFilter(field: string) {
    if (field === 'search') setSearch('');
    if (field === 'stage') setStage('');
    if (field === 'status') setStatus('');
    if (field === 'serviceType') setServiceType('');
    if (field === 'assignedUserId') setAssignedUserId('');
    if (field === 'companyId') setCompanyId('');
    if (field === 'dateFrom') setDateFrom('');
    if (field === 'dateTo') setDateTo('');
    if (field === 'isDelayed') setIsDelayed(false);
    setActiveViewId('');
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--surface-page)]">
      <div className="flex flex-shrink-0 flex-col gap-3 border-b border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-3 shadow-[0_1px_0_var(--border-subtle),0_2px_6px_rgba(15,20,40,0.04)] lg:flex-row lg:items-center lg:justify-between lg:px-6">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-[-0.025em] text-[var(--text-primary)]">
            <FolderKanban className="h-5 w-5 text-[var(--accent)]" />
            Projects
          </h1>
          <p className="text-sm text-[var(--text-tertiary)]">Delivery workspace linked to Active Pipeline prospects.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search projects..."
              className="h-8 w-56 rounded-lg border border-[var(--border-default)] bg-[var(--surface-input)] pl-8 pr-3 text-sm outline-none focus:border-[var(--accent)]"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((current) => !current)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-white px-3 text-sm font-medium text-[var(--text-secondary)]"
          >
            <Filter className="h-3.5 w-3.5" />
            Filters{activeFilters.length ? ` (${activeFilters.length})` : ''}
          </button>
          <div className="flex items-center rounded-[9px] border border-[var(--border-default)] bg-[var(--surface-input)] p-[3px]">
            {[
              { key: 'board', icon: LayoutGrid, label: 'Board' },
              { key: 'list', icon: List, label: 'List' },
              { key: 'timeline', icon: CalendarDays, label: 'Timeline' },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  onClick={() => setView(item.key as ViewMode)}
                  className={`flex h-[30px] items-center gap-1 rounded-[7px] px-3 text-[12.5px] font-semibold transition-all ${
                    view === item.key ? 'bg-white text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => {
              const name = window.prompt('Project name');
              if (!name?.trim()) return;
              createProject.mutate({ name: name.trim(), serviceType: 'custom' });
            }}
            className="btn-primary inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm"
          >
            <Plus className="h-4 w-4" />
            Add Project
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--surface-page)] px-6 py-3">
          <select value={stage} onChange={(event) => setStage(event.target.value)} className="h-8 rounded-lg border border-[var(--border-default)] bg-white px-2 text-sm">
            <option value="">All stages</option>
            {projectStages.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-8 rounded-lg border border-[var(--border-default)] bg-white px-2 text-sm">
            <option value="">All statuses</option>
            <option value="active">Active</option><option value="completed">Completed</option><option value="on_hold">On hold</option><option value="cancelled">Cancelled</option>
          </select>
          <select value={serviceType} onChange={(event) => setServiceType(event.target.value)} className="h-8 rounded-lg border border-[var(--border-default)] bg-white px-2 text-sm">
            <option value="">All services</option>
            {Object.entries({ soc2_type1: 'SOC 2 Type I', soc2_type2: 'SOC 2 Type II', iso27001: 'ISO 27001', dpdp: 'DPDP', vapt: 'VAPT', cspm: 'CSPM', ai_governance: 'AI Governance', cert_in: 'CERT-IN', custom: 'Custom' }).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <select value={assignedUserId} onChange={(event) => setAssignedUserId(event.target.value)} className="h-8 rounded-lg border border-[var(--border-default)] bg-white px-2 text-sm">
            <option value="">All assigned users</option>
            {users.map((user) => <option key={user.id} value={user.id}>{user.firstName} {user.lastName}</option>)}
          </select>
          <select value={companyId} onChange={(event) => setCompanyId(event.target.value)} className="h-8 max-w-48 rounded-lg border border-[var(--border-default)] bg-white px-2 text-sm">
            <option value="">All companies</option>
            {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select>
          <input type="date" title="Project start from" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="h-8 rounded-lg border border-[var(--border-default)] bg-white px-2 text-sm" />
          <input type="date" title="Project end to" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="h-8 rounded-lg border border-[var(--border-default)] bg-white px-2 text-sm" />
          <label className={`inline-flex h-8 items-center gap-2 rounded-lg border px-2.5 text-sm ${isDelayed ? 'border-red-300 bg-red-50 text-red-700' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'}`}>
            <input type="checkbox" checked={isDelayed} onChange={(event) => setIsDelayed(event.target.checked)} />Delayed only
          </label>
          <button type="button" onClick={resetFilters} disabled={!activeFilters.length} className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--border-default)] px-2.5 text-sm text-[var(--text-secondary)] disabled:opacity-40"><RotateCcw className="h-3.5 w-3.5" />Reset</button>
          <SavedViewsBar entityType="project" activeFilters={{ conditions: activeFilters, logic: 'AND' }} activeViewId={activeViewId} onLoadView={loadSavedView} />
          {activeFilters.length > 0 && (
            <div className="basis-full flex flex-wrap items-center gap-1.5 border-t border-[var(--border-subtle)] pt-2 text-xs text-[var(--text-tertiary)]">
              {activeFilters.map((filter) => <button type="button" onClick={() => removeFilter(filter.field)} key={filter.field} className="inline-flex items-center gap-1 rounded-md bg-[var(--accent-light)] px-2 py-1 text-[var(--accent)]">{filter.field}: {String(filter.value)}<X className="h-3 w-3" /></button>)}
              <span className="ml-1 font-semibold">{projects.length} projects match</span>
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex gap-4 p-4">
          {[1, 2, 3].map((item) => (
            <div key={item} className="w-[282px] rounded-[14px] border border-white/80 bg-white/55 p-3">
              <div className="skeleton mb-4 h-4 w-32" />
              <div className="skeleton mb-2 h-28 rounded-[10px]" />
              <div className="skeleton h-28 rounded-[10px]" />
            </div>
          ))}
        </div>
      ) : view === 'board' ? (
        <BoardView projects={projects} stages={projectStages} />
      ) : view === 'list' ? (
        <ListView projects={projects} stages={projectStages} />
      ) : (
        <TimelineView projects={projects} stages={projectStages} />
      )}
    </div>
  );
}

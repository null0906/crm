'use client';

import React from 'react';
import {
  Activity,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronRight,
  Flame,
  FolderKanban,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { SlideOverPanel } from '@/components/shared/SlideOverPanel';
import { formatDate, formatRelative, getInitials } from '@/lib/formatters';
import { getRoleDisplayName } from '@/lib/roles';

type Row = Record<string, any>;

function personName(row: Row, prefix = 'owner') {
  const first = row[`${prefix}_first_name`];
  const last = row[`${prefix}_last_name`];
  return [first, last].filter(Boolean).join(' ').trim();
}

function probability(row: Row) {
  return Number(row.probability ?? row.default_probability ?? 0);
}

function statusLabel(value: unknown) {
  return String(value ?? '').replace(/_/g, ' ');
}

function EmptyState({ label }: { label: string }) {
  return <div className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">{label}</div>;
}

export default function ExecutiveOverviewPage() {
  const [selectedMemberId, setSelectedMemberId] = React.useState('');
  const { data, isLoading, error } = trpc.executiveOverview.summary.useQuery();
  const { data: detail, isLoading: detailLoading } = trpc.executiveOverview.memberDetail.useQuery(
    { userId: selectedMemberId },
    { enabled: Boolean(selectedMemberId) }
  );

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-slate-500">
        {error.message}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--surface-page)] p-4 md:p-6">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <section className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">Executive Overview</h1>
            <p className="text-sm text-[var(--text-tertiary)]">Projects, hot prospects, completion movement, and team workload.</p>
          </div>
        </section>

        {isLoading ? (
          <div className="grid gap-4 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => <div key={index} className="skeleton h-[420px] rounded-xl" />)}
          </div>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-3">
              <OverviewCard
                title="Active Projects"
                value={data?.totals.activeProjects ?? 0}
                icon={FolderKanban}
                tone="blue"
              >
                {(data?.activeProjects ?? []).length === 0 ? <EmptyState label="No active projects." /> : (
                  (data?.activeProjects ?? []).map((project) => (
                    <ProjectListItem key={String(project.id)} project={project} mode="active" />
                  ))
                )}
              </OverviewCard>

              <OverviewCard
                title="Hot Sales Prospects"
                value={data?.totals.hotProspects ?? 0}
                icon={Flame}
                tone="amber"
              >
                {(data?.hotProspects ?? []).length === 0 ? <EmptyState label="No close-to-closing prospects." /> : (
                  (data?.hotProspects ?? []).map((prospect) => (
                    <ProspectListItem key={String(prospect.id)} prospect={prospect} />
                  ))
                )}
              </OverviewCard>

              <OverviewCard
                title="Completed Projects"
                value={data?.totals.completedProjects ?? 0}
                icon={CheckCircle2}
                tone="green"
              >
                {(data?.completedProjects ?? []).length === 0 ? <EmptyState label="No completed projects." /> : (
                  (data?.completedProjects ?? []).map((project) => (
                    <ProjectListItem key={String(project.id)} project={project} mode="completed" />
                  ))
                )}
              </OverviewCard>
            </div>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-black text-[var(--text-primary)]">Team Members</h2>
                  <p className="text-xs text-[var(--text-tertiary)]">Click a member to inspect prospects, projects, and recent activity.</p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-500 shadow-sm ring-1 ring-slate-200">
                  {data?.totals.members ?? 0} members
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {(data?.members ?? []).map((member) => (
                  <MemberCard key={String(member.id)} member={member} onOpen={() => setSelectedMemberId(String(member.id))} />
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      <SlideOverPanel
        open={Boolean(selectedMemberId)}
        onClose={() => setSelectedMemberId('')}
        title={detail?.member ? `${detail.member.first_name} ${detail.member.last_name}` : 'Member Overview'}
        width="xl"
      >
        {detailLoading ? (
          <div className="p-6 text-sm text-slate-400">Loading member details...</div>
        ) : detail ? (
          <MemberDetail detail={detail as Row} />
        ) : null}
      </SlideOverPanel>
    </div>
  );
}

function OverviewCard({
  title,
  value,
  icon: Icon,
  tone,
  children,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  tone: 'blue' | 'amber' | 'green';
  children: React.ReactNode;
}) {
  const tones = {
    blue: 'bg-blue-50 text-blue-700 ring-blue-100',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100',
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  };

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-white shadow-sm">
      <div className="border-b border-[var(--border-subtle)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-4xl font-black tracking-[-0.05em] text-[var(--text-primary)]">{value}</p>
            <h2 className="mt-1 text-sm font-black uppercase tracking-[0.06em] text-[var(--text-tertiary)]">{title}</h2>
          </div>
          <div className={`flex h-11 w-11 items-center justify-center rounded-lg ring-1 ${tones[tone]}`}>
            <Icon className="h-5 w-5" strokeWidth={1.9} />
          </div>
        </div>
      </div>
      <div className="max-h-[330px] space-y-2 overflow-y-auto p-3">
        {children}
      </div>
    </section>
  );
}

function ProjectListItem({ project, mode }: { project: Row; mode: 'active' | 'completed' }) {
  const owner = personName(project);
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 hover:bg-slate-50">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900">{project.name}</p>
          <p className="truncate text-xs text-slate-500">{project.company_name ?? 'No company'}{owner ? ` · ${owner}` : ''}</p>
        </div>
        <span className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-black uppercase ${mode === 'active' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
          {statusLabel(project.stage)}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-400">
        <span>{mode === 'completed' ? `Completed ${formatDate(project.actual_end_date)}` : `Due ${formatDate(project.end_date)}`}</span>
        <span className="font-bold text-slate-600">{Number(project.progress_percent ?? 0)}%</span>
      </div>
    </div>
  );
}

function ProspectListItem({ prospect }: { prospect: Row }) {
  const owner = personName(prospect);
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 hover:bg-slate-50">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900">{prospect.title}</p>
          <p className="truncate text-xs text-slate-500">{prospect.company_name ?? 'No company'}{owner ? ` · ${owner}` : ''}</p>
        </div>
        <span className="shrink-0 rounded-md bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-700">
          {probability(prospect)}%
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-400">
        <span className="capitalize">{prospect.stage_name ?? 'Stage not set'}</span>
        <span>{formatDate(prospect.expected_close_date)}</span>
      </div>
    </div>
  );
}

function MemberCard({ member, onOpen }: { member: Row; onOpen: () => void }) {
  const name = `${member.first_name ?? ''} ${member.last_name ?? ''}`.trim();
  return (
    <button
      onClick={onOpen}
      className="group rounded-xl border border-[var(--border-subtle)] bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-[var(--accent-medium)] hover:shadow-[var(--shadow-card-hover)]"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-[var(--accent)] to-[var(--stage-discovery)] text-sm font-black text-white shadow-sm">
          {getInitials(member.first_name, member.last_name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-slate-900">{name}</p>
          <p className="truncate text-xs text-slate-400">{getRoleDisplayName(String(member.role_name ?? member.role_slug ?? ''))}</p>
        </div>
        <ChevronRight className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-[var(--accent)]" />
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2">
        <MiniMetric label="Prospects" value={member.prospect_count} />
        <MiniMetric label="Projects" value={member.project_count} />
        <MiniMetric label="Done" value={member.completed_project_count} />
        <MiniMetric label="Activity" value={member.activity_count} />
      </div>
      <p className="mt-3 text-xs text-slate-400">
        Latest activity {member.latest_activity_at ? formatRelative(member.latest_activity_at) : 'not recorded'}
      </p>
    </button>
  );
}

function MiniMetric({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-2 text-center">
      <p className="text-base font-black text-slate-900">{Number(value ?? 0)}</p>
      <p className="text-[10px] font-bold uppercase tracking-[0.04em] text-slate-400">{label}</p>
    </div>
  );
}

function MemberDetail({ detail }: { detail: Row }) {
  const member = detail.member as Row;
  const prospects = (detail.prospects ?? []) as Row[];
  const projects = (detail.projects ?? []) as Row[];
  const activities = (detail.activities ?? []) as Row[];

  return (
    <div className="space-y-5 p-5">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-sm font-black text-[var(--accent)] shadow-sm">
            {getInitials(member.first_name, member.last_name)}
          </div>
          <div>
            <p className="text-base font-black text-slate-900">{member.first_name} {member.last_name}</p>
            <p className="text-xs text-slate-500">{member.email} · {getRoleDisplayName(String(member.role_name ?? member.role_slug ?? ''))}</p>
          </div>
        </div>
      </div>

      <DetailSection title="Prospects They Are Working On" icon={Flame} count={prospects.length}>
        {prospects.length === 0 ? <EmptyState label="No active prospects for this member." /> : prospects.map((prospect) => (
          <div key={prospect.id} className="rounded-lg border border-slate-100 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">{prospect.title}</p>
                <p className="text-xs text-slate-500">{prospect.company_name ?? 'No company'} · {prospect.stage_name ?? 'No stage'}</p>
              </div>
              <span className="rounded-md bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-700">{probability(prospect)}%</span>
            </div>
            <p className="mt-2 text-xs text-slate-400">{prospect.involvement} · Expected close {formatDate(prospect.expected_close_date)}</p>
          </div>
        ))}
      </DetailSection>

      <DetailSection title="Project Involvement" icon={BriefcaseBusiness} count={projects.length}>
        {projects.length === 0 ? <EmptyState label="No project involvement for this member." /> : projects.map((project) => (
          <div key={project.id} className="rounded-lg border border-slate-100 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">{project.name}</p>
                <p className="text-xs text-slate-500">{project.company_name ?? 'No company'} · {statusLabel(project.stage)}</p>
              </div>
              <span className="rounded-md bg-blue-100 px-2 py-1 text-[10px] font-black uppercase text-blue-700">{statusLabel(project.status)}</span>
            </div>
            <p className="mt-2 text-xs text-slate-400">{project.involvement} · {Number(project.progress_percent ?? 0)}% complete</p>
          </div>
        ))}
      </DetailSection>

      <DetailSection title="Recent Activity" icon={Activity} count={activities.length}>
        {activities.length === 0 ? <EmptyState label="No recent activity for this member." /> : activities.map((activity) => (
          <div key={activity.id} className="rounded-lg border border-slate-100 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">{activity.subject ?? statusLabel(activity.activity_type)}</p>
                <p className="text-xs text-slate-500">
                  {[activity.deal_title, activity.company_name, [activity.contact_first_name, activity.contact_last_name].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || statusLabel(activity.activity_type)}
                </p>
              </div>
              <span className="shrink-0 text-xs text-slate-400">{formatRelative(activity.occurred_at)}</span>
            </div>
          </div>
        ))}
      </DetailSection>

      <div className="flex justify-end">
        <Button variant="outline" onClick={() => window.print()}>
          Print
        </Button>
      </div>
    </div>
  );
}

function DetailSection({ title, icon: Icon, count, children }: { title: string; icon: React.ElementType; count: number; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-slate-400" />
          <h3 className="text-sm font-black text-slate-900">{title}</h3>
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">{count}</span>
      </div>
      <div className="max-h-[280px] space-y-2 overflow-y-auto p-3">
        {children}
      </div>
    </section>
  );
}

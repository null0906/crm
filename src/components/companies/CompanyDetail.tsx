'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Globe, Phone, X, Pencil, Trash2, FolderKanban, CalendarDays, CheckSquare, ArrowLeft } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { SlideOverPanel } from '@/components/shared/SlideOverPanel';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DetailSkeleton } from '@/components/shared/LoadingSkeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { CompanyTypeBadge } from './CompanyTypeBadge';
import { CompanyForm } from './CompanyForm';
import { TagBadge } from '@/components/tags/TagBadge';
import { ActivityFeed } from '@/components/activities/ActivityFeed';
import { LogDemoPanel } from '@/components/activities/LogDemoPanel';
import { formatCurrency, formatDate, formatRelative } from '@/lib/formatters';
import { toast } from 'sonner';

interface CompanyDetailProps {
  companyId: string;
  open: boolean;
  onClose: () => void;
  onDeleted?: () => void;
  fullPage?: boolean;
}

export function CompanyDetail({ companyId, open, onClose, onDeleted, fullPage }: CompanyDetailProps) {
  const utils = trpc.useUtils();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: company, isLoading, error } = trpc.companies.getById.useQuery(
    { id: companyId },
    { enabled: !!companyId && open }
  );

  const removeTags = trpc.companies.removeTags.useMutation({
    onSuccess: () => {
      void utils.companies.getById.invalidate({ id: companyId });
      toast.success('Tag removed');
    },
  });

  const deleteCompany = trpc.companies.delete.useMutation({
    onSuccess: () => {
      toast.success('Company deleted');
      void utils.companies.list.invalidate();
      setDeleteOpen(false);
      onClose();
      onDeleted?.();
    },
    onError: (err) => toast.error('Failed to delete', { description: err.message }),
  });

  if (!open) return null;

  const tags = (company?.tags as Array<{ id: string; name: string; color: string }>) ?? [];
  const metrics = company?.metrics as {
    contactCount: number;
    pipelineValue?: string | number;
    openDeals?: number;
    activeProjects?: number;
    lastActivityAt?: string | Date | null;
  } | undefined;

  const name = company?.name as string | undefined;
  const industry = company?.industry as string | undefined;
  const companyType = (company?.companyType as string | undefined) ?? 'prospect';
  const companySize = company?.companySize as string | undefined;
  const website = company?.website as string | undefined;
  const phone = company?.phone as string | undefined;
  const domain = company?.domain as string | undefined;
  const city = company?.city as string | undefined;
  const country = company?.country as string | undefined;
  const location = company?.location as string | undefined;
  const annualRevenueRange = company?.annualRevenueRange as string | undefined;
  const lastContactedAt = company?.lastContactedAt as Date | undefined;
  const createdAt = company?.createdAt as Date | undefined;
  const ownerFirstName = company?.ownerFirstName as string | undefined;
  const ownerLastName = company?.ownerLastName as string | undefined;
  const description = company?.description as string | undefined;
  const ownerId = company?.ownerId as string | null | undefined;

  const editDefaults = company ? {
    name: name ?? '',
    industry: industry ?? '',
    companyType: (companyType as 'prospect' | 'customer' | 'partner' | 'vendor' | 'competitor' | 'other') ?? 'prospect',
    companySize: (companySize as '1-10' | '11-50' | '51-200' | '201-500' | '501-1000' | '1001-5000' | '5000+') ?? undefined,
    website: website ?? '',
    phone: phone ?? '',
    domain: domain ?? '',
    city: city ?? '',
    country: country ?? '',
    location: location ?? '',
    annualRevenueRange: annualRevenueRange ?? '',
    ownerId: ownerId ?? '',
    description: description ?? '',
    status: (company?.status as 'active' | 'inactive' | 'churned' | 'archived') ?? 'active',
  } : undefined;

  const bodyContent = isLoading ? (
    <DetailSkeleton />
  ) : error ? (
    <div className="p-6 text-center">
      <p className="text-sm font-semibold text-red-700">Could not load company</p>
      <p className="mt-2 text-sm text-slate-500">{error.message}</p>
      <Button variant="outline" className="mt-4" onClick={onClose}>Close</Button>
    </div>
  ) : !company ? (
    <div className="p-6 text-center text-slate-500">Company not found</div>
  ) : (
    <div>
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-slate-200">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            {fullPage && (
              <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1 -ml-1" title="Back">
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <Avatar className="w-12 h-12">
              <AvatarFallback className="text-base bg-indigo-100 text-indigo-700 font-semibold">
                {name?.substring(0, 2).toUpperCase() ?? '?'}
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-xl font-semibold text-slate-900">{name}</h2>
              {industry && <p className="text-sm text-slate-500">{industry}</p>}
              <div className="flex items-center gap-2 mt-1.5">
                <CompanyTypeBadge type={companyType} />
                {companySize && (
                  <Badge variant="outline" className="text-xs">{companySize} employees</Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditOpen(true)}
              className="text-slate-400 hover:text-blue-600"
              title="Edit company"
            >
              <Pencil className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDeleteOpen(true)}
              className="text-slate-400 hover:text-red-600"
              title="Delete company"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
            {!fullPage && (
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 ml-1">
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {tags.map((tag) => (
              <TagBadge
                key={tag.id}
                name={tag.name}
                color={tag.color}
                onRemove={() => removeTags.mutate({ id: companyId, tagIds: [tag.id] })}
              />
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 mt-4">
          {website && (
            <Button size="sm" variant="outline" asChild>
              <a href={website} target="_blank" rel="noopener noreferrer">
                <Globe className="w-3.5 h-3.5 mr-1" />
                Website
              </a>
            </Button>
          )}
          {phone && (
            <Button size="sm" variant="outline" asChild>
              <a href={`tel:${phone}`}>
                <Phone className="w-3.5 h-3.5 mr-1" />
                Call
              </a>
            </Button>
          )}
        </div>

        {metrics && (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <CompanyMetricCard label="Contacts" value={String(metrics.contactCount ?? 0)} />
            <CompanyMetricCard label="Pipeline" value={formatCurrency(metrics.pipelineValue ?? 0)} />
            <CompanyMetricCard label="Open Prospects" value={String(metrics.openDeals ?? 0)} />
            <CompanyMetricCard label="Active Projects" value={String(metrics.activeProjects ?? 0)} />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="px-6 py-4">
        <Tabs defaultValue="overview">
          <div className="overflow-x-auto -mx-1 px-1">
            <TabsList className="w-max min-w-full">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="contacts">Contacts</TabsTrigger>
              <TabsTrigger value="deals">Prospects</TabsTrigger>
              <TabsTrigger value="projects">Projects</TabsTrigger>
              <TabsTrigger value="demos">Demos</TabsTrigger>
              <TabsTrigger value="tasks">Tasks</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="mt-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              {domain && <InfoField label="Domain" value={domain} mono />}
              {phone && <InfoField label="Phone" value={phone} />}
              {city && <InfoField label="City" value={city} />}
              {country && <InfoField label="Country" value={country} />}
              {location && <InfoField label="Location" value={location} />}
              {annualRevenueRange && <InfoField label="Annual Revenue" value={annualRevenueRange} />}
              {metrics && metrics.contactCount > 0 && (
                <InfoField label="Contacts" value={String(metrics.contactCount)} />
              )}
              {createdAt && <InfoField label="Created" value={formatDate(createdAt)} />}
              {lastContactedAt && <InfoField label="Last Contacted" value={formatRelative(lastContactedAt)} />}
              {ownerFirstName && (
                <InfoField label="Owner" value={`${ownerFirstName} ${ownerLastName ?? ''}`} />
              )}
            </div>

            {description && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Notes</p>
                <p className="text-sm text-slate-700">{description}</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="activity" className="mt-4">
            <ActivityFeed companyId={companyId} />
          </TabsContent>

          <TabsContent value="contacts" className="mt-4">
            <CompanyContacts companyId={companyId} />
          </TabsContent>

          <TabsContent value="deals" className="mt-4">
            <CompanyDeals companyId={companyId} />
          </TabsContent>

          <TabsContent value="projects" className="mt-4">
            <CompanyProjects companyId={companyId} />
          </TabsContent>

          <TabsContent value="demos" className="mt-4">
            <CompanyDemoRecords companyId={companyId} />
          </TabsContent>

          <TabsContent value="tasks" className="mt-4">
            <CompanyTasks companyId={companyId} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );

  const modals = (
    <>
      <SlideOverPanel open={editOpen} onClose={() => setEditOpen(false)} title="Edit Company" width="md">
        <div className="p-6">
          <CompanyForm
            mode="edit"
            companyId={companyId}
            defaultValues={editDefaults}
            existingTags={tags}
            onSuccess={() => {
              setEditOpen(false);
              void utils.companies.getById.invalidate({ id: companyId });
            }}
            onCancel={() => setEditOpen(false)}
          />
        </div>
      </SlideOverPanel>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete company?"
        description={`${name} will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        loading={deleteCompany.isPending}
        onConfirm={() => deleteCompany.mutate({ id: companyId })}
      />
    </>
  );

  if (fullPage) {
    return (
      <>
        <div className="min-h-full bg-slate-50">
          <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              {bodyContent}
            </div>
          </div>
        </div>
        {modals}
      </>
    );
  }

  return (
    <>
      <SlideOverPanel open={open} onClose={onClose} width="lg">
        {bodyContent}
      </SlideOverPanel>
      {modals}
    </>
  );
}

function CompanyDemoRecords({ companyId }: { companyId: string }) {
  const [showForm, setShowForm] = React.useState(false);
  const { data: demos = [], isLoading } = trpc.demoRecords.list.useQuery({ companyId });

  const outcomeClass: Record<string, string> = {
    interested: 'border-indigo-200 bg-indigo-50 text-indigo-700',
    completed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    needs_follow_up: 'border-orange-200 bg-orange-50 text-orange-700',
    no_show: 'border-red-200 bg-red-50 text-red-700',
    not_interested: 'border-red-200 bg-red-50 text-red-700',
    rescheduled: 'border-amber-200 bg-amber-50 text-amber-700',
    cancelled: 'border-slate-200 bg-slate-50 text-slate-600',
  };

  return (
    <div className="space-y-3">
      {!showForm && (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="w-full flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-sm text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
        >
          <CalendarDays className="h-4 w-4" />
          Log Demo / Discovery Call
        </button>
      )}

      {showForm && (
        <LogDemoPanel
          companyId={companyId}
          onSuccess={() => setShowForm(false)}
          onCancel={() => setShowForm(false)}
        />
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="skeleton h-16 rounded-lg" />)}
        </div>
      ) : demos.length === 0 && !showForm ? (
        <div className="py-8 text-center text-slate-400">
          <CalendarDays className="mx-auto mb-2 h-8 w-8" />
          <p className="text-sm">No demo or discovery records logged yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {demos.map((demo) => {
            const d = demo as Record<string, unknown>;
            const contactName = [d.contactFirstName, d.contactLastName].filter(Boolean).join(' ').trim();
            const callType = String(d.callType ?? 'demo').replace(/_/g, ' ');
            const outcome = String(d.outcome ?? '');
            return (
              <div key={String(d.id)} className="rounded-lg border border-slate-100 bg-white px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md border border-blue-100 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold capitalize text-blue-700">
                        {callType}
                      </span>
                      {outcome && (
                        <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold capitalize ${outcomeClass[outcome] ?? 'border-slate-200 bg-white text-slate-600'}`}>
                          {outcome.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-sm font-semibold text-slate-800">
                      {contactName || String(d.companyName ?? 'Company demo')}
                      {d.dealTitle ? <span className="font-normal text-slate-400"> · {String(d.dealTitle)}</span> : null}
                    </p>
                    {Boolean(d.clientRequirements) && (
                      <p className="mt-0.5 text-xs text-slate-500 line-clamp-1">Req: {String(d.clientRequirements)}</p>
                    )}
                    {Boolean(d.painPoints) && (
                      <p className="mt-0.5 text-xs text-slate-500 line-clamp-1">Pain: {String(d.painPoints)}</p>
                    )}
                    {Boolean(d.nextAction) && (
                      <p className="mt-1 text-xs text-blue-600 font-medium">
                        → {String(d.nextAction)}
                        {d.nextActionDate ? ` · ${formatDate(new Date(String(d.nextActionDate)))}` : ''}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 font-mono text-xs text-slate-400">
                    {d.scheduledAt ? formatDate(new Date(String(d.scheduledAt))) : 'No date'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CompanyTasks({ companyId }: { companyId: string }) {
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = React.useState(false);
  const [taskSubject, setTaskSubject] = React.useState('');
  const [taskDueDate, setTaskDueDate] = React.useState('');
  const [taskPriority, setTaskPriority] = React.useState('medium');

  const { data: projectTasks = [], isLoading: loadingProject } = trpc.projects.tasksByCompany.useQuery({ companyId });
  const { data: activityTaskData, isLoading: loadingActivity } = trpc.activities.list.useQuery({
    companyId,
    activityType: 'task',
    pagination: { limit: 50 },
  });
  const openFollowUps = (activityTaskData?.items ?? []).filter((t) => !(t as Record<string, unknown>).taskCompletedAt);

  const createFollowUp = trpc.activities.create.useMutation({
    onSuccess: () => {
      toast.success('Follow-up added');
      void utils.activities.list.invalidate();
      setShowForm(false);
      setTaskSubject('');
      setTaskDueDate('');
      setTaskPriority('medium');
    },
    onError: (err) => toast.error('Failed to add follow-up', { description: err.message }),
  });

  const completeFollowUp = trpc.activities.update.useMutation({
    onSuccess: () => {
      toast.success('Task marked complete');
      void utils.activities.list.invalidate();
    },
    onError: (err) => toast.error('Failed to update', { description: err.message }),
  });

  const priorityDot: Record<string, string> = {
    urgent: 'bg-red-500',
    high: 'bg-orange-500',
    medium: 'bg-amber-500',
    low: 'bg-slate-400',
  };

  const inputCls = 'flex h-8 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500';

  return (
    <div className="space-y-3">
      {!showForm && (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="w-full flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-sm text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
        >
          <CheckSquare className="h-4 w-4" />
          Add Follow-up Task
        </button>
      )}

      {showForm && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
          <input
            value={taskSubject}
            onChange={(e) => setTaskSubject(e.target.value)}
            placeholder="Task subject *"
            className={inputCls}
          />
          <div className="flex gap-2">
            <input
              type="date"
              value={taskDueDate}
              onChange={(e) => setTaskDueDate(e.target.value)}
              className={inputCls}
            />
            <select
              value={taskPriority}
              onChange={(e) => setTaskPriority(e.target.value)}
              className={inputCls}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => { setShowForm(false); setTaskSubject(''); setTaskDueDate(''); setTaskPriority('medium'); }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!taskSubject.trim() || createFollowUp.isPending}
              onClick={() => {
                if (!taskSubject.trim()) return;
                createFollowUp.mutate({
                  activityType: 'task',
                  subject: taskSubject.trim(),
                  taskDueDate: taskDueDate || null,
                  taskPriority: taskPriority as 'low' | 'medium' | 'high' | 'urgent',
                  companyId,
                });
              }}
            >
              {createFollowUp.isPending ? 'Adding...' : 'Add Task'}
            </Button>
          </div>
        </div>
      )}

      {(loadingProject || loadingActivity) ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="skeleton h-14 rounded-lg" />)}
        </div>
      ) : (
        <>
          {openFollowUps.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 px-1">Follow-ups</p>
              {openFollowUps.map((item) => {
                const t = item as Record<string, unknown>;
                const due = t.taskDueDate ? new Date(String(t.taskDueDate)) : null;
                const today = new Date(); today.setHours(0, 0, 0, 0);
                const overdue = due ? due < today : false;
                const pri = String(t.taskPriority ?? 'medium');
                return (
                  <div key={String(t.id)} className="flex items-center gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => completeFollowUp.mutate({ id: String(t.id), taskCompletedAt: new Date().toISOString() })}
                      className="h-4 w-4 shrink-0 rounded border-2 border-slate-300 hover:border-emerald-500 hover:bg-emerald-50 transition-colors"
                      title="Mark complete"
                    />
                    <span className={`h-2 w-2 shrink-0 rounded-full ${priorityDot[pri] ?? priorityDot.medium}`} />
                    <p className="min-w-0 flex-1 truncate text-sm text-slate-800">{String(t.subject ?? '')}</p>
                    <span className={`shrink-0 font-mono text-xs ${overdue ? 'font-semibold text-red-600' : 'text-slate-400'}`}>
                      {due ? formatDate(due) : 'No due date'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {projectTasks.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 px-1">Project Tasks</p>
              {projectTasks.map((task) => {
                const t = task as Record<string, unknown>;
                const due = t.dueDate ? new Date(String(t.dueDate)) : null;
                const today = new Date(); today.setHours(0, 0, 0, 0);
                const overdue = due ? due < today : false;
                const assignee = [t.assigneeFirstName, t.assigneeLastName].filter(Boolean).join(' ').trim();
                return (
                  <div key={String(t.id)} className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${priorityDot[String(t.priority ?? 'medium')] ?? priorityDot.medium}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">{String(t.title ?? '')}</p>
                      <p className="truncate text-xs text-slate-400">
                        {String(t.projectName ?? 'Project')} · {String(t.status ?? 'pending').replace(/_/g, ' ')}
                        {assignee ? ` · ${assignee}` : ''}
                      </p>
                    </div>
                    <span className={`shrink-0 font-mono text-xs ${overdue ? 'font-semibold text-red-600' : 'text-slate-400'}`}>
                      {due ? formatDate(due) : 'No due date'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {openFollowUps.length === 0 && projectTasks.length === 0 && !showForm && (
            <div className="py-8 text-center text-slate-400">
              <CheckSquare className="mx-auto mb-2 h-8 w-8" />
              <p className="text-sm">No open tasks. Add a follow-up to get started.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CompanyProjects({ companyId }: { companyId: string }) {
  const { data: projects = [], isLoading } = trpc.projects.getByCompany.useQuery({ companyId });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-14 rounded-lg" />
        ))}
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="py-10 text-center text-slate-400">
        <FolderKanban className="mx-auto mb-2 h-8 w-8" />
        <p className="text-sm">No projects linked to this company yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {projects.map((project) => {
        const p = project as Record<string, any>;
        const progress = Number(p.progressPercent ?? 0);
        return (
          <Link
            key={p.id}
            href={`/projects/${p.id}`}
            className="block rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 transition-colors hover:border-blue-200 hover:bg-white"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-slate-800">{p.name}</p>
                <p className="truncate text-[11px] text-slate-400">
                  {p.stage} · {progress}% complete
                  {p.isDelayed ? ' · Delayed' : ''}
                </p>
              </div>
              <span className="font-mono text-[12px] font-bold text-slate-700">
                ₹{Number(p.contractValue ?? 0).toLocaleString('en-IN')}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-blue-600"
                style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
              />
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function InfoField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className={`text-sm text-slate-800 ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}

function CompanyMetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function CompanyDeals({ companyId }: { companyId: string }) {
  const { data: company } = trpc.companies.getById.useQuery({ id: companyId });
  const isPartnerCompany = String(company?.companyType ?? '') === 'partner';
  const partnerDealsQuery = trpc.partners.dealsByPartner.useQuery(
    { partnerCompanyId: companyId },
    { enabled: isPartnerCompany }
  );
  const companyDealsQuery = trpc.deals.byCompany.useQuery(
    { companyId },
    { enabled: !isPartnerCompany }
  );
  const deals = (isPartnerCompany ? partnerDealsQuery.data : companyDealsQuery.data) ?? [];
  const isLoading = isPartnerCompany ? partnerDealsQuery.isLoading : companyDealsQuery.isLoading;

  const statusColor: Record<string, string> = {
    open: 'bg-blue-100 text-blue-700',
    won: 'bg-emerald-100 text-emerald-700',
    lost: 'bg-red-100 text-red-700',
    abandoned: 'bg-slate-100 text-slate-500',
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-12 rounded-lg" />
        ))}
      </div>
    );
  }

  if (deals.length === 0) {
    return (
      <div className="text-center py-10 text-slate-400">
        <p className="text-sm">
          {isPartnerCompany ? 'No sales prospects are linked to this partner yet.' : 'No prospects linked to this company yet.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {deals.map((deal) => {
        const d = deal as Record<string, unknown>;
        const status = (d.status as string) ?? 'open';
        const amount = d.amount ? Number(d.amount) : null;
        return (
          <div key={d.id as string} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-100 bg-slate-50 hover:bg-white hover:border-slate-200 transition-colors">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-slate-800 truncate">{d.title as string}</p>
              <p className="text-[11px] text-slate-400 truncate">
                {!!d.stageName && <span>{d.stageName as string}</span>}
                {!!d.primaryContactName && <span> · {d.primaryContactName as string}</span>}
                {!!d.companyName && isPartnerCompany && <span> · {d.companyName as string}</span>}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {amount !== null && (
                <span className="text-[12px] font-semibold text-slate-700">
                  ₹{amount.toLocaleString('en-IN')}
                </span>
              )}
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${statusColor[status] ?? 'bg-slate-100 text-slate-500'}`}>
                {status}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CompanyContacts({ companyId }: { companyId: string }) {
  const { data: contacts = [], isLoading } = trpc.contacts.byCompany.useQuery({ companyId });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-12 rounded-lg" />
        ))}
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <div className="text-center py-10 text-slate-400">
        <p className="text-sm">No contacts linked to this company yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {contacts.map((contact) => {
        const c = contact as Record<string, unknown>;
        return (
          <div key={c.id as string} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-100 bg-slate-50 hover:bg-white hover:border-slate-200 transition-colors">
            <Avatar className="w-8 h-8 flex-shrink-0">
              <AvatarFallback className="text-[11px] bg-blue-100 text-blue-700">
                {String(c.firstName ?? '').charAt(0)}{String(c.lastName ?? '').charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-slate-800 truncate">
                {c.firstName as string} {c.lastName as string}
              </p>
              <p className="text-[11px] text-slate-400 truncate">
                {c.jobTitle ? `${c.jobTitle as string}` : ''}{c.jobTitle && c.email ? ' · ' : ''}{c.email as string ?? ''}
              </p>
            </div>
            <Badge variant="secondary" className="capitalize text-[10px] flex-shrink-0">{c.status as string}</Badge>
          </div>
        );
      })}
    </div>
  );
}

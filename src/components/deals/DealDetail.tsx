'use client';

import React, { useState } from 'react';
import { X, Calendar, DollarSign, Pencil, Trash2, BellRing, AlertTriangle, CheckSquare, Users } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { SlideOverPanel } from '@/components/shared/SlideOverPanel';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DetailSkeleton } from '@/components/shared/LoadingSkeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ActivityFeed } from '@/components/activities/ActivityFeed';
import { DealForm } from './DealForm';
import { DealReminderDialog } from './DealReminderDialog';
import { formatDate, formatRelative, formatCurrency } from '@/lib/formatters';
import { isDeliveryPipeline } from '@/lib/pipeline-utils';
import { toast } from 'sonner';

interface DealDetailProps {
  dealId: string;
  open: boolean;
  onClose: () => void;
  onDeleted?: () => void;
}

const statusVariant: Record<string, 'default' | 'secondary' | 'success' | 'destructive' | 'outline'> = {
  open: 'default',
  won: 'success',
  lost: 'destructive',
  abandoned: 'outline',
};

export function DealDetail({ dealId, open, onClose, onDeleted }: DealDetailProps) {
  const utils = trpc.useUtils();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [progressDraft, setProgressDraft] = useState(0);
  const [delayDraft, setDelayDraft] = useState(false);
  const [delayReasonDraft, setDelayReasonDraft] = useState('');
  const [revisedEndDateDraft, setRevisedEndDateDraft] = useState('');
  const [selectedStageId, setSelectedStageId] = useState('');

  const { data: deal, isLoading } = trpc.deals.getById.useQuery(
    { id: dealId },
    { enabled: !!dealId && open }
  );
  const detailPipelineId = deal?.pipelineId as string | undefined;
  const detailStageId = deal?.stageId as string | undefined;

  const { data: pipelineData } = trpc.pipelines.getWithStages.useQuery(
    { id: detailPipelineId ?? '' },
    { enabled: Boolean(detailPipelineId) && open }
  );

  const deleteDeal = trpc.deals.delete.useMutation({
    onSuccess: () => {
      toast.success('Prospect deleted');
      void utils.deals.list.invalidate();
      void utils.deals.byStage.invalidate();
      setDeleteOpen(false);
      onClose();
      onDeleted?.();
    },
    onError: (err) => toast.error('Failed to delete', { description: err.message }),
  });

  const updateProgress = trpc.deals.updateProgress.useMutation({
    onSuccess: () => {
      toast.success('Project progress updated');
      void utils.deals.getById.invalidate({ id: dealId });
      void utils.deals.byStage.invalidate();
      void utils.activities.list.invalidate();
    },
    onError: (err) => toast.error('Failed to update project progress', { description: err.message }),
  });

  const moveStage = trpc.deals.moveToStage.useMutation({
    onSuccess: () => {
      toast.success('Stage updated');
      void utils.deals.getById.invalidate({ id: dealId });
      void utils.deals.byStage.invalidate();
      void utils.deals.list.invalidate();
      void utils.activities.list.invalidate();
    },
    onError: (err) => toast.error('Failed to update stage', { description: err.message }),
  });

  React.useEffect(() => {
    if (!deal) return;
    setProgressDraft(Number(deal.projectProgressPercent ?? 0));
    setDelayDraft(Boolean(deal.isDelayed));
    setDelayReasonDraft(String(deal.delayReason ?? ''));
    setRevisedEndDateDraft(String(deal.revisedEndDate ?? ''));
  }, [deal]);

  React.useEffect(() => {
    setSelectedStageId(detailStageId ?? '');
  }, [detailStageId, dealId]);

  if (!open) return null;

  const title = deal?.title as string | undefined;
  const status = deal?.status as string | undefined;
  const probability = deal?.probability as number | null | undefined;
  const amount = deal?.amount as number | null | undefined;
  const expectedCloseDate = deal?.expectedCloseDate as string | null | undefined;
  const primaryContactFirstName = deal?.primaryContactFirstName as string | null | undefined;
  const primaryContactLastName = deal?.primaryContactLastName as string | null | undefined;
  const primaryContactName = deal?.primaryContactName as string | null | undefined;
  const primaryContactEmail = deal?.primaryContactEmail as string | null | undefined;
  const primaryContactPhone = deal?.primaryContactPhone as string | null | undefined;
  const primaryContactTitle = deal?.primaryContactTitle as string | null | undefined;
  const companyName = deal?.companyName as string | null | undefined;
  const partnerCompanyName = deal?.partnerCompanyName as string | null | undefined;
  const stageName = deal?.stageName as string | null | undefined;
  const ownerFirstName = deal?.ownerFirstName as string | null | undefined;
  const ownerLastName = deal?.ownerLastName as string | null | undefined;
  const services = ((deal?.services as string[] | null | undefined) ?? []).filter(Boolean);
  const serviceOther = deal?.serviceOther as string | null | undefined;
  const currency = deal?.currency as string | undefined;
  const createdAt = deal?.createdAt as Date | undefined;
  const updatedAt = deal?.updatedAt as Date | undefined;
  const description = deal?.description as string | null | undefined;
  const lostReason = deal?.lostReason as string | null | undefined;
  const stageHistory = (deal?.stageHistory as Array<Record<string, unknown>>) ?? [];
  const pipelineId = deal?.pipelineId as string | undefined;
  const stageId = deal?.stageId as string | undefined;
  const primaryContactId = deal?.primaryContactId as string | null | undefined;
  const companyId = deal?.companyId as string | null | undefined;
  const ownerId = deal?.ownerId as string | null | undefined;
  const showProjectTab = isDeliveryPipeline(deal?.pipelineType as string | null | undefined);
  const projectStartDate = deal?.projectStartDate as string | null | undefined;
  const projectEndDate = deal?.projectEndDate as string | null | undefined;
  const projectActualEndDate = deal?.projectActualEndDate as string | null | undefined;
  const isDelayed = Boolean(deal?.isDelayed);
  const delayReason = deal?.delayReason as string | null | undefined;
  const revisedEndDate = deal?.revisedEndDate as string | null | undefined;
  const tasks = (deal?.tasks as Array<Record<string, unknown>> | undefined) ?? [];
  const teamMembers = (deal?.teamMembers as Array<Record<string, unknown>> | undefined) ?? [];
  const stageOptions = ([...((pipelineData?.stages as Array<{ id: string; name: string; position: number }> | undefined) ?? [])])
    .sort((a, b) => a.position - b.position);

  const editDefaults = deal ? {
    title: title ?? '',
    description: description ?? '',
    pipelineId: pipelineId ?? '',
    stageId: stageId ?? '',
    amount: amount ?? undefined,
    currency: currency ?? 'INR',
    probability: (probability as number) ?? 0,
    expectedCloseDate: expectedCloseDate ?? '',
    status: (status as 'open' | 'won' | 'lost' | 'abandoned') ?? 'open',
    services,
    serviceOther: serviceOther ?? '',
    primaryContactId: primaryContactId ?? '',
    companyId: companyId ?? '',
    partnerCompanyId: (deal?.partnerCompanyId as string | null | undefined) ?? '',
    referredByPartnerId: (deal?.referredByPartnerId as string | null | undefined) ?? '',
    projectStartDate: (deal?.projectStartDate as string | null | undefined) ?? '',
    projectEndDate: (deal?.projectEndDate as string | null | undefined) ?? '',
    projectActualEndDate: (deal?.projectActualEndDate as string | null | undefined) ?? '',
    projectProgressPercent: Number(deal?.projectProgressPercent ?? 0),
    isDelayed: Boolean(deal?.isDelayed),
    delayReason: (deal?.delayReason as string | null | undefined) ?? '',
    revisedEndDate: (deal?.revisedEndDate as string | null | undefined) ?? '',
    ownerId: ownerId ?? '',
  } : undefined;

  return (
    <>
      <SlideOverPanel open={open} onClose={onClose} width="lg">
        {isLoading ? (
          <DetailSkeleton />
        ) : !deal ? (
          <div className="p-6 text-center text-slate-500">Prospect not found</div>
        ) : (
          <div>
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-slate-200">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-semibold text-slate-900 pr-4">{title}</h2>
                  <div className="flex items-center gap-2 mt-1.5">
                    {status && (
                      <Badge variant={statusVariant[status] ?? 'secondary'}>
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </Badge>
                    )}
                    {probability !== null && probability !== undefined && probability > 0 && (
                      <Badge variant="outline">{probability}% probability</Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditOpen(true)}
                    className="text-slate-400 hover:text-blue-600"
                    title="Edit prospect"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleteOpen(true)}
                    className="text-slate-400 hover:text-red-600"
                    title="Delete prospect"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 ml-1">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-4">
                {amount !== null && amount !== undefined && (
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-slate-400" />
                    <div>
                      <p className="text-xs text-slate-400 uppercase tracking-wide">Value</p>
                      <p className="text-sm font-semibold text-slate-900">{formatCurrency(amount)}</p>
                    </div>
                  </div>
                )}
                {expectedCloseDate && (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <div>
                      <p className="text-xs text-slate-400 uppercase tracking-wide">Close Date</p>
                      <p className="text-sm font-semibold text-slate-900">{formatDate(new Date(expectedCloseDate))}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <Button size="sm" variant="outline" onClick={() => setReminderOpen(true)}>
                  <BellRing className="w-3.5 h-3.5 mr-1.5" />
                  Set Reminder
                </Button>

                {stageOptions.length > 0 && (
                  <div className="ml-auto flex items-center gap-2">
                    <select
                      value={selectedStageId}
                      onChange={(e) => setSelectedStageId(e.target.value)}
                      disabled={moveStage.isPending}
                      className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-blue-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                      aria-label="Prospect stage"
                    >
                      {stageOptions.map((stage) => (
                        <option key={stage.id} value={stage.id}>{stage.name}</option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!selectedStageId || selectedStageId === stageId || moveStage.isPending}
                      onClick={() => moveStage.mutate({ dealId, toStageId: selectedStageId })}
                    >
                      {moveStage.isPending ? 'Updating...' : 'Change Stage'}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="px-6 py-4">
              <Tabs defaultValue="overview">
                <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  {showProjectTab && <TabsTrigger value="project">Project</TabsTrigger>}
                  <TabsTrigger value="activity">Activity</TabsTrigger>
                  <TabsTrigger value="history">Stage History</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="mt-4">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                    {primaryContactFirstName && (
                      <InfoField label="Primary Contact" value={`${primaryContactFirstName} ${primaryContactLastName ?? ''}`} />
                    )}
                    {companyName && <InfoField label="Company" value={companyName} />}
                    {partnerCompanyName && <InfoField label="Partner" value={partnerCompanyName} />}
                    {(services.length > 0 || serviceOther) && (
                      <InfoField
                        label="Services"
                        value={[...services.filter((service) => service !== 'Other'), serviceOther].filter(Boolean).join(', ')}
                      />
                    )}
                    {stageName && <InfoField label="Stage" value={stageName} />}
                    {ownerFirstName && (
                      <InfoField label="Owner" value={`${ownerFirstName} ${ownerLastName ?? ''}`} />
                    )}
                    {createdAt && <InfoField label="Created" value={formatDate(createdAt)} />}
                    {updatedAt && <InfoField label="Last Updated" value={formatRelative(updatedAt)} />}
                    {currency && <InfoField label="Currency" value={currency} />}
                  </div>

                  {description && (
                    <div className="mt-4">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Notes</p>
                      <p className="text-sm text-slate-700">{description}</p>
                    </div>
                  )}

                  {lostReason && (
                    <div className="mt-4 p-3 bg-red-50 rounded-lg border border-red-100">
                      <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-1">Lost Reason</p>
                      <p className="text-sm text-red-700">{lostReason}</p>
                    </div>
                  )}

                  <PrimaryContactCard
                    contactId={primaryContactId}
                    name={primaryContactName ?? [primaryContactFirstName, primaryContactLastName].filter(Boolean).join(' ')}
                    title={primaryContactTitle}
                    email={primaryContactEmail}
                    phone={primaryContactPhone}
                  />
                </TabsContent>

                {showProjectTab && (
                  <TabsContent value="project" className="mt-4">
                    <div className="space-y-4">
                      <div className="rounded-xl border border-slate-200 bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Project Details</p>
                            <h3 className="mt-1 text-sm font-semibold text-slate-900">Delivery timeline and progress</h3>
                          </div>
                          {isDelayed && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-red-100 bg-red-50 px-2 py-1 text-xs font-semibold text-red-600">
                              <AlertTriangle className="h-3 w-3" />
                              Delayed
                            </span>
                          )}
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-3">
                          <InfoField label="Start Date" value={projectStartDate ? formatDate(new Date(projectStartDate)) : 'Not set'} />
                          <InfoField label="End Date" value={projectEndDate ? formatDate(new Date(projectEndDate)) : 'Not set'} />
                          {revisedEndDate && <InfoField label="Revised End" value={formatDate(new Date(revisedEndDate))} />}
                          {projectActualEndDate && <InfoField label="Actual End" value={formatDate(new Date(projectActualEndDate))} />}
                        </div>

                        <div className="mt-4">
                          <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                            <span>Progress</span>
                            <span className="font-semibold text-slate-800">{progressDraft}%</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={progressDraft}
                            onChange={(e) => setProgressDraft(Number(e.target.value))}
                            className="w-full accent-blue-600"
                          />
                          <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3">
                            <label className="flex items-center gap-2 text-sm text-slate-700">
                              <input
                                type="checkbox"
                                checked={delayDraft}
                                onChange={(e) => setDelayDraft(e.target.checked)}
                                className="h-4 w-4 rounded border-slate-300 text-blue-600"
                              />
                              Mark as delayed
                            </label>
                            {delayDraft && (
                              <div className="grid grid-cols-1 gap-2">
                                <input
                                  value={delayReasonDraft}
                                  onChange={(e) => setDelayReasonDraft(e.target.value)}
                                  placeholder="Delay reason"
                                  className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
                                />
                                <input
                                  type="date"
                                  value={revisedEndDateDraft}
                                  onChange={(e) => setRevisedEndDateDraft(e.target.value)}
                                  className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
                                />
                              </div>
                            )}
                          </div>
                          <Button
                            size="sm"
                            className="mt-3"
                            disabled={updateProgress.isPending}
                            onClick={() => updateProgress.mutate({
                              id: dealId,
                              progressPercent: progressDraft,
                              isDelayed: delayDraft,
                              delayReason: delayDraft ? delayReasonDraft : '',
                              revisedEndDate: delayDraft ? revisedEndDateDraft : '',
                            })}
                          >
                            {updateProgress.isPending ? 'Saving...' : 'Update Progress'}
                          </Button>
                        </div>

                        {delayReason && (
                          <div className="mt-4 rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                            <span className="font-semibold">Delay Reason:</span> {delayReason}
                          </div>
                        )}
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                          <div className="mb-3 flex items-center gap-2">
                            <Users className="h-4 w-4 text-slate-400" />
                            <h3 className="text-sm font-semibold text-slate-900">Assigned Team</h3>
                          </div>
                          {teamMembers.length === 0 ? (
                            <p className="text-sm text-slate-400">No team members assigned yet.</p>
                          ) : (
                            <div className="space-y-2">
                              {teamMembers.map((member) => (
                                <div key={String(member.id)} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                                  <span className="font-medium text-slate-700">
                                    {[member.firstName, member.lastName].filter(Boolean).join(' ') || String(member.email ?? '')}
                                  </span>
                                  <span className="text-xs capitalize text-slate-400">{String(member.role ?? 'member')}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                          <div className="mb-3 flex items-center gap-2">
                            <CheckSquare className="h-4 w-4 text-slate-400" />
                            <h3 className="text-sm font-semibold text-slate-900">Tasks</h3>
                          </div>
                          {tasks.length === 0 ? (
                            <p className="text-sm text-slate-400">No delivery tasks yet.</p>
                          ) : (
                            <div className="space-y-2">
                              {tasks.slice(0, 8).map((task) => (
                                <div key={String(task.id)} className="rounded-lg bg-slate-50 px-3 py-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="truncate text-sm font-medium text-slate-700">{String(task.title ?? '')}</p>
                                    <span className="text-xs capitalize text-slate-400">{String(task.status ?? 'pending').replace('_', ' ')}</span>
                                  </div>
                                  {Boolean(task.dueDate) && (
                                    <p className="mt-0.5 text-xs text-slate-400">Due {formatDate(new Date(String(task.dueDate)))}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                )}

                <TabsContent value="activity" className="mt-4">
                  <ActivityFeed dealId={dealId} />
                </TabsContent>

                <TabsContent value="history" className="mt-4">
                  {stageHistory.length === 0 ? (
                    <div className="text-sm text-slate-400 text-center py-8">No stage history yet.</div>
                  ) : (
                    <div className="space-y-3">
                      {stageHistory.map((entry, i) => {
                        const fromStageName = entry.fromStageName as string | null | undefined;
                        const toStageName = entry.toStageName as string | undefined;
                        const movedAt = entry.movedAt as string | Date | undefined;
                        return (
                          <div key={i} className="flex items-center gap-3 text-sm">
                            <div className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
                            <span className="text-slate-700">
                              {fromStageName ? (
                                <><span className="text-slate-400">{fromStageName}</span> → <strong>{toStageName}</strong></>
                              ) : (
                                <strong>{toStageName}</strong>
                              )}
                            </span>
                            <span className="text-xs text-slate-400 ml-auto">
                              {movedAt ? formatRelative(new Date(movedAt as string)) : ''}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </div>
        )}
      </SlideOverPanel>

      {/* Edit panel */}
      {pipelineId && (
        <SlideOverPanel open={editOpen} onClose={() => setEditOpen(false)} title="Edit Prospect" width="md">
          <div className="p-6">
            <DealForm
              mode="edit"
              dealId={dealId}
              pipelineId={pipelineId}
              stageId={stageId}
              defaultValues={editDefaults}
              onSuccess={() => {
                setEditOpen(false);
                void utils.deals.getById.invalidate({ id: dealId });
              }}
              onCancel={() => setEditOpen(false)}
            />
          </div>
        </SlideOverPanel>
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete prospect?"
        description={`"${title}" prospect will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        loading={deleteDeal.isPending}
        onConfirm={() => deleteDeal.mutate({ id: dealId })}
      />

      <DealReminderDialog
        open={reminderOpen}
        onOpenChange={setReminderOpen}
        dealId={dealId}
        dealTitle={title}
        companyId={companyId}
        primaryContactId={primaryContactId}
        onCreated={() => {
          void utils.activities.list.invalidate();
        }}
      />
    </>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm text-slate-800">{value}</p>
    </div>
  );
}

function PrimaryContactCard({
  contactId,
  name,
  title,
  email,
  phone,
}: {
  contactId?: string | null;
  name?: string | null;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
}) {
  if (!contactId && !name) return null;
  const initials = (name || 'PC')
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400">Primary Contact</p>
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-xs font-bold text-slate-500">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{name || 'Primary contact'}</p>
          {title && <p className="truncate text-xs text-slate-500">{title}</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-1">
        {email && (
          <a href={`mailto:${email}`} className="font-mono text-xs text-blue-600 hover:text-blue-700">
            {email}
          </a>
        )}
        {phone && <p className="font-mono text-xs text-slate-600">{phone}</p>}
      </div>
      {contactId && (
        <a href={`/contacts/${contactId}`} className="mt-2 block text-xs font-medium text-blue-600 hover:text-blue-700">
          View full contact →
        </a>
      )}
    </div>
  );
}

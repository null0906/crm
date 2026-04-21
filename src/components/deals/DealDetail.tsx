'use client';

import React, { useState } from 'react';
import { X, Calendar, DollarSign, Pencil, Trash2, BellRing } from 'lucide-react';
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

  const { data: deal, isLoading } = trpc.deals.getById.useQuery(
    { id: dealId },
    { enabled: !!dealId && open }
  );

  const deleteDeal = trpc.deals.delete.useMutation({
    onSuccess: () => {
      toast.success('Deal deleted');
      void utils.deals.list.invalidate();
      void utils.deals.byStage.invalidate();
      setDeleteOpen(false);
      onClose();
      onDeleted?.();
    },
    onError: (err) => toast.error('Failed to delete', { description: err.message }),
  });

  if (!open) return null;

  const title = deal?.title as string | undefined;
  const status = deal?.status as string | undefined;
  const probability = deal?.probability as number | null | undefined;
  const amount = deal?.amount as number | null | undefined;
  const expectedCloseDate = deal?.expectedCloseDate as string | null | undefined;
  const primaryContactFirstName = deal?.primaryContactFirstName as string | null | undefined;
  const primaryContactLastName = deal?.primaryContactLastName as string | null | undefined;
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
    ownerId: ownerId ?? '',
  } : undefined;

  return (
    <>
      <SlideOverPanel open={open} onClose={onClose} width="lg">
        {isLoading ? (
          <DetailSkeleton />
        ) : !deal ? (
          <div className="p-6 text-center text-slate-500">Deal not found</div>
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
                    title="Edit deal"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleteOpen(true)}
                    className="text-slate-400 hover:text-red-600"
                    title="Delete deal"
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

              <div className="mt-4">
                <Button size="sm" variant="outline" onClick={() => setReminderOpen(true)}>
                  <BellRing className="w-3.5 h-3.5 mr-1.5" />
                  Set Reminder
                </Button>
              </div>
            </div>

            {/* Tabs */}
            <div className="px-6 py-4">
              <Tabs defaultValue="overview">
                <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
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
                </TabsContent>

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
        <SlideOverPanel open={editOpen} onClose={() => setEditOpen(false)} title="Edit Deal" width="md">
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
        title="Delete deal?"
        description={`"${title}" will be permanently deleted. This cannot be undone.`}
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

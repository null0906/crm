'use client';

import React, { useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { Phone, Mail, MessageSquare, Users, FileText, CheckSquare, Activity, Clock3, Building2, User2, BriefcaseBusiness, ArrowRight, Trash2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatDateTime, formatRelative } from '@/lib/formatters';
import { getInitials } from '@/lib/formatters';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ActivityLogger } from './ActivityLogger';
import { SlideOverPanel } from '@/components/shared/SlideOverPanel';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const ACTIVITY_ICONS: Record<string, React.ElementType> = {
  call: Phone,
  email_sent: Mail,
  email_received: Mail,
  meeting: Users,
  note: FileText,
  task: CheckSquare,
  sms: MessageSquare,
  whatsapp: MessageSquare,
  linkedin: Activity,
  demo: Users,
  proposal: FileText,
  document: FileText,
  stage_change: Activity,
  status_change: Activity,
  assignment: Users,
  custom: Activity,
};

type ActivityItem = Record<string, unknown>;

interface ActivityFeedProps {
  contactId?: string;
  companyId?: string;
  dealId?: string;
}

export function ActivityFeed({ contactId, companyId, dealId }: ActivityFeedProps) {
  const utils = trpc.useUtils();
  const { data: session } = useSession();
  const [showLogger, setShowLogger] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<ActivityItem | null>(null);

  const { data, isLoading, refetch } = trpc.activities.list.useQuery({
    contactId,
    companyId,
    dealId,
    pagination: { limit: 50 },
  });

  const deleteActivity = trpc.activities.delete.useMutation({
    onSuccess: () => {
      toast.success('Activity deleted');
      void utils.activities.list.invalidate();
      void refetch();
      setSelectedActivity(null);
    },
    onError: (err) => {
      toast.error('Failed to delete activity', { description: err.message });
    },
  });

  const activities = (data?.items ?? []) as ActivityItem[];
  const currentUserId = (session?.user as Record<string, unknown> | undefined)?.id as string | undefined;

  return (
    <>
      <div className="space-y-4">
        <button
          onClick={() => setShowLogger(!showLogger)}
          className="w-full flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 py-2 border border-dashed border-blue-300 rounded-lg hover:border-blue-400 transition-colors"
        >
          <Activity className="w-4 h-4" />
          Log Activity
        </button>

        {showLogger && (
          <ActivityLogger
            contactId={contactId}
            companyId={companyId}
            dealId={dealId}
            onSuccess={() => { setShowLogger(false); void refetch(); }}
            onCancel={() => setShowLogger(false)}
          />
        )}

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3">
                <div className="skeleton w-8 h-8 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="skeleton h-4 w-40" />
                  <div className="skeleton h-3 w-64" />
                </div>
              </div>
            ))}
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-8 text-sm text-slate-400">
            No activities yet. Log a call, note, or email to get started.
          </div>
        ) : (
          <div className="relative">
            <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-200" />

            <div className="space-y-3">
              {activities.map((activity) => {
                const Icon = ACTIVITY_ICONS[String(activity.activityType)] ?? Activity;
                const performerFirst = activity.performerFirstName as string | undefined;
                const performerLast = activity.performerLastName as string | undefined;
                const summary = buildActivitySummary(activity);

                return (
                  <button
                    key={String(activity.id)}
                    type="button"
                    onClick={() => setSelectedActivity(activity)}
                    className="w-full text-left flex gap-4 relative rounded-xl px-1 py-1 hover:bg-slate-50 transition-colors"
                  >
                    <div className="relative z-10 flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-white border-2 border-slate-200">
                      <Icon className="w-3.5 h-3.5 text-slate-500" />
                    </div>

                    <div className="flex-1 pb-3 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <span className="text-sm font-medium text-slate-900">
                            {getActivityTitle(activity)}
                          </span>
                          {Boolean(activity.isAutomated) && (
                            <span className="ml-2 text-xs text-slate-400">(automated)</span>
                          )}
                        </div>
                        <span className="text-xs text-slate-400 ml-4 flex-shrink-0">
                          {formatRelative(activity.occurredAt as Date | string)}
                        </span>
                      </div>

                      <p className="text-sm text-slate-600 mt-1">
                        {summary}
                      </p>

                      {performerFirst && (
                        <div className="flex items-center gap-1.5 mt-2">
                          <Avatar className="w-4 h-4">
                            <AvatarFallback className="text-xs bg-slate-200">
                              {getInitials(performerFirst, performerLast)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-xs text-slate-500">
                            {performerFirst} {performerLast}
                          </span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <ActivityDetailPanel
        activity={selectedActivity}
        open={!!selectedActivity}
        onClose={() => setSelectedActivity(null)}
        currentUserId={currentUserId}
        onDelete={(activityId) => deleteActivity.mutate({ id: activityId })}
        deletePending={deleteActivity.isPending}
      />
    </>
  );
}

function ActivityDetailPanel({
  activity,
  open,
  onClose,
  currentUserId,
  onDelete,
  deletePending,
}: {
  activity: ActivityItem | null;
  open: boolean;
  onClose: () => void;
  currentUserId?: string;
  onDelete: (activityId: string) => void;
  deletePending: boolean;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const metadata = useMemo(
    () => ((activity?.metadata as Record<string, unknown> | null) ?? {}),
    [activity]
  );

  const canDelete =
    Boolean(activity) &&
    !Boolean(activity?.isAutomated) &&
    typeof activity?.id === 'string' &&
    typeof activity?.performedById === 'string' &&
    activity.performedById === currentUserId;

  const detailRows = useMemo(() => {
    if (!activity) return [];

    const rows: Array<{ label: string; value: string }> = [];
    const direction = activity.callDirection ? formatEnumLabel(String(activity.callDirection)) : null;
    const outcome = activity.callOutcome ? formatEnumLabel(String(activity.callOutcome)) : null;
    const duration = typeof activity.callDurationSeconds === 'number' && activity.callDurationSeconds > 0
      ? formatDuration(activity.callDurationSeconds)
      : null;
    const fromStageName = typeof metadata.fromStageName === 'string' ? metadata.fromStageName : null;
    const toStageName = typeof metadata.toStageName === 'string' ? metadata.toStageName : null;
    const contactFullName = activity.contactFullName ? String(activity.contactFullName) : null;
    const companyName = activity.companyName ? String(activity.companyName) : null;
    const dealTitle = activity.dealTitle ? String(activity.dealTitle) : null;

    rows.push({ label: 'Type', value: formatEnumLabel(String(activity.activityType ?? 'activity')) });
    rows.push({ label: 'Occurred', value: formatDateTime(activity.occurredAt as Date | string) });

    if (dealTitle) rows.push({ label: 'Deal', value: dealTitle });
    if (contactFullName) rows.push({ label: 'Contact', value: contactFullName });
    if (companyName) rows.push({ label: 'Company', value: companyName });
    if (direction) rows.push({ label: 'Direction', value: direction });
    if (outcome) rows.push({ label: 'Outcome', value: outcome });
    if (duration) rows.push({ label: 'Duration', value: duration });
    if (fromStageName || toStageName) {
      rows.push({
        label: 'Stage Change',
        value: fromStageName ? `${fromStageName} -> ${toStageName ?? 'Unknown'}` : (toStageName ?? 'Unknown'),
      });
    }
    if (typeof metadata.source === 'string') rows.push({ label: 'Source', value: formatEnumLabel(metadata.source) });

    return rows;
  }, [activity, metadata]);

  if (!activity) return null;

  return (
    <>
      <SlideOverPanel open={open} onClose={onClose} title="Activity Details" width="md">
        <div className="p-6 space-y-6">
        <div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-slate-900">{getActivityTitle(activity)}</h3>
                {Boolean(activity.isAutomated) && <Badge variant="outline">Automated</Badge>}
              </div>
              <p className="text-sm text-slate-500 mt-1">{buildActivitySummary(activity)}</p>
            </div>
            {canDelete && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="text-red-600 border-red-200 hover:text-red-700 hover:border-red-300"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Delete
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {detailRows.map((row) => (
            <div key={row.label} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{row.label}</p>
              <p className="text-sm text-slate-800 mt-1">{row.value}</p>
            </div>
          ))}
        </div>

        {Boolean(activity.body) && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Notes</p>
            <div className="mt-2 rounded-lg border border-slate-200 bg-white px-4 py-3">
              <p className="text-sm whitespace-pre-wrap text-slate-700">{String(activity.body)}</p>
            </div>
          </div>
        )}

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Metadata</p>
          <div className="mt-2 space-y-2">
            {Boolean(activity.dealTitle) && (
              <MetaLine icon={BriefcaseBusiness} label="Deal" value={String(activity.dealTitle)} />
            )}
            {Boolean(activity.contactFullName) && (
              <MetaLine icon={User2} label="Contact" value={String(activity.contactFullName)} />
            )}
            {Boolean(activity.companyName) && (
              <MetaLine icon={Building2} label="Company" value={String(activity.companyName)} />
            )}
            <MetaLine icon={Clock3} label="Logged" value={formatDateTime(activity.createdAt as Date | string)} />
            {Boolean(activity.performerFirstName || activity.performerLastName) && (
              <MetaLine
                icon={User2}
                label="Performed By"
                value={[activity.performerFirstName, activity.performerLastName].filter(Boolean).join(' ')}
              />
            )}
          </div>
        </div>

        {String(activity.activityType) === 'stage_change' && (
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Stage Timeline</p>
            <div className="mt-2 flex items-center gap-2 text-sm text-blue-900">
              <span>{String(metadata.fromStageName ?? 'Created')}</span>
              <ArrowRight className="w-4 h-4" />
              <span>{String(metadata.toStageName ?? 'Unknown')}</span>
            </div>
          </div>
        )}
        </div>
      </SlideOverPanel>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete activity?"
        description="This will remove the activity from the timeline. This action cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={deletePending}
        onConfirm={() => {
          if (typeof activity.id === 'string') {
            onDelete(activity.id);
          }
        }}
      />
    </>
  );
}

function MetaLine({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-600">
      <Icon className="w-4 h-4 text-slate-400" />
      <span className="text-slate-400">{label}:</span>
      <span className="text-slate-700">{value}</span>
    </div>
  );
}

function getActivityTitle(activity: ActivityItem): string {
  const subject = activity.subject ? String(activity.subject) : '';
  if (subject.trim()) return subject;

  if (String(activity.activityType) === 'stage_change') {
    const metadata = ((activity.metadata as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
    const toStageName = typeof metadata.toStageName === 'string' ? metadata.toStageName : null;
    return toStageName ? `Moved to ${toStageName}` : 'Stage changed';
  }

  return formatEnumLabel(String(activity.activityType ?? 'activity'));
}

function buildActivitySummary(activity: ActivityItem): string {
  const metadata = ((activity.metadata as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
  const pieces: string[] = [];
  const contactName = activity.contactFullName ? String(activity.contactFullName) : null;
  const companyName = activity.companyName ? String(activity.companyName) : null;
  const dealTitle = activity.dealTitle ? String(activity.dealTitle) : null;

  if (String(activity.activityType) === 'stage_change') {
    const fromStageName = typeof metadata.fromStageName === 'string' ? metadata.fromStageName : null;
    const toStageName = typeof metadata.toStageName === 'string' ? metadata.toStageName : null;
    if (dealTitle) pieces.push(`Deal: ${dealTitle}`);
    if (fromStageName || toStageName) {
      pieces.push(fromStageName ? `${fromStageName} -> ${toStageName ?? 'Unknown'}` : `Entered ${toStageName ?? 'Unknown'}`);
    }
    return pieces.join(' • ');
  }

  if (dealTitle) pieces.push(`Deal: ${dealTitle}`);
  if (contactName) pieces.push(`Contact: ${contactName}`);
  if (companyName) pieces.push(`Company: ${companyName}`);

  if (typeof activity.callDurationSeconds === 'number' && activity.callDurationSeconds > 0) {
    pieces.push(`Duration: ${formatDuration(activity.callDurationSeconds)}`);
  }

  if (activity.callOutcome) pieces.push(`Outcome: ${formatEnumLabel(String(activity.callOutcome))}`);
  if (activity.callDirection) pieces.push(`Direction: ${formatEnumLabel(String(activity.callDirection))}`);

  if (pieces.length > 0) return pieces.join(' • ');
  if (activity.body) return String(activity.body).trim();
  return 'Open activity to view full details.';
}

function formatEnumLabel(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (!minutes) return `${seconds}s`;
  if (!seconds) return `${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

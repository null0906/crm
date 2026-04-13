'use client';

import React, { useMemo, useState } from 'react';
import {
  Phone, Mail, MessageSquare, Users, FileText, CheckSquare, Activity,
  Plus, Clock3, Building2, User2, BriefcaseBusiness, ArrowRight, Filter,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { SlideOverPanel } from '@/components/shared/SlideOverPanel';
import { LogActivityPanel } from '@/components/activities/LogActivityPanel';
import { formatRelative, formatDateTime, getInitials } from '@/lib/formatters';
import { ACTIVITY_TYPES } from '@/lib/constants';

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

const DATE_PRESETS = [
  { label: 'All time', value: '' },
  { label: 'Today', value: 'today' },
  { label: 'This week', value: 'week' },
  { label: 'This month', value: 'month' },
  { label: 'Last 3 months', value: '3month' },
];

type ActivityItem = Record<string, unknown>;

function getDateRange(preset: string): { dateFrom?: string; dateTo?: string } {
  const now = new Date();
  if (preset === 'today') {
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    return { dateFrom: from.toISOString().split('T')[0] };
  }
  if (preset === 'week') {
    const from = new Date(now);
    from.setDate(now.getDate() - now.getDay());
    from.setHours(0, 0, 0, 0);
    return { dateFrom: from.toISOString().split('T')[0] };
  }
  if (preset === 'month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { dateFrom: from.toISOString().split('T')[0] };
  }
  if (preset === '3month') {
    const from = new Date(now);
    from.setMonth(now.getMonth() - 3);
    return { dateFrom: from.toISOString().split('T')[0] };
  }
  return {};
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
      pieces.push(fromStageName ? `${fromStageName} → ${toStageName ?? 'Unknown'}` : `Entered ${toStageName ?? 'Unknown'}`);
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
  if (pieces.length > 0) return pieces.join(' • ');
  if (activity.body) return String(activity.body).trim();
  return '';
}

function formatEnumLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (!minutes) return `${seconds}s`;
  if (!seconds) return `${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

function ActivityDetailPanel({
  activity,
  open,
  onClose,
}: {
  activity: ActivityItem | null;
  open: boolean;
  onClose: () => void;
}) {
  const metadata = useMemo(
    () => ((activity?.metadata as Record<string, unknown> | null) ?? {}),
    [activity]
  );

  const detailRows = useMemo(() => {
    if (!activity) return [];
    const rows: Array<{ label: string; value: string }> = [];
    const direction = activity.callDirection ? formatEnumLabel(String(activity.callDirection)) : null;
    const outcome = activity.callOutcome ? formatEnumLabel(String(activity.callOutcome)) : null;
    const duration = typeof activity.callDurationSeconds === 'number' && activity.callDurationSeconds > 0
      ? formatDuration(activity.callDurationSeconds) : null;
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
        value: fromStageName ? `${fromStageName} → ${toStageName ?? 'Unknown'}` : (toStageName ?? 'Unknown'),
      });
    }
    return rows;
  }, [activity, metadata]);

  if (!activity) return null;

  return (
    <SlideOverPanel open={open} onClose={onClose} title="Activity Details" width="md">
      <div className="p-6 space-y-6">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-slate-900">{getActivityTitle(activity)}</h3>
            {Boolean(activity.isAutomated) && <Badge variant="outline">Automated</Badge>}
          </div>
          <p className="text-sm text-slate-500 mt-1">{buildActivitySummary(activity)}</p>
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
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Details</p>
          <div className="mt-2 space-y-2">
            {Boolean(activity.dealTitle) && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <BriefcaseBusiness className="w-4 h-4 text-slate-400" />
                <span className="text-slate-400">Deal:</span>
                <span className="text-slate-700">{String(activity.dealTitle)}</span>
              </div>
            )}
            {Boolean(activity.contactFullName) && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <User2 className="w-4 h-4 text-slate-400" />
                <span className="text-slate-400">Contact:</span>
                <span className="text-slate-700">{String(activity.contactFullName)}</span>
              </div>
            )}
            {Boolean(activity.companyName) && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Building2 className="w-4 h-4 text-slate-400" />
                <span className="text-slate-400">Company:</span>
                <span className="text-slate-700">{String(activity.companyName)}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Clock3 className="w-4 h-4 text-slate-400" />
              <span className="text-slate-400">Logged:</span>
              <span className="text-slate-700">{formatDateTime(activity.createdAt as Date | string)}</span>
            </div>
            {Boolean(activity.performerFirstName || activity.performerLastName) && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <User2 className="w-4 h-4 text-slate-400" />
                <span className="text-slate-400">Performed by:</span>
                <span className="text-slate-700">
                  {[activity.performerFirstName, activity.performerLastName].filter(Boolean).join(' ')}
                </span>
              </div>
            )}
          </div>
        </div>

        {String(activity.activityType) === 'stage_change' && (
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Stage Timeline</p>
            <div className="mt-2 flex items-center gap-2 text-sm text-blue-900">
              <span>{String((metadata as Record<string, unknown>).fromStageName ?? 'Created')}</span>
              <ArrowRight className="w-4 h-4" />
              <span>{String((metadata as Record<string, unknown>).toStageName ?? 'Unknown')}</span>
            </div>
          </div>
        )}
      </div>
    </SlideOverPanel>
  );
}

export default function ActivitiesPage() {
  const [typeFilter, setTypeFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [datePreset, setDatePreset] = useState('');
  const [logOpen, setLogOpen] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<ActivityItem | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const { data: users = [] } = trpc.users.list.useQuery();
  const dateRange = getDateRange(datePreset);

  const { data, isLoading } = trpc.activities.list.useQuery({
    activityType: typeFilter || undefined,
    performedById: ownerFilter || undefined,
    dateFrom: dateRange.dateFrom,
    dateTo: dateRange.dateTo,
    pagination: { limit: 200 },
  });

  const activities = (data?.items ?? []) as ActivityItem[];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white flex-shrink-0">
        <div>
          <h1 className="text-[15px] font-semibold text-slate-900 tracking-tight">Activity Feed</h1>
          <p className="text-xs text-slate-400 mt-0.5">All recent activities across your CRM</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="w-4 h-4" />
            Filters
          </Button>
          <Button size="sm" onClick={() => setLogOpen(true)}>
            <Plus className="w-4 h-4" />
            Log Activity
          </Button>
        </div>
      </div>

      {/* Type filter tabs */}
      <div className="flex items-center gap-1.5 px-6 py-2.5 bg-white border-b border-slate-100 overflow-x-auto flex-shrink-0">
        <button
          className={`text-[11px] font-medium px-2.5 py-1 rounded-md whitespace-nowrap transition-colors ${!typeFilter ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'}`}
          onClick={() => setTypeFilter('')}
        >
          All
        </button>
        {ACTIVITY_TYPES.slice(0, 9).map((t) => (
          <button
            key={t.value}
            className={`text-[11px] font-medium px-2.5 py-1 rounded-md whitespace-nowrap transition-colors ${typeFilter === t.value ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'}`}
            onClick={() => setTypeFilter(typeFilter === t.value ? '' : t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Advanced filters */}
      {showFilters && (
        <div className="flex items-center gap-3 px-6 py-3 bg-slate-50 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-slate-500 font-medium whitespace-nowrap">Owner</label>
            <select
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              className="text-xs border border-slate-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All owners</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-slate-500 font-medium whitespace-nowrap">Timeframe</label>
            <div className="flex items-center gap-1">
              {DATE_PRESETS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setDatePreset(p.value)}
                  className={`text-[11px] font-medium px-2 py-1 rounded-md whitespace-nowrap transition-colors ${datePreset === p.value ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-100'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          {(ownerFilter || datePreset) && (
            <button
              onClick={() => { setOwnerFilter(''); setDatePreset(''); }}
              className="text-xs text-slate-400 hover:text-slate-600 ml-auto"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Feed */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex gap-4">
                <div className="skeleton w-10 h-10 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-48" />
                  <div className="skeleton h-3 w-72" />
                </div>
              </div>
            ))}
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Activity className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p>No activities found.</p>
            <p className="text-sm mt-1">
              {typeFilter || ownerFilter || datePreset
                ? 'Try adjusting your filters.'
                : 'Log calls, meetings, and emails to see them here.'}
            </p>
          </div>
        ) : (
          <div className="max-w-2xl">
            <div className="relative">
              <div className="absolute left-[19px] top-0 bottom-0 w-px bg-slate-100" />
              <div className="space-y-1">
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
                      className="w-full text-left flex gap-3.5 relative group rounded-xl hover:bg-slate-50 transition-colors px-1 py-1"
                    >
                      <div className="relative z-10 flex-shrink-0 flex items-center justify-center w-[38px] h-[38px] rounded-full bg-white border border-slate-200 shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
                        <Icon className="w-3.5 h-3.5 text-slate-400" strokeWidth={1.75} />
                      </div>
                      <div className="flex-1 py-2 min-w-0">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <span className="text-[13px] font-medium text-slate-800">
                              {getActivityTitle(activity)}
                            </span>
                            {Boolean(activity.isAutomated) && (
                              <span className="ml-2 text-[11px] text-slate-400">(automated)</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge variant="secondary" className="capitalize text-[10px]">
                              {String(activity.activityType).replace(/_/g, ' ')}
                            </Badge>
                            <span className="text-[11px] text-slate-400 tabular-nums">
                              {formatRelative(activity.occurredAt as unknown as Date)}
                            </span>
                          </div>
                        </div>

                        {summary && (
                          <p className="text-[12px] text-slate-500 mt-0.5 line-clamp-1">{summary}</p>
                        )}

                        {performerFirst && (
                          <div className="flex items-center gap-1.5 mt-1">
                            <Avatar className="w-4 h-4">
                              <AvatarFallback className="text-[9px] bg-slate-100 text-slate-500">
                                {getInitials(performerFirst, performerLast)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-[11px] text-slate-400">
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
          </div>
        )}
      </div>

      <SlideOverPanel open={logOpen} onClose={() => setLogOpen(false)} title="Log Activity" width="md">
        <LogActivityPanel
          onSuccess={() => setLogOpen(false)}
          onCancel={() => setLogOpen(false)}
        />
      </SlideOverPanel>

      <ActivityDetailPanel
        activity={selectedActivity}
        open={!!selectedActivity}
        onClose={() => setSelectedActivity(null)}
      />
    </div>
  );
}

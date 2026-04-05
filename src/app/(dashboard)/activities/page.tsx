'use client';

import React, { useState } from 'react';
import { Phone, Mail, MessageSquare, Users, FileText, CheckSquare, Activity, Plus } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { SlideOverPanel } from '@/components/shared/SlideOverPanel';
import { LogActivityPanel } from '@/components/activities/LogActivityPanel';
import { formatRelative, getInitials } from '@/lib/formatters';
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
  stage_change: Activity,
  status_change: Activity,
  assignment: Users,
  custom: Activity,
};

export default function ActivitiesPage() {
  const [typeFilter, setTypeFilter] = useState('');
  const [logOpen, setLogOpen] = useState(false);

  const { data, isLoading } = trpc.activities.list.useQuery({
    activityType: typeFilter || undefined,
    pagination: { limit: 100 },
  });

  const activities = data?.items ?? [];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white">
        <div>
          <h1 className="text-[15px] font-semibold text-slate-900 tracking-tight">Activity Feed</h1>
          <p className="text-xs text-slate-400 mt-0.5">All recent activities across your CRM</p>
        </div>
        <Button size="sm" onClick={() => setLogOpen(true)}>
          <Plus className="w-4 h-4" />
          Log Activity
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1.5 px-6 py-2.5 bg-white border-b border-slate-100 overflow-x-auto">
        <button
          className={`text-[11px] font-medium px-2.5 py-1 rounded-md whitespace-nowrap transition-colors ${!typeFilter ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'}`}
          onClick={() => setTypeFilter('')}
        >
          All
        </button>
        {ACTIVITY_TYPES.slice(0, 8).map((t) => (
          <button
            key={t.value}
            className={`text-[11px] font-medium px-2.5 py-1 rounded-md whitespace-nowrap transition-colors ${typeFilter === t.value ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'}`}
            onClick={() => setTypeFilter(typeFilter === t.value ? '' : t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

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
            <p>No activities yet.</p>
            <p className="text-sm mt-1">Log calls, meetings, and emails to see them here.</p>
          </div>
        ) : (
          <div className="max-w-2xl">
            <div className="relative">
              <div className="absolute left-[19px] top-0 bottom-0 w-px bg-slate-100" />
              <div className="space-y-1">
                {activities.map((activity) => {
                  const Icon = ACTIVITY_ICONS[activity.activityType] ?? Activity;
                  const performerFirst = activity.performerFirstName as string | undefined;
                  const performerLast = activity.performerLastName as string | undefined;

                  return (
                    <div key={activity.id} className="flex gap-3.5 relative group">
                      <div className="relative z-10 flex-shrink-0 flex items-center justify-center w-[38px] h-[38px] rounded-full bg-white border border-slate-200 shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
                        <Icon className="w-3.5 h-3.5 text-slate-400" strokeWidth={1.75} />
                      </div>
                      <div className="flex-1 py-2 min-w-0">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <span className="text-[13px] font-medium text-slate-800">
                              {activity.subject || (activity.activityType as string).replace(/_/g, ' ')}
                            </span>
                            {activity.isAutomated && (
                              <span className="ml-2 text-[11px] text-slate-400">(automated)</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge variant="secondary" className="capitalize">
                              {(activity.activityType as string).replace(/_/g, ' ')}
                            </Badge>
                            <span className="text-[11px] text-slate-400 tabular-nums">
                              {formatRelative(activity.occurredAt as unknown as Date)}
                            </span>
                          </div>
                        </div>

                        {activity.body && (
                          <p className="text-[13px] text-slate-500 mt-0.5 line-clamp-2">{activity.body as string}</p>
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
                    </div>
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
    </div>
  );
}

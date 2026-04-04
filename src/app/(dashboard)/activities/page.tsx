'use client';

import React, { useState } from 'react';
import { Phone, Mail, MessageSquare, Users, FileText, CheckSquare, Activity } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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

  const { data, isLoading } = trpc.activities.list.useQuery({
    activityType: typeFilter || undefined,
    pagination: { limit: 100 },
  });

  const activities = data?.items ?? [];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 bg-white">
        <h1 className="text-xl font-semibold text-slate-900">Activity Feed</h1>
        <p className="text-sm text-slate-500">All recent activities across your CRM</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 px-6 py-3 bg-white border-b border-slate-200 overflow-x-auto">
        <button
          className={`text-xs px-2.5 py-1 rounded-full whitespace-nowrap transition-colors ${!typeFilter ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          onClick={() => setTypeFilter('')}
        >
          All
        </button>
        {ACTIVITY_TYPES.slice(0, 8).map((t) => (
          <button
            key={t.value}
            className={`text-xs px-2.5 py-1 rounded-full whitespace-nowrap transition-colors ${typeFilter === t.value ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
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
              <div className="absolute left-5 top-0 bottom-0 w-px bg-slate-200" />
              <div className="space-y-4">
                {activities.map((activity) => {
                  const Icon = ACTIVITY_ICONS[activity.activityType] ?? Activity;
                  const performerFirst = activity.performerFirstName as string | undefined;
                  const performerLast = activity.performerLastName as string | undefined;

                  return (
                    <div key={activity.id} className="flex gap-4 relative">
                      <div className="relative z-10 flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-white border-2 border-slate-200">
                        <Icon className="w-4 h-4 text-slate-500" />
                      </div>
                      <div className="flex-1 pb-3 min-w-0">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <span className="text-sm font-medium text-slate-900">
                              {activity.subject || (activity.activityType as string).replace(/_/g, ' ')}
                            </span>
                            {activity.isAutomated && (
                              <span className="ml-2 text-xs text-slate-400">(automated)</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge variant="secondary" className="text-xs capitalize">
                              {(activity.activityType as string).replace(/_/g, ' ')}
                            </Badge>
                            <span className="text-xs text-slate-400">
                              {formatRelative(activity.occurredAt as unknown as Date)}
                            </span>
                          </div>
                        </div>

                        {activity.body && (
                          <p className="text-sm text-slate-600 mt-1 line-clamp-2">{activity.body as string}</p>
                        )}

                        {performerFirst && (
                          <div className="flex items-center gap-1.5 mt-1.5">
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
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

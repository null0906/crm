'use client';

import React, { useState } from 'react';
import { Phone, Mail, MessageSquare, Users, FileText, CheckSquare, Activity } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatRelative } from '@/lib/formatters';
import { getInitials } from '@/lib/formatters';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ActivityLogger } from './ActivityLogger';

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

interface ActivityFeedProps {
  contactId?: string;
  companyId?: string;
  dealId?: string;
}

export function ActivityFeed({ contactId, companyId, dealId }: ActivityFeedProps) {
  const [showLogger, setShowLogger] = useState(false);

  const { data, isLoading, refetch } = trpc.activities.list.useQuery({
    contactId,
    companyId,
    dealId,
    pagination: { limit: 50 },
  });

  const activities = data?.items ?? [];

  return (
    <div className="space-y-4">
      {/* Quick log */}
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

      {/* Feed */}
      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => (
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
          {/* Timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-200" />

          <div className="space-y-3">
            {activities.map((activity) => {
              const Icon = ACTIVITY_ICONS[activity.activityType] ?? Activity;
              const performerFirst = activity.performerFirstName as string | undefined;
              const performerLast = activity.performerLastName as string | undefined;

              return (
                <div key={activity.id} className="flex gap-4 relative">
                  {/* Icon */}
                  <div className="relative z-10 flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-white border-2 border-slate-200">
                    <Icon className="w-3.5 h-3.5 text-slate-500" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-sm font-medium text-slate-900">
                          {activity.subject || activity.activityType.replace(/_/g, ' ')}
                        </span>
                        {activity.isAutomated && (
                          <span className="ml-2 text-xs text-slate-400">(automated)</span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400 ml-4 flex-shrink-0">
                        {formatRelative(activity.occurredAt as unknown as Date)}
                      </span>
                    </div>

                    {activity.body && (
                      <p className="text-sm text-slate-600 mt-1 line-clamp-2">
                        {activity.body as string}
                      </p>
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
      )}
    </div>
  );
}

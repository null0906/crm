'use client';

import React, { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { LogDemoPanel } from './LogDemoPanel';
import { formatDate } from '@/lib/formatters';

interface EntityDemosPanelProps {
  contactId?: string;
  contactCompanyId?: string | null;
  dealId?: string;
  dealCompanyId?: string | null;
  companyId?: string;
}

const OUTCOME_CLASS: Record<string, string> = {
  interested:      'border-indigo-200 bg-indigo-50 text-indigo-700',
  completed:       'border-emerald-200 bg-emerald-50 text-emerald-700',
  needs_follow_up: 'border-orange-200 bg-orange-50 text-orange-700',
  no_show:         'border-red-200 bg-red-50 text-red-700',
  not_interested:  'border-red-200 bg-red-50 text-red-700',
  rescheduled:     'border-amber-200 bg-amber-50 text-amber-700',
  cancelled:       'border-slate-200 bg-slate-50 text-slate-600',
};

export function EntityDemosPanel({
  contactId,
  contactCompanyId,
  dealId,
  dealCompanyId,
  companyId,
}: EntityDemosPanelProps) {
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);

  const { data: demos = [], isLoading } = trpc.demoRecords.list.useQuery({
    contactId,
    contactCompanyId: contactCompanyId ?? undefined,
    dealId,
    dealCompanyId: dealCompanyId ?? undefined,
    companyId,
  });

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
          contactId={contactId}
          companyId={contactCompanyId ?? dealCompanyId ?? companyId}
          dealId={dealId}
          onSuccess={() => {
            setShowForm(false);
            void utils.demoRecords.list.invalidate();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-lg bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : demos.length === 0 && !showForm ? (
        <div className="py-8 text-center text-slate-400">
          <CalendarDays className="mx-auto mb-2 h-8 w-8" />
          <p className="text-sm">No demo or discovery records yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(demos as Array<Record<string, unknown>>).map((d) => {
            const callType = String(d.callType ?? 'demo').replace(/_/g, ' ');
            const outcome  = String(d.outcome ?? '');
            const contactName = [d.contactFirstName, d.contactLastName].filter(Boolean).join(' ').trim();
            return (
              <div key={String(d.id)} className="rounded-lg border border-slate-100 bg-white px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md border border-blue-100 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold capitalize text-blue-700">
                        {callType}
                      </span>
                      {outcome && (
                        <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold capitalize ${OUTCOME_CLASS[outcome] ?? 'border-slate-200 bg-white text-slate-600'}`}>
                          {outcome.replace(/_/g, ' ')}
                        </span>
                      )}
                      {Boolean(d.companyName) && !companyId && (
                        <span className="text-[11px] text-slate-400">· {String(d.companyName)}</span>
                      )}
                    </div>
                    {contactName && (
                      <p className="mt-0.5 truncate text-sm font-medium text-slate-700">{contactName}</p>
                    )}
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

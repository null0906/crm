'use client';

import React, { useState } from 'react';
import { ArrowLeft, RefreshCw, Play, CalendarDays, CheckCircle2, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { formatDate, formatRelative } from '@/lib/formatters';

export default function DataMigrationPage() {
  const utils = trpc.useUtils();
  const [previewed, setPreviewed] = useState(false);
  const [done, setDone] = useState(false);
  const [migratedCount, setMigratedCount] = useState(0);

  const {
    data: preview = [],
    isLoading: loadingPreview,
    refetch: refetchPreview,
  } = trpc.demoRecords.previewBackfill.useQuery(undefined, {
    enabled: previewed,
  });

  const runBackfill = trpc.demoRecords.runBackfill.useMutation({
    onSuccess: (result) => {
      setMigratedCount(result.migrated);
      setDone(true);
      void utils.demoRecords.list.invalidate();
      void utils.demoRecords.previewBackfill.invalidate();
      toast.success(`${result.migrated} demo record${result.migrated === 1 ? '' : 's'} migrated successfully`);
    },
    onError: (err) => toast.error('Migration failed', { description: err.message }),
  });

  const rows = preview as Array<Record<string, unknown>>;

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">

      {/* Header */}
      <div className="mb-6">
        <Link
          href="/settings"
          className="mb-4 flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Settings
        </Link>
        <h1 className="text-[15px] font-semibold text-slate-900">Data Migration</h1>
        <p className="mt-0.5 text-xs text-slate-400">One-time tools to migrate legacy data into new features.</p>
      </div>

      {/* Migration card */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="flex items-start gap-4 border-b border-slate-100 p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100">
            <CalendarDays className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Backfill Demo & Discovery Records</h2>
            <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">
              Before the structured Demo Records feature was added, demo and discovery calls were logged as plain activities.
              This migration finds those older activity entries and converts them into proper Demo Records so they appear
              in the Demo Records tabs on companies, contacts, and deals.
            </p>
          </div>
        </div>

        <div className="p-5 space-y-4">

          {/* Step 1 — Preview */}
          {!done && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-700">
                  Step 1 — Preview what will be migrated
                </p>
                {previewed && !loadingPreview && (
                  <button
                    type="button"
                    onClick={() => void refetchPreview()}
                    className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Refresh
                  </button>
                )}
              </div>

              {!previewed ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPreviewed(true)}
                >
                  Show activities to migrate
                </Button>
              ) : loadingPreview ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />
                  ))}
                </div>
              ) : rows.length === 0 ? (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <p className="text-sm text-emerald-700">
                    All demo activities are already migrated — nothing left to do.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                    <p className="text-sm text-amber-700">
                      <strong>{rows.length}</strong> activit{rows.length === 1 ? 'y' : 'ies'} will be converted into Demo Records.
                      Review the list below before confirming.
                    </p>
                  </div>

                  {/* Preview table */}
                  <div className="overflow-hidden rounded-lg border border-slate-200">
                    <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-px bg-slate-200 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      <div className="bg-slate-50 px-3 py-2">Subject</div>
                      <div className="bg-slate-50 px-3 py-2">Linked to</div>
                      <div className="bg-slate-50 px-3 py-2">Performed by</div>
                      <div className="bg-slate-50 px-3 py-2">Date</div>
                    </div>
                    <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                      {rows.map((row) => {
                        const contactName = [row.contactFirstName, row.contactLastName]
                          .filter(Boolean).join(' ').trim();
                        const linkedTo = contactName || String(row.companyName ?? '') || String(row.dealTitle ?? '') || '—';
                        const performer = [row.performerFirstName, row.performerLastName]
                          .filter(Boolean).join(' ').trim() || '—';
                        return (
                          <div
                            key={String(row.id)}
                            className="grid grid-cols-[1fr_1fr_1fr_auto] gap-px bg-white text-[12px]"
                          >
                            <div className="px-3 py-2.5 text-slate-800 truncate">
                              {String(row.subject ?? 'Demo call')}
                            </div>
                            <div className="px-3 py-2.5 text-slate-600 truncate">{linkedTo}</div>
                            <div className="px-3 py-2.5 text-slate-500 truncate">{performer}</div>
                            <div className="px-3 py-2.5 font-mono text-slate-400 whitespace-nowrap">
                              {row.occurredAt
                                ? formatDate(new Date(String(row.occurredAt)))
                                : '—'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Step 2 — Run */}
                  <div className="space-y-2 pt-1">
                    <p className="text-xs font-semibold text-slate-700">
                      Step 2 — Run the migration
                    </p>
                    <p className="text-xs text-slate-500">
                      This will create a Demo Record for each activity listed above. The original activity is kept — nothing is deleted.
                      This action cannot be undone, but is safe to re-preview at any time.
                    </p>
                    <Button
                      size="sm"
                      disabled={runBackfill.isPending}
                      onClick={() => runBackfill.mutate()}
                      className="gap-2"
                    >
                      <Play className="h-3.5 w-3.5" />
                      {runBackfill.isPending
                        ? `Migrating ${rows.length} record${rows.length === 1 ? '' : 's'}...`
                        : `Run migration (${rows.length} record${rows.length === 1 ? '' : 's'})`}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Done state */}
          {done && (
            <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-emerald-800">
                  Migration complete — {migratedCount} record{migratedCount === 1 ? '' : 's'} migrated
                </p>
                <p className="mt-0.5 text-xs text-emerald-700">
                  The migrated records now appear in the Demo Records tabs on companies, contacts, and deals,
                  and in the Command Center.
                </p>
                <button
                  type="button"
                  className="mt-2 text-xs text-emerald-700 underline hover:text-emerald-900"
                  onClick={() => { setDone(false); setPreviewed(true); }}
                >
                  Run preview again to check remaining records
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

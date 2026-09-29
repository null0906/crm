'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/lib/trpc';
import { useAutosave } from '@/hooks/useAutosave';
import { SaveStatus } from './SaveStatus';

export interface DriverAnswerDraft {
  driverId: string;
  optionId?: string | null;
  numericValue?: number | null;
  source?: string | null;
  answerConfidence?: 'low' | 'medium' | 'high' | null;
}

/**
 * The scoping questionnaire (FR-P4-11).
 *
 * Answers one question: how big is this engagement against a standard one of
 * its service line. It used to also decide the team and the hours, by expanding
 * a baseline from a multiplier split across two axes — which meant answering a
 * question here silently rewrote how long everyone was working. Hours and
 * people are now typed in below, by someone who knows who is free.
 *
 * Each answer records where it came from and how sure the person was, because
 * an estimate that turns out wrong should be traceable to who said what.
 */
export function ScopingQuestionnaire({
  answers,
  serviceLine,
  readOnly,
  onApply,
  isApplying,
  isError = false,
}: {
  answers: DriverAnswerDraft[];
  /** Narrows the questions to the ones asked for this service. */
  serviceLine: string | null;
  readOnly: boolean;
  onApply: (answers: DriverAnswerDraft[]) => void;
  isApplying: boolean;
  isError?: boolean;
}) {
  const { data: drivers = [], isLoading } = trpc.sizing.listDrivers.useQuery({ serviceLine });
  const [draft, setDraft] = useState<Record<string, DriverAnswerDraft>>(() =>
    Object.fromEntries(answers.map((a) => [a.driverId, a]))
  );

  const list = Object.values(draft).filter(
    (a) => a.optionId != null || a.numericValue != null
  );

  const { data: preview } = trpc.sizing.previewMultiplier.useQuery(
    { answers: list },
    { enabled: list.length > 0 }
  );

  const { status } = useAutosave({
    value: list,
    // Source and confidence ride along unedited, so they are not part of the
    // key -- an answer whose provenance came back from the server unchanged is
    // not an edit.
    serialise: (l) =>
      JSON.stringify(
        [...l]
          .sort((a, b) => a.driverId.localeCompare(b.driverId))
          .map((a) => [a.driverId, a.optionId ?? '', a.numericValue ?? ''])
      ),
    enabled: !readOnly,
    isSaving: isApplying,
    isError,
    onSave: onApply,
  });

  function set(driverId: string, patch: Partial<DriverAnswerDraft>) {
    setDraft((d) => ({ ...d, [driverId]: { ...(d[driverId] ?? { driverId }), driverId, ...patch } }));
  }

  return (
    <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_4px_rgba(16,24,40,0.04)]">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-baseline gap-2">
            <h2 className="text-[13px] font-medium text-slate-800">Scoping</h2>
            <SaveStatus status={status} />
          </div>
          <p className="mt-0.5 text-[11px] text-slate-400">
            What makes this engagement bigger or smaller than a standard one. Answers save
            themselves; they change no hours and move nobody.
          </p>
        </div>
        {preview && (
          <div className="text-right">
            <p className="text-[18px] font-semibold tabular-nums text-slate-900">
              ×{preview.multiplier}
            </p>
            <p className="text-[10px] text-slate-400">the size of a standard one</p>
          </div>
        )}
      </div>

      {preview?.capped && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
          <p className="text-[11px] leading-relaxed text-amber-800">
            These answers compose to ×{preview.rawMultiplier}, above the ×{preview.maxMultiplier}{' '}
            ceiling, so the multiplier was capped. Worth checking the answers rather than accepting
            the cap.
          </p>
        </div>
      )}

      {!isLoading && drivers.length === 0 && (
        <p className="text-[11px] leading-relaxed text-slate-400">
          No scoping questions are configured
          {serviceLine ? ' for this service line' : ''}, so this engagement is sized as standard.{' '}
          <Link href="/settings/service-lines" className="text-blue-600 hover:underline">
            Set them up in Settings
          </Link>
          .
        </p>
      )}

      <div className="space-y-3">
        {drivers.map((d) => {
          const a = draft[d.id];
          const contribution = preview?.contributions.find((c) => c.driverId === d.id);
          return (
            <div key={d.id} className="grid gap-2 sm:grid-cols-12 sm:items-center">
              <div className="sm:col-span-7">
                <p className="text-[12px] text-slate-700">{d.name}</p>
                {d.description && (
                  <p className="text-[10px] leading-relaxed text-slate-400">{d.description}</p>
                )}
              </div>

              <div className="sm:col-span-3">
                {/* Source and confidence used to sit here. They were never
                    filled in, and two empty fields per question made a
                    fourteen-question sheet look like work. The columns remain on
                    estimate_drivers, so answers already recorded keep theirs. */}
                {d.valueType === 'select' ? (
                  <select
                    disabled={readOnly}
                    value={a?.optionId ?? ''}
                    onChange={(e) => set(d.id, { optionId: e.target.value || null })}
                    className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-700 disabled:bg-slate-50"
                  >
                    <option value="">Not answered</option>
                    {d.options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    disabled={readOnly}
                    type="number"
                    min={0}
                    value={a?.numericValue ?? ''}
                    onChange={(e) =>
                      set(d.id, {
                        numericValue: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                    className="h-8"
                    placeholder="—"
                  />
                )}
              </div>

              <div className="text-right sm:col-span-2">
                {contribution && contribution.multiplier !== 1 && (
                  <Badge variant={contribution.multiplier > 1 ? 'warning' : 'success'}>
                    ×{contribution.multiplier}
                  </Badge>
                )}
              </div>
            </div>
          );
        })}
      </div>

    </section>
  );
}

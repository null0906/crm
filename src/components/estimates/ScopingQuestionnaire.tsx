'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/lib/trpc';

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
 * Each answer records where it came from and how sure the person was, because
 * an estimate that turns out wrong should be traceable to who said what.
 */
export function ScopingQuestionnaire({
  answers,
  readOnly,
  onApply,
  isApplying,
}: {
  answers: DriverAnswerDraft[];
  readOnly: boolean;
  onApply: (answers: DriverAnswerDraft[]) => void;
  isApplying: boolean;
}) {
  const { data: drivers = [] } = trpc.sizing.listDrivers.useQuery();
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

  function set(driverId: string, patch: Partial<DriverAnswerDraft>) {
    setDraft((d) => ({ ...d, [driverId]: { ...(d[driverId] ?? { driverId }), driverId, ...patch } }));
  }

  return (
    <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_4px_rgba(16,24,40,0.04)]">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[13px] font-medium text-slate-800">Scoping</h2>
          <p className="mt-0.5 text-[11px] text-slate-400">
            What makes this engagement bigger or smaller than the baseline.
          </p>
        </div>
        {preview && (
          <div className="text-right">
            <p className="text-[18px] font-semibold tabular-nums text-slate-900">
              ×{preview.multiplier}
            </p>
            <p className="text-[10px] text-slate-400">
              weeks ×{preview.weeksMultiplier} · team ×{preview.teamMultiplier}
            </p>
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

      <div className="space-y-3">
        {drivers.map((d) => {
          const a = draft[d.id];
          const contribution = preview?.contributions.find((c) => c.driverId === d.id);
          return (
            <div key={d.id} className="grid gap-2 sm:grid-cols-12 sm:items-center">
              <div className="sm:col-span-4">
                <p className="text-[12px] text-slate-700">{d.name}</p>
                <p className="text-[10px] text-slate-400">
                  {d.appliesTo === 'weeks'
                    ? 'adds weeks'
                    : d.appliesTo === 'team'
                      ? 'adds people'
                      : 'adds both'}
                </p>
              </div>

              <div className="sm:col-span-3">
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

              <div className="sm:col-span-2">
                <Input
                  disabled={readOnly}
                  value={a?.source ?? ''}
                  onChange={(e) => set(d.id, { source: e.target.value || null })}
                  className="h-8"
                  placeholder="Source"
                />
              </div>

              <div className="sm:col-span-2">
                <select
                  disabled={readOnly}
                  value={a?.answerConfidence ?? ''}
                  onChange={(e) =>
                    set(d.id, {
                      answerConfidence: (e.target.value || null) as 'low' | 'medium' | 'high' | null,
                    })
                  }
                  className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-700 disabled:bg-slate-50"
                >
                  <option value="">Confidence</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div className="text-right sm:col-span-1">
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

      {!readOnly && (
        <div className="mt-4 flex items-center gap-3">
          <Button size="sm" disabled={isApplying} onClick={() => onApply(list)}>
            {isApplying ? 'Re-sizing…' : 'Apply & re-size team'}
          </Button>
          <p className="text-[11px] text-slate-400">
            Re-sizing rebuilds the team from the baseline — any manual edits to it are lost.
          </p>
        </div>
      )}
    </section>
  );
}

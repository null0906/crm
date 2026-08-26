'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface CostLineDraft {
  kind: 'non_labour' | 'custom';
  label: string;
  amount: string;
  basis: 'engagement' | 'per_resource_hour';
  passThrough: boolean;
}

/**
 * Non-labour costs and estimator-defined variables (FR-P4-16, FR-P4-56).
 *
 * Pass-through matters commercially: an external auditor fee passed through at
 * cost is money moving through you, not margin you earn on it.
 */
export function CostLinesEditor({
  lines,
  readOnly,
  onSave,
  isSaving,
}: {
  lines: CostLineDraft[];
  readOnly: boolean;
  onSave: (lines: CostLineDraft[]) => void;
  isSaving: boolean;
}) {
  const [draft, setDraft] = useState<CostLineDraft[]>(lines);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDraft(lines);
    setDirty(false);
  }, [lines]);

  function update(i: number, patch: Partial<CostLineDraft>) {
    setDraft((d) => d.map((l, j) => (j === i ? { ...l, ...patch } : l)));
    setDirty(true);
  }

  function add(kind: 'non_labour' | 'custom') {
    setDraft((d) => [
      ...d,
      { kind, label: '', amount: '', basis: 'engagement', passThrough: kind === 'non_labour' },
    ]);
    setDirty(true);
  }

  const valid = draft.every((l) => l.label.trim() && Number.isFinite(Number(l.amount)));

  return (
    <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_4px_rgba(16,24,40,0.04)]">
      <div className="mb-3">
        <h2 className="text-[13px] font-medium text-slate-800">Other costs</h2>
        <p className="mt-0.5 text-[11px] text-slate-400">
          Support and overhead, external auditor fees, tooling, travel — plus any variable of your
          own. Pass-through lines are quoted at cost and earn no margin.
        </p>
      </div>

      <div className="space-y-2">
        {draft.length === 0 && <p className="text-[11px] text-slate-400">None.</p>}
        {draft.map((line, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              disabled={readOnly}
              value={line.label}
              onChange={(e) => update(i, { label: e.target.value })}
              placeholder={line.kind === 'non_labour' ? 'e.g. External auditor fee' : 'e.g. Travel'}
              className="h-8 flex-1"
            />
            <Input
              disabled={readOnly}
              type="number"
              step="any"
              value={line.amount}
              onChange={(e) => update(i, { amount: e.target.value })}
              placeholder="0"
              className="h-8 w-32"
            />
            {line.kind === 'custom' && (
              <select
                disabled={readOnly}
                value={line.basis}
                onChange={(e) =>
                  update(i, { basis: e.target.value as 'engagement' | 'per_resource_hour' })
                }
                className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-700 disabled:bg-slate-50"
              >
                <option value="engagement">per engagement</option>
                <option value="per_resource_hour">per resource-hour</option>
              </select>
            )}
            <label className="flex items-center gap-1 text-[11px] text-slate-500">
              <input
                type="checkbox"
                disabled={readOnly}
                checked={line.passThrough}
                onChange={(e) => update(i, { passThrough: e.target.checked })}
              />
              pass-through
            </label>
            {!readOnly && (
              <button
                type="button"
                onClick={() => {
                  setDraft((d) => d.filter((_, j) => j !== i));
                  setDirty(true);
                }}
                className="p-1 text-slate-300 hover:text-red-500"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      {!readOnly && (
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => add('non_labour')}>
            <Plus className="mr-1 h-3 w-3" />
            Non-labour
          </Button>
          <Button size="sm" variant="ghost" onClick={() => add('custom')}>
            <Plus className="mr-1 h-3 w-3" />
            Custom variable
          </Button>
          {dirty && (
            <Button size="sm" disabled={!valid || isSaving} onClick={() => onSave(draft)}>
              {isSaving ? 'Saving…' : 'Save costs'}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

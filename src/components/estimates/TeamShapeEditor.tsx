'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { trpc } from '@/lib/trpc';

export interface TeamLineDraft {
  deliveryRoleId: string;
  resourceCount: string;
  hours: string;
}

/** The team shape: which roles, how many people, for how many hours. */
export function TeamShapeEditor({
  lines,
  readOnly,
  onSave,
  isSaving,
}: {
  lines: TeamLineDraft[];
  readOnly: boolean;
  onSave: (lines: TeamLineDraft[]) => void;
  isSaving: boolean;
}) {
  const { data: roles = [] } = trpc.costModel.listRoles.useQuery();
  const [draft, setDraft] = useState<TeamLineDraft[]>(lines);
  const [dirty, setDirty] = useState(false);

  // Re-sizing from the questionnaire replaces the team, so the editor has to
  // pick up the new shape rather than hold on to what was on screen.
  useEffect(() => {
    setDraft(lines);
    setDirty(false);
  }, [lines]);

  function update(i: number, patch: Partial<TeamLineDraft>) {
    setDraft((d) => d.map((l, j) => (j === i ? { ...l, ...patch } : l)));
    setDirty(true);
  }

  const totalEffort = draft.reduce(
    (sum, l) => sum + (Number(l.resourceCount) || 0) * (Number(l.hours) || 0),
    0
  );
  const valid = draft.every(
    (l) => l.deliveryRoleId && Number(l.resourceCount) > 0 && Number(l.hours) > 0
  );

  return (
    <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_4px_rgba(16,24,40,0.04)]">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[13px] font-medium text-slate-800">Team &amp; hours</h2>
          <p className="mt-0.5 text-[11px] text-slate-400">
            Who is on it and for how long. Cost is charged per person per hour.
          </p>
        </div>
        <div className="text-right">
          <p className="text-[18px] font-semibold tabular-nums text-slate-900">{totalEffort}</p>
          <p className="text-[10px] text-slate-400">resource-hours</p>
        </div>
      </div>

      <div className="space-y-2">
        {draft.length === 0 && (
          <p className="text-[11px] text-slate-400">
            No team yet. Add a role, or answer the scoping questions to size one from the baseline.
          </p>
        )}
        {draft.map((line, i) => (
          <div key={i} className="flex items-center gap-2">
            <select
              disabled={readOnly}
              value={line.deliveryRoleId}
              onChange={(e) => update(i, { deliveryRoleId: e.target.value })}
              className="h-8 flex-1 rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-700 disabled:bg-slate-50"
            >
              <option value="">Role…</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <Input
              disabled={readOnly}
              type="number"
              min={1}
              value={line.resourceCount}
              onChange={(e) => update(i, { resourceCount: e.target.value })}
              className="h-8 w-16"
            />
            <span className="text-[11px] text-slate-400">people ×</span>
            <Input
              disabled={readOnly}
              type="number"
              min={0}
              step="any"
              value={line.hours}
              onChange={(e) => update(i, { hours: e.target.value })}
              className="h-8 w-20"
            />
            <span className="w-10 text-[11px] text-slate-400">hours</span>
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
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDraft((d) => [...d, { deliveryRoleId: '', resourceCount: '1', hours: '' }]);
              setDirty(true);
            }}
          >
            <Plus className="mr-1 h-3 w-3" />
            Add role
          </Button>
          {dirty && (
            <Button size="sm" disabled={!valid || isSaving} onClick={() => onSave(draft)}>
              {isSaving ? 'Saving…' : 'Save team'}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

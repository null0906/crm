'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { activeServiceLines } from '@/lib/service-lines';

export interface DraftLine {
  deliveryRoleId: string;
  resourceCount: string;
  hours: string;
}

export interface BaselineFormValue {
  serviceLine: string;
  segment: string;
  name: string;
  lines: DraftLine[];
}

/**
 * The team-shape editor, shared by creating a baseline and revising one.
 *
 * Revising is not an edit: it writes a new version and deactivates the old, so
 * estimates keep resolving the version they were built from. The form is the
 * same either way, which is why it lives here rather than being duplicated.
 */
export function BaselineForm({
  mode,
  initial,
  busy,
  onCancel,
  onSubmit,
}: {
  mode: 'create' | 'revise';
  initial?: Partial<BaselineFormValue>;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (value: BaselineFormValue) => void;
}) {
  const { data: roles = [] } = trpc.costModel.listRoles.useQuery();
  const [serviceLine, setServiceLine] = useState(initial?.serviceLine ?? '');
  const [segment, setSegment] = useState(initial?.segment ?? 'standard');
  const [name, setName] = useState(initial?.name ?? '');
  const [lines, setLines] = useState<DraftLine[]>(initial?.lines ?? []);

  const validLines = lines.filter(
    (l) => l.deliveryRoleId && Number(l.resourceCount) > 0 && Number(l.hours) > 0
  );
  const canSubmit = serviceLine && name.trim().length > 1 && validLines.length > 0;
  const effort = validLines.reduce((s, l) => s + Number(l.resourceCount) * Number(l.hours), 0);

  return (
    <div className="space-y-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_4px_rgba(16,24,40,0.04)]">
      {mode === 'revise' && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
          Saving creates a new version and retires the current one. Estimates already built keep
          resolving the version they were made from, so nothing you have quoted will move.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label className="text-[11px]">Service line</Label>
          <select
            value={serviceLine}
            disabled={mode === 'revise'}
            onChange={(e) => setServiceLine(e.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-700 disabled:bg-slate-50"
          >
            <option value="">Choose…</option>
            {activeServiceLines().map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-[11px]">Segment</Label>
          <Input
            value={segment}
            disabled={mode === 'revise'}
            onChange={(e) => setSegment(e.target.value)}
            className="mt-1"
            placeholder="standard"
          />
        </div>
        <div>
          <Label className="text-[11px]">Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1"
            placeholder="e.g. SOC 2 — mid-market"
          />
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <Label className="text-[11px]">
            Team shape
            {effort > 0 && (
              <span className="ml-2 text-slate-400">{effort} resource-hours</span>
            )}
          </Label>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setLines((l) => [...l, { deliveryRoleId: '', resourceCount: '1', hours: '' }])}
          >
            <Plus className="mr-1 h-3 w-3" />
            Add role
          </Button>
        </div>
        {lines.length === 0 && <p className="text-[11px] text-slate-400">No roles yet.</p>}
        <div className="space-y-2">
          {lines.map((line, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                value={line.deliveryRoleId}
                onChange={(e) =>
                  setLines((ls) => ls.map((l, j) => (j === i ? { ...l, deliveryRoleId: e.target.value } : l)))
                }
                className="h-9 flex-1 rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-700"
              >
                <option value="">Role…</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <Input
                type="number"
                min={1}
                value={line.resourceCount}
                onChange={(e) =>
                  setLines((ls) => ls.map((l, j) => (j === i ? { ...l, resourceCount: e.target.value } : l)))
                }
                className="w-20"
              />
              <span className="text-[11px] text-slate-400">×</span>
              <Input
                type="number"
                min={0}
                step="any"
                value={line.hours}
                onChange={(e) =>
                  setLines((ls) => ls.map((l, j) => (j === i ? { ...l, hours: e.target.value } : l)))
                }
                className="w-24"
                placeholder="hours"
              />
              <button
                type="button"
                onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                className="p-1 text-slate-300 hover:text-red-500"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {mode === 'create' && (
        <p className="text-[11px] text-slate-400">
          A new baseline starts as judgement-based with Low confidence. That changes once delivered
          effort supports it.
        </p>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!canSubmit || busy}
          onClick={() =>
            onSubmit({
              serviceLine,
              segment: segment.trim() || 'standard',
              name: name.trim(),
              lines: validLines,
            })
          }
        >
          {busy ? 'Saving…' : mode === 'create' ? 'Create baseline' : 'Save as new version'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

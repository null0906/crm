'use client';

import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useFinancialAccess } from '@/components/shared/FinancialAccessGate';
import { DEAL_SERVICE_OPTIONS } from '@/lib/constants';

interface DraftLine {
  deliveryRoleId: string;
  resourceCount: string;
  weeks: string;
}

const CONFIDENCE_VARIANT = {
  low: 'warning',
  medium: 'info',
  high: 'success',
} as const;

/**
 * Effort baselines (FR-P4-01 to FR-P4-07) — a team shape over weeks, per
 * service line, versioned rather than edited.
 *
 * Baselines describe effort, not money, so anyone can read them. Editing is
 * gated: a baseline is what every future price rests on.
 */
export function BaselinesTab() {
  const utils = trpc.useUtils();
  const { hasAccess } = useFinancialAccess();
  const { data: baselines = [], isLoading } = trpc.catalog.listBaselines.useQuery();
  const { data: roles = [] } = trpc.costModel.listRoles.useQuery();
  const { data: gaps = [] } = trpc.catalog.coverageGaps.useQuery();

  const [expanded, setExpanded] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [serviceLine, setServiceLine] = useState('');
  const [name, setName] = useState('');
  const [segment, setSegment] = useState('standard');
  const [lines, setLines] = useState<DraftLine[]>([]);

  const create = trpc.catalog.createBaseline.useMutation({
    onSuccess: () => {
      toast.success('Baseline created');
      setCreating(false);
      setName('');
      setServiceLine('');
      setLines([]);
      void utils.catalog.listBaselines.invalidate();
      void utils.catalog.coverageGaps.invalidate();
    },
    onError: (err) => toast.error('Could not create the baseline', { description: err.message }),
  });

  const validLines = lines.filter(
    (l) => l.deliveryRoleId && Number(l.resourceCount) > 0 && Number(l.weeks) > 0
  );
  const canCreate = serviceLine && name.trim().length > 1 && validLines.length > 0;

  const totalEffort = (b: { lines: { resourceCount: number; weeks: string }[] }) =>
    b.lines.reduce((sum, l) => sum + l.resourceCount * Number(l.weeks), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <p className="max-w-xl text-[11px] leading-relaxed text-slate-400">
          What a service line normally takes, as a team over weeks. Sizing drivers scale this into
          an estimate. Revising a baseline creates a new version, so estimates keep resolving the
          version they were built from.
        </p>
        {hasAccess && !creating && (
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-3 w-3" />
            New baseline
          </Button>
        )}
      </div>

      {gaps.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
          <div>
            <p className="text-[12px] font-medium text-amber-900">Services being sold with no baseline</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-amber-800">
              {gaps.map((g) => `${g.serviceLine} (${g.openDeals} open)`).join(' · ')}. Estimates for
              these start from a blank sheet.
            </p>
          </div>
        </div>
      )}

      {creating && (
        <div className="space-y-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_4px_rgba(16,24,40,0.04)]">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label className="text-[11px]">Service line</Label>
              <select
                value={serviceLine}
                onChange={(e) => setServiceLine(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-700"
              >
                <option value="">Choose…</option>
                {DEAL_SERVICE_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-[11px]">Segment</Label>
              <Input
                value={segment}
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
                placeholder="e.g. SOC 2 Type II — mid-market"
              />
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <Label className="text-[11px]">Team shape</Label>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setLines((l) => [...l, { deliveryRoleId: '', resourceCount: '1', weeks: '' }])
                }
              >
                <Plus className="mr-1 h-3 w-3" />
                Add role
              </Button>
            </div>
            {lines.length === 0 && (
              <p className="text-[11px] text-slate-400">No roles yet.</p>
            )}
            <div className="space-y-2">
              {lines.map((line, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={line.deliveryRoleId}
                    onChange={(e) =>
                      setLines((ls) =>
                        ls.map((l, j) => (j === i ? { ...l, deliveryRoleId: e.target.value } : l))
                      )
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
                      setLines((ls) =>
                        ls.map((l, j) => (j === i ? { ...l, resourceCount: e.target.value } : l))
                      )
                    }
                    className="w-20"
                    placeholder="1"
                  />
                  <span className="text-[11px] text-slate-400">×</span>
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={line.weeks}
                    onChange={(e) =>
                      setLines((ls) =>
                        ls.map((l, j) => (j === i ? { ...l, weeks: e.target.value } : l))
                      )
                    }
                    className="w-24"
                    placeholder="weeks"
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

          <p className="text-[11px] text-slate-400">
            A new baseline starts as judgement-based with Low confidence. That changes once
            delivered effort supports it.
          </p>

          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!canCreate || create.isPending}
              onClick={() =>
                create.mutate({
                  serviceLine,
                  segment: segment.trim() || 'standard',
                  name: name.trim(),
                  lines: validLines.map((l) => ({
                    deliveryRoleId: l.deliveryRoleId,
                    resourceCount: Number(l.resourceCount),
                    weeks: Number(l.weeks),
                  })),
                })
              }
            >
              {create.isPending ? 'Creating…' : 'Create baseline'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {isLoading && <p className="px-1 text-[12px] text-slate-400">Loading…</p>}
        {!isLoading && baselines.length === 0 && (
          <p className="px-1 text-[12px] text-slate-400">No baselines yet.</p>
        )}
        {baselines.map((b) => {
          const open = expanded === b.id;
          return (
            <div
              key={b.id}
              className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_4px_rgba(16,24,40,0.04)]"
            >
              <button
                type="button"
                onClick={() => setExpanded(open ? null : b.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50/80"
              >
                {open ? (
                  <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-slate-800">{b.name}</p>
                  <p className="text-[11px] text-slate-400">
                    {b.serviceLine} · {b.segment} · v{b.version} · {totalEffort(b)} resource-weeks
                  </p>
                </div>
                <Badge variant={CONFIDENCE_VARIANT[b.confidence as 'low' | 'medium' | 'high']}>
                  {b.confidence} confidence
                </Badge>
                {b.isJudgementBased && <Badge variant="outline">judgement-based</Badge>}
              </button>

              {open && (
                <div className="border-t border-slate-100 px-4 py-3">
                  {b.isJudgementBased && (
                    <p className="mb-2 text-[11px] leading-relaxed text-amber-700">
                      No delivered effort supports this yet, so treat the numbers as a starting
                      point rather than evidence.
                    </p>
                  )}
                  <table className="w-full">
                    <tbody>
                      {b.lines.map((l) => (
                        <tr key={l.id} className="border-b border-slate-50 last:border-0">
                          <td className="py-1.5 text-[12px] text-slate-700">{l.deliveryRoleName}</td>
                          <td className="py-1.5 text-right text-[12px] tabular-nums text-slate-500">
                            {l.resourceCount} × {Number(l.weeks)}w
                          </td>
                          <td className="w-24 py-1.5 text-right text-[12px] tabular-nums text-slate-400">
                            {l.resourceCount * Number(l.weeks)} rw
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

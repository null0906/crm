'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useFinancialAccess } from '@/components/shared/FinancialAccessGate';
import { BaselineForm, type BaselineFormValue } from './BaselineForm';

const CONFIDENCE_VARIANT = { low: 'warning', medium: 'info', high: 'success' } as const;

type Baseline = {
  id: string;
  serviceLine: string;
  segment: string;
  name: string;
  version: number;
  confidence: string;
  sampleSize: number;
  observedSpreadPercent: string | null;
  isJudgementBased: boolean;
  lines: {
    id: string;
    deliveryRoleId: string;
    deliveryRoleName: string | null;
    resourceCount: number;
    hours: string;
  }[];
};

export function BaselinesTab() {
  const utils = trpc.useUtils();
  const { hasAccess } = useFinancialAccess();
  const { data: baselines = [], isLoading } = trpc.catalog.listBaselines.useQuery();
  const { data: gaps = [] } = trpc.catalog.coverageGaps.useQuery();

  const [expanded, setExpanded] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [revising, setRevising] = useState<Baseline | null>(null);
  const [confidenceFor, setConfidenceFor] = useState<Baseline | null>(null);
  const [deactivating, setDeactivating] = useState<Baseline | null>(null);

  const refresh = () => {
    void utils.catalog.listBaselines.invalidate();
    void utils.catalog.coverageGaps.invalidate();
  };
  const fail = (what: string) => (e: { message: string }) =>
    toast.error(`Could not ${what}`, { description: e.message });

  const create = trpc.catalog.createBaseline.useMutation({
    onSuccess: () => { toast.success('Baseline created'); setCreating(false); refresh(); },
    onError: fail('create the baseline'),
  });
  const revise = trpc.catalog.reviseBaseline.useMutation({
    onSuccess: (b) => {
      toast.success(`Saved as version ${b?.version}`, { description: 'The previous version was retired.' });
      setRevising(null);
      refresh();
    },
    onError: fail('revise the baseline'),
  });
  const setConfidence = trpc.catalog.setConfidence.useMutation({
    onSuccess: () => { toast.success('Confidence updated'); setConfidenceFor(null); refresh(); },
    onError: fail('update confidence'),
  });
  const deactivate = trpc.catalog.deactivateBaseline.useMutation({
    onSuccess: () => { toast.success('Baseline deactivated'); setDeactivating(null); refresh(); },
    onError: fail('deactivate the baseline'),
  });

  const totalEffort = (b: Baseline) =>
    b.lines.reduce((sum, l) => sum + l.resourceCount * Number(l.hours), 0);

  const toLines = (v: BaselineFormValue) =>
    v.lines.map((l) => ({
      deliveryRoleId: l.deliveryRoleId,
      resourceCount: Number(l.resourceCount),
      hours: Number(l.hours),
    }));

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <p className="max-w-xl text-[11px] leading-relaxed text-slate-400">
          What a service line normally takes, as a team over hours. Sizing drivers scale this into
          an estimate. Revising creates a new version, so estimates keep resolving the version they
          were built from.
        </p>
        {hasAccess && !creating && !revising && (
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
            <p className="text-[12px] font-medium text-amber-900">
              Services being sold with no baseline
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-amber-800">
              {gaps.map((g) => `${g.serviceLine} (${g.openDeals} open)`).join(' · ')}. Estimates for
              these start from a blank sheet.
            </p>
          </div>
        </div>
      )}

      {creating && (
        <BaselineForm
          mode="create"
          busy={create.isPending}
          onCancel={() => setCreating(false)}
          onSubmit={(v) =>
            create.mutate({
              serviceLine: v.serviceLine,
              segment: v.segment,
              name: v.name,
              lines: toLines(v),
            })
          }
        />
      )}

      {revising && (
        <BaselineForm
          mode="revise"
          busy={revise.isPending}
          initial={{
            serviceLine: revising.serviceLine,
            segment: revising.segment,
            name: revising.name,
            lines: revising.lines.map((l) => ({
              deliveryRoleId: l.deliveryRoleId,
              resourceCount: String(l.resourceCount),
              hours: String(Number(l.hours)),
            })),
          }}
          onCancel={() => setRevising(null)}
          onSubmit={(v) => revise.mutate({ id: revising.id, name: v.name, lines: toLines(v) })}
        />
      )}

      <div className="space-y-2">
        {isLoading && <p className="px-1 text-[12px] text-slate-400">Loading…</p>}
        {!isLoading && baselines.length === 0 && (
          <p className="px-1 text-[12px] text-slate-400">No baselines yet.</p>
        )}
        {(baselines as unknown as Baseline[]).map((b) => {
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
                    {b.serviceLine} · {b.segment} · v{b.version} · {totalEffort(b)} resource-hours
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
                            {l.resourceCount} × {Number(l.hours)}h
                          </td>
                          <td className="w-24 py-1.5 text-right text-[12px] tabular-nums text-slate-400">
                            {l.resourceCount * Number(l.hours)} rh
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {hasAccess && (
                    <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
                      <Button size="sm" variant="outline" onClick={() => { setCreating(false); setRevising(b); }}>
                        Revise
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfidenceFor(b)}>
                        Set confidence
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeactivating(b)}>
                        Deactivate
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ConfidenceDialog
        baseline={confidenceFor}
        busy={setConfidence.isPending}
        onClose={() => setConfidenceFor(null)}
        onSave={(v) => setConfidence.mutate({ id: confidenceFor!.id, ...v })}
      />

      <ConfirmDialog
        open={!!deactivating}
        onOpenChange={(o) => !o && setDeactivating(null)}
        title={`Deactivate "${deactivating?.name}"?`}
        description="It stops being offered when starting a new estimate. Estimates already built on it are unaffected and keep resolving it."
        confirmLabel="Deactivate"
        loading={deactivate.isPending}
        onConfirm={() => deactivating && deactivate.mutate({ id: deactivating.id })}
      />
    </div>
  );
}

/**
 * Confidence is evidence. The server refuses to clear the judgement-based flag
 * while sample size is zero; the same rule is enforced here so the refusal is
 * not the first feedback you get.
 */
function ConfidenceDialog({
  baseline,
  busy,
  onClose,
  onSave,
}: {
  baseline: Baseline | null;
  busy: boolean;
  onClose: () => void;
  onSave: (v: {
    confidence: 'low' | 'medium' | 'high';
    sampleSize: number;
    observedSpreadPercent: number | null;
    isJudgementBased: boolean;
  }) => void;
}) {
  const [confidence, setConfidence] = useState<'low' | 'medium' | 'high'>('low');
  const [sampleSize, setSampleSize] = useState('0');
  const [spread, setSpread] = useState('');
  const [judgement, setJudgement] = useState(true);

  useEffect(() => {
    if (baseline) {
      setConfidence(baseline.confidence as 'low' | 'medium' | 'high');
      setSampleSize(String(baseline.sampleSize));
      setSpread(baseline.observedSpreadPercent ?? '');
      setJudgement(baseline.isJudgementBased);
    }
  }, [baseline]);

  const samples = Number(sampleSize);
  const blocked = !judgement && !(samples >= 1);

  return (
    <Dialog open={!!baseline} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[14px]">Confidence — {baseline?.name}</DialogTitle>
          <DialogDescription className="text-[11px]">
            How much evidence stands behind these numbers. Low confidence is what drives a
            contingency when the estimate is priced.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px]">Confidence</Label>
              <select
                value={confidence}
                onChange={(e) => setConfidence(e.target.value as 'low' | 'medium' | 'high')}
                className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-700"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <Label className="text-[11px]">Completed engagements</Label>
              <Input
                type="number"
                min={0}
                value={sampleSize}
                onChange={(e) => setSampleSize(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label className="text-[11px]">
              Observed spread % <span className="text-slate-300">(optional)</span>
            </Label>
            <Input
              type="number"
              min={0}
              step="any"
              value={spread}
              onChange={(e) => setSpread(e.target.value)}
              className="mt-1"
              placeholder="18"
            />
          </div>

          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={judgement}
              onChange={(e) => setJudgement(e.target.checked)}
            />
            <span className="text-[11px] leading-relaxed text-slate-600">
              Judgement-based — no delivered effort supports this yet
            </span>
          </label>

          {blocked && (
            <p className="text-[11px] text-red-600">
              A baseline can only stop being judgement-based once at least one completed engagement
              supports it.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={blocked || busy}
            onClick={() =>
              onSave({
                confidence,
                sampleSize: samples || 0,
                observedSpreadPercent: spread.trim() === '' ? null : Number(spread),
                isJudgementBased: judgement,
              })
            }
          >
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

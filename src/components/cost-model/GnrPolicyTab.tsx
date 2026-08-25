'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * GNR — gross non-recoverable (FR-P4-17). The uplift covering bench time,
 * rework and unbilled travel. Versioned, so an old estimate reproduces under
 * the rate that applied to it.
 */
export function GnrPolicyTab() {
  const utils = trpc.useUtils();
  const { data: policies = [], isLoading } = trpc.costModel.listGnrPolicies.useQuery();
  const [rate, setRate] = useState('');
  const [appliesTo, setAppliesTo] = useState<'total' | 'labour_only'>('total');
  const [effectiveFrom, setEffectiveFrom] = useState(today());

  const create = trpc.costModel.createGnrPolicy.useMutation({
    onSuccess: () => {
      toast.success('GNR rate set', { description: 'Saved as a new version.' });
      setRate('');
      void utils.costModel.listGnrPolicies.invalidate();
    },
    onError: (err) => toast.error('Could not set the GNR rate', { description: err.message }),
  });

  const current = policies[0];
  const parsed = Number(rate);
  const valid = rate.trim() !== '' && Number.isFinite(parsed) && parsed >= 0 && parsed <= 100;

  return (
    <div className="space-y-5">
      <p className="max-w-2xl text-[11px] leading-relaxed text-slate-400">
        Gross non-recoverable: the share of paid time that never reaches a client — bench time,
        rework, unbilled travel. Applied as a percentage uplift once the labour and non-labour
        totals are in.
      </p>

      {!isLoading && !current && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
          <div>
            <p className="text-[12px] font-medium text-amber-900">No GNR rate is set</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-amber-800">
              Estimates will apply 0% and warn. Nothing is seeded, because a made-up figure here
              understates every cost you produce.
            </p>
          </div>
        </div>
      )}

      {current && (
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_4px_rgba(16,24,40,0.04)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400">
            Current
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-[20px] font-semibold tabular-nums text-slate-900">
              {Number(current.ratePercent)}%
            </span>
            <Badge variant="secondary">
              on {current.appliesTo === 'total' ? 'the engagement total' : 'labour only'}
            </Badge>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            {current.name} v{current.version} · effective from {current.effectiveFrom}
          </p>
        </div>
      )}

      <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_4px_rgba(16,24,40,0.04)]">
        <h3 className="mb-3 text-[12px] font-medium text-slate-700">Set a new rate</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="gnr-rate" className="text-[11px]">
              Rate %
            </Label>
            <Input
              id="gnr-rate"
              type="number"
              min={0}
              max={100}
              step="any"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="12"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="gnr-basis" className="text-[11px]">
              Applies to
            </Label>
            <select
              id="gnr-basis"
              value={appliesTo}
              onChange={(e) => setAppliesTo(e.target.value as 'total' | 'labour_only')}
              className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-700"
            >
              <option value="total">Engagement total</option>
              <option value="labour_only">Labour only</option>
            </select>
          </div>
          <div>
            <Label htmlFor="gnr-from" className="text-[11px]">
              Effective from
            </Label>
            <Input
              id="gnr-from"
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          Applying to the total uplifts pass-through costs such as an external auditor fee too.
          Labour only leaves them at cost.
        </p>
        <div className="mt-3">
          <Button
            size="sm"
            disabled={!valid || create.isPending}
            onClick={() =>
              create.mutate({
                name: 'Standard GNR',
                ratePercent: parsed,
                appliesTo,
                effectiveFrom,
              })
            }
          >
            {create.isPending ? 'Saving…' : 'Save as new version'}
          </Button>
        </div>
      </div>

      {policies.length > 1 && (
        <div>
          <h3 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400">
            History
          </h3>
          <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_4px_rgba(16,24,40,0.04)]">
            <table className="w-full">
              <tbody>
                {policies.slice(1).map((p) => (
                  <tr key={p.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2.5 text-[13px] tabular-nums text-slate-700">
                      {Number(p.ratePercent)}%
                    </td>
                    <td className="px-4 py-2.5 text-[11px] text-slate-400">
                      {p.appliesTo === 'total' ? 'engagement total' : 'labour only'}
                    </td>
                    <td className="px-4 py-2.5 text-[11px] text-slate-400">
                      v{p.version} · from {p.effectiveFrom}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

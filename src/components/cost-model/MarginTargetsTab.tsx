'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { activeServiceLines, serviceLineLabel } from '@/lib/service-lines';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const COMPANY_DEFAULT = '*';

/**
 * Target margins and floors (FR-P4-28).
 *
 * The target is guidance — cost sets the floor, the market sets the price. The
 * floor produces a warning in the builder; it does not block approval, because
 * blocking would need an approval trail and there isn't one yet.
 */
export function MarginTargetsTab() {
  const utils = trpc.useUtils();
  const { data: targets = [], isLoading } = trpc.costModel.listMarginTargets.useQuery();
  const [adding, setAdding] = useState(false);
  const [serviceLine, setServiceLine] = useState(COMPANY_DEFAULT);
  const [target, setTarget] = useState('');
  const [floor, setFloor] = useState('');

  const save = trpc.costModel.setMarginTarget.useMutation({
    onSuccess: () => {
      toast.success('Margin target saved', {
        description: 'The previous target was closed, not overwritten.',
      });
      setTarget('');
      setFloor('');
      setAdding(false);
      void utils.costModel.listMarginTargets.invalidate();
    },
    onError: (err) => toast.error('Could not save the target', { description: err.message }),
  });

  const targetNum = Number(target);
  const floorNum = floor.trim() === '' ? null : Number(floor);
  const floorTooHigh = floorNum !== null && Number.isFinite(floorNum) && floorNum > targetNum;
  const valid =
    target.trim() !== '' &&
    Number.isFinite(targetNum) &&
    targetNum >= 0 &&
    targetNum <= 100 &&
    !floorTooHigh;

  const sorted = [...targets].sort((a, b) =>
    a.serviceLine === COMPANY_DEFAULT ? -1 : b.serviceLine === COMPANY_DEFAULT ? 1 : a.serviceLine.localeCompare(b.serviceLine)
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <p className="max-w-xl text-[11px] leading-relaxed text-slate-400">
          Pre-fills the target on a new estimate. A service line without its own target uses the
          company default. The floor warns in the builder when a price falls below it — it does not
          block approval.
        </p>
        {!adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="mr-1 h-3 w-3" />
            Set target
          </Button>
        )}
      </div>

      {adding && (
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_4px_rgba(16,24,40,0.04)]">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="mt-service" className="text-[11px]">
                Applies to
              </Label>
              <select
                id="mt-service"
                value={serviceLine}
                onChange={(e) => setServiceLine(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-700"
              >
                <option value={COMPANY_DEFAULT}>Company default (all services)</option>
                {activeServiceLines().map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="mt-target" className="text-[11px]">
                Target margin %
              </Label>
              <Input
                id="mt-target"
                type="number"
                min={0}
                max={100}
                step="any"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="35"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="mt-floor" className="text-[11px]">
                Floor % <span className="text-slate-300">(optional)</span>
              </Label>
              <Input
                id="mt-floor"
                type="number"
                min={0}
                max={100}
                step="any"
                value={floor}
                onChange={(e) => setFloor(e.target.value)}
                placeholder="28"
                className="mt-1"
              />
            </div>
          </div>
          {floorTooHigh && (
            <p className="mt-2 text-[11px] text-red-600">
              The floor cannot be above the target, or every compliant price would warn.
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              disabled={!valid || save.isPending}
              onClick={() =>
                save.mutate({
                  serviceLine,
                  targetMarginPercent: targetNum,
                  floorMarginPercent: floorNum,
                  effectiveFrom: today(),
                })
              }
            >
              {save.isPending ? 'Saving…' : 'Save target'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_4px_rgba(16,24,40,0.04)]">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Applies to</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Target</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Floor</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Since</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-[12px] text-slate-400">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && sorted.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-[12px] text-slate-400">
                  No margin targets set. Estimates will ask for one each time.
                </td>
              </tr>
            )}
            {sorted.map((t) => (
              <tr key={t.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2.5">
                  {t.serviceLine === COMPANY_DEFAULT ? (
                    <Badge variant="secondary">Company default</Badge>
                  ) : (
                    <span className="text-[13px] text-slate-800">
                      {serviceLineLabel(t.serviceLine)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-[13px] tabular-nums text-slate-800">
                  {Number(t.targetMarginPercent)}%
                </td>
                <td className="px-4 py-2.5">
                  {t.floorMarginPercent === null ? (
                    <span className="text-[12px] text-slate-300">none</span>
                  ) : (
                    <span className="text-[13px] tabular-nums text-amber-700">
                      {Number(t.floorMarginPercent)}%
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-[11px] text-slate-400">{t.effectiveFrom}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

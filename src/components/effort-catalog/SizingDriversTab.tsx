'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useFinancialAccess } from '@/components/shared/FinancialAccessGate';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const APPLIES_LABEL: Record<string, string> = {
  weeks: 'lengthens the engagement',
  team: 'enlarges the team',
  both: 'both',
};

/**
 * Sizing drivers (FR-P4-08 to FR-P4-10).
 *
 * Each driver records whether it stretches the schedule, grows the team, or
 * both — those cost differently, so the distinction is not cosmetic. A driver
 * marked "both" is split as the square root across each axis, so its stated
 * effect on total effort is reproduced rather than squared.
 */
export function SizingDriversTab() {
  const utils = trpc.useUtils();
  const { hasAccess } = useFinancialAccess();
  const { data: drivers = [], isLoading } = trpc.sizing.listDrivers.useQuery();
  const { data: policy } = trpc.sizing.getPolicy.useQuery();
  const [ceiling, setCeiling] = useState('');

  const setPolicy = trpc.sizing.setPolicy.useMutation({
    onSuccess: () => {
      toast.success('Ceiling updated', { description: 'Saved as a new version.' });
      setCeiling('');
      void utils.sizing.getPolicy.invalidate();
    },
    onError: (err) => toast.error('Could not update the ceiling', { description: err.message }),
  });

  const parsed = Number(ceiling);
  const valid = ceiling.trim() !== '' && Number.isFinite(parsed) && parsed >= 1;

  return (
    <div className="space-y-5">
      <p className="max-w-2xl text-[11px] leading-relaxed text-slate-400">
        The questions that genuinely change how much work an engagement is. Answering them in the
        estimate builder scales the catalog baseline. Each driver records whether it adds weeks,
        adds people, or both.
      </p>

      <div className="space-y-2">
        {isLoading && <p className="px-1 text-[12px] text-slate-400">Loading…</p>}
        {drivers.map((d) => (
          <div
            key={d.id}
            className="rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-[0_1px_4px_rgba(16,24,40,0.04)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-slate-800">{d.name}</p>
                <p className="text-[11px] text-slate-400">
                  {d.valueType === 'number'
                    ? `A number — ${Number(d.multiplierPerUnit ?? 0) * 100}% per unit above ${d.unitBaseline}`
                    : 'Choose one'}
                </p>
              </div>
              <Badge variant="secondary">{APPLIES_LABEL[d.appliesTo] ?? d.appliesTo}</Badge>
            </div>

            {d.options.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {d.options.map((o) => (
                  <span
                    key={o.id}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600"
                  >
                    {o.label}
                    <span
                      className={
                        Number(o.multiplier) > 1
                          ? 'tabular-nums text-amber-600'
                          : Number(o.multiplier) < 1
                            ? 'tabular-nums text-green-600'
                            : 'tabular-nums text-slate-400'
                      }
                    >
                      ×{Number(o.multiplier)}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_4px_rgba(16,24,40,0.04)]">
        <h3 className="text-[12px] font-medium text-slate-700">Composition ceiling</h3>
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
          Drivers compound, so a badly-answered questionnaire can produce an implausible multiplier.
          Anything above the ceiling is capped — and the estimate says so, rather than hiding it.
        </p>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-[18px] font-semibold tabular-nums text-slate-900">
            {policy ? `${Number(policy.maxMultiplier)}×` : 'none set'}
          </span>
          {policy && <Badge variant="secondary">{policy.composition}</Badge>}
        </div>

        {hasAccess && (
          <div className="mt-3 flex items-end gap-2">
            <div>
              <Label htmlFor="ceiling" className="text-[11px]">
                New ceiling
              </Label>
              <Input
                id="ceiling"
                type="number"
                min={1}
                step="any"
                value={ceiling}
                onChange={(e) => setCeiling(e.target.value)}
                placeholder="2.5"
                className="mt-1 w-32"
              />
            </div>
            <Button
              size="sm"
              disabled={!valid || setPolicy.isPending}
              onClick={() =>
                setPolicy.mutate({
                  name: policy?.name ?? 'Standard sizing policy',
                  maxMultiplier: parsed,
                  composition: (policy?.composition ?? 'multiplicative') as
                    | 'multiplicative'
                    | 'additive',
                  effectiveFrom: today(),
                })
              }
            >
              {setPolicy.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useFinancialAccess } from '@/components/shared/FinancialAccessGate';
import { DriverEditor, type Driver } from './DriverEditor';
import { NewDriverDialog } from './NewDriverDialog';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Sizing drivers (FR-P4-08 to FR-P4-10).
 *
 * Each driver records whether it stretches the schedule, grows the team, or
 * both — those cost differently, so the distinction is not cosmetic. A driver
 * marked "both" is split as the square root across each axis, so its stated
 * effect on total effort is reproduced rather than squared.
 *
 * Weights mutate in place rather than being effective-dated like cost rates.
 * That is safe because every estimate stores the multiplier it actually used
 * at the moment its questionnaire was answered, so changing a weight today
 * cannot move an estimate made yesterday.
 */
export function SizingDriversTab() {
  const utils = trpc.useUtils();
  const { hasAccess } = useFinancialAccess();
  // includeInactive, so deactivated drivers stay visible and reactivatable.
  const { data: drivers = [], isLoading } = trpc.sizing.listDrivers.useQuery({ includeInactive: true });
  const { data: policy } = trpc.sizing.getPolicy.useQuery();
  const [ceiling, setCeiling] = useState('');
  const [creating, setCreating] = useState(false);

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
  const active = drivers.filter((d) => d.isActive);
  const inactive = drivers.filter((d) => !d.isActive);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <p className="max-w-xl text-[11px] leading-relaxed text-slate-400">
          The questions that genuinely change how much work an engagement is. Answering them in the
          estimate builder scales the catalog baseline. Changing a weight affects the next estimate
          scoped, never one already built.
        </p>
        {hasAccess && (
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-3 w-3" />
            New driver
          </Button>
        )}
      </div>

      {isLoading && <p className="px-1 text-[12px] text-slate-400">Loading…</p>}
      {!isLoading && drivers.length === 0 && (
        <p className="px-1 text-[12px] text-slate-400">No sizing drivers yet.</p>
      )}

      <div className="space-y-2">
        {active.map((d) => (
          <DriverEditor key={d.id} driver={d as unknown as Driver} canEdit={hasAccess} />
        ))}
      </div>

      {inactive.length > 0 && (
        <div>
          <h3 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400">
            Inactive
          </h3>
          <p className="mb-2 px-1 text-[11px] text-slate-400">
            Not asked on new estimates. Existing estimates keep the answers they were built with.
          </p>
          <div className="space-y-2">
            {inactive.map((d) => (
              <DriverEditor key={d.id} driver={d as unknown as Driver} canEdit={hasAccess} />
            ))}
          </div>
        </div>
      )}

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

      <NewDriverDialog
        open={creating}
        onOpenChange={setCreating}
        nextPosition={drivers.length + 1}
      />
    </div>
  );
}

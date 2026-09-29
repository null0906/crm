'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/formatters';

/**
 * What a standard engagement of this service ought to cost.
 *
 * Set by hand, because nothing in the system can derive it — the cost engine
 * computes what a particular team on particular hours costs, which is the thing
 * this is here to check. Multiplied by an estimate's scoping multiplier it
 * gives an expected figure to hold the engine's answer against, and a wide gap
 * says the hours, the team or the scoping answers disagree with each other.
 *
 * Rendered only for callers with financial access; the server nulls the value
 * for everyone else regardless of what this component decides to show.
 */
export function IdealCostCard({
  baselineId,
  idealCost,
  currency = 'INR',
}: {
  baselineId: string | null;
  idealCost: number | null;
  currency?: string;
}) {
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState<string | null>(null);

  // The card refetches after every save; pick up server state rather than
  // holding a stale copy on screen.
  useEffect(() => setDraft(null), [idealCost, baselineId]);

  const save = trpc.catalog.setIdealCost.useMutation({
    onSuccess: () => {
      toast.success('Ideal cost saved');
      setDraft(null);
      void utils.catalog.listBaselines.invalidate();
    },
    onError: (err) => toast.error('Could not save the ideal cost', { description: err.message }),
  });

  if (!baselineId) {
    return (
      <Card title="Ideal cost">
        <p className="text-[11px] leading-relaxed text-slate-400">
          There is no role checklist for this service line yet, and the ideal cost is stored
          alongside it. Add the roles below first.
        </p>
      </Card>
    );
  }

  const value = draft ?? (idealCost === null ? '' : String(idealCost));
  const parsed = value.trim() === '' ? null : Number(value);
  const valid = parsed === null || (Number.isFinite(parsed) && parsed >= 0);

  return (
    <Card title="Ideal cost">
      <p className="text-[11px] leading-relaxed text-slate-400">
        What a standard engagement of this service ought to cost to deliver. Estimates show this
        multiplied by their scoping multiplier beside what the cost engine computed. It benchmarks;
        it never sets a price.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="ideal-cost" className="text-[11px] text-slate-500">
            A standard (×1) engagement costs
          </label>
          <Input
            id="ideal-cost"
            type="number"
            min={0}
            step="any"
            value={value}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Not set"
            className="mt-1 h-8 w-40"
          />
        </div>
        {draft !== null && (
          <Button
            size="sm"
            disabled={!valid || save.isPending}
            onClick={() => save.mutate({ id: baselineId, idealCost: parsed })}
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        )}
        {idealCost !== null && draft === null && (
          <span className="pb-1.5 text-[11px] text-slate-400">
            {formatCurrency(idealCost, currency)} per standard engagement
          </span>
        )}
      </div>

      {idealCost === null && draft === null && (
        <p className="mt-2 text-[11px] text-slate-400">
          Nothing set, so estimates on this service line show no benchmark.
        </p>
      )}
    </Card>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_4px_rgba(16,24,40,0.04)]">
      <h3 className="mb-1 text-[12px] font-medium text-slate-700">{title}</h3>
      {children}
    </section>
  );
}

'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/formatters';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The support default (FR-P4-17).
 *
 * Support used to be a per-resource cost component, which meant it reached the
 * engagement total without ever appearing on screen. It is now seeded onto each
 * new estimate as an ordinary cost line, so an estimator can see the figure and
 * argue with it — a retainer carrying almost no admin and a first-of-its-kind
 * audit should not inherit the same overhead just because nobody looked.
 *
 * Charged per engagement, always. It was briefly settable per resource-hour;
 * that choice is gone because we do not price overhead that way, and a dropdown
 * with one real answer is only a chance to pick the wrong one.
 *
 * Saving writes a new version rather than editing in place, so estimates
 * already built keep the amount they were built with.
 */
export function SupportCostCard() {
  const utils = trpc.useUtils();
  const { data: policy } = trpc.costModel.getSupportPolicy.useQuery();
  const [amount, setAmount] = useState('');

  const save = trpc.costModel.setSupportPolicy.useMutation({
    onSuccess: () => {
      toast.success('Support cost updated', { description: 'Saved as a new version.' });
      setAmount('');
      void utils.costModel.getSupportPolicy.invalidate();
    },
    onError: (err) => toast.error('Could not update support cost', { description: err.message }),
  });

  const parsed = Number(amount);
  const valid = amount.trim() !== '' && Number.isFinite(parsed) && parsed >= 0;

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_4px_rgba(16,24,40,0.04)]">
      <h3 className="text-[12px] font-medium text-slate-700">Support &amp; overhead</h3>
      <p className="mt-0.5 max-w-xl text-[11px] leading-relaxed text-slate-400">
        The share of management, admin and internal function that delivery carries. Charged once
        per engagement and added to every new estimate as a cost line, where it can be adjusted or
        removed for one that genuinely differs. Existing estimates keep the figure they were built
        with.
      </p>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-[18px] font-semibold tabular-nums text-slate-900">
          {policy ? formatCurrency(Number(policy.amount)) : 'none set'}
        </span>
        {policy && <span className="text-[11px] text-slate-400">per engagement</span>}
      </div>

      {!policy && (
        <p className="mt-2 text-[11px] leading-relaxed text-amber-700">
          Nothing is configured, so new estimates carry no overhead at all and will understate
          cost by whatever support really costs you.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div>
          <Label htmlFor="support-amount" className="text-[11px]">
            New amount
          </Label>
          <Input
            id="support-amount"
            type="number"
            min={0}
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="125"
            className="mt-1 w-32"
          />
        </div>
        <Button
          size="sm"
          disabled={!valid || save.isPending}
          onClick={() =>
            save.mutate({
              name: policy?.name ?? 'Standard support',
              label: policy?.label ?? 'Support & overhead',
              amount: parsed,
              effectiveFrom: today(),
            })
          }
        >
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
        A flat amount: the same on a two-week review as on a six-month programme.
      </p>
    </div>
  );
}

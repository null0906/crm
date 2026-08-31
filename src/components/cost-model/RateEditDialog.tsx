'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/formatters';

export type CostComponent = 'base' | 'seat';

export const COMPONENT_LABEL: Record<CostComponent, string> = {
  base: 'Base cost',
  seat: 'Seat cost',
};

export const COMPONENT_HINT: Record<CostComponent, string> = {
  base: 'What this person is paid, per hour.',
  seat: 'Laptop, infrastructure and tooling for this person, per hour.',
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface RateTarget {
  /**
   * Employee for anything settable. Role and default remain in the union only
   * because closed historic rows carry them; nothing here writes one.
   */
  scope: 'default' | 'role' | 'employee';
  component: CostComponent;
  deliveryRoleId?: string | null;
  userId?: string | null;
  /** Shown in the heading — the person's name. */
  label: string;
  currentAmount: number | null;
  currentSince: string | null;
}

export function RateEditDialog({
  target,
  onClose,
}: {
  target: RateTarget | null;
  onClose: (changed: boolean) => void;
}) {
  const [amount, setAmount] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(today());
  const [showAdvanced, setShowAdvanced] = useState(false);

  React.useEffect(() => {
    if (target) {
      setAmount(target.currentAmount !== null ? String(target.currentAmount) : '');
      setEffectiveFrom(today());
      setShowAdvanced(false);
    }
  }, [target]);

  const setComponent = trpc.costModel.setComponent.useMutation({
    onSuccess: () => {
      toast.success('Rate updated', {
        description: 'The previous rate was closed, not overwritten.',
      });
      onClose(true);
    },
    onError: (err) => toast.error('Could not update the rate', { description: err.message }),
  });

  if (!target) return null;

  const parsed = Number(amount);
  const valid = amount.trim() !== '' && Number.isFinite(parsed) && parsed >= 0;

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose(false)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[14px]">
            {target.label} — {COMPONENT_LABEL[target.component].toLowerCase()}
          </DialogTitle>
          <DialogDescription className="text-[11px]">
            {COMPONENT_HINT[target.component]}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="rounded-lg bg-slate-50 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400">
              Current
            </p>
            {target.currentAmount === null ? (
              <p className="mt-0.5 text-[13px] text-slate-400">Not set</p>
            ) : (
              <>
                <p className="mt-0.5 text-[13px] font-medium text-slate-800">
                  {formatCurrency(target.currentAmount)} / hour
                </p>
                <p className="text-[11px] text-slate-400">
                  {target.currentSince ? `since ${target.currentSince}` : null}
                </p>
              </>
            )}
          </div>

          <div>
            <Label htmlFor="rate-amount" className="text-[11px]">
              New amount per hour
            </Label>
            <Input
              id="rate-amount"
              type="number"
              min={0}
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="mt-1"
              autoFocus
            />
            <p className="mt-1 text-[11px] text-slate-400">
              {effectiveFrom === today()
                ? 'Applies from today.'
                : `Applies from ${effectiveFrom}.`}{' '}
              Rates are never overwritten — the current one is closed and this becomes the standing
              rate, so older estimates still resolve the figure they were built on.
            </p>
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-700"
            >
              {showAdvanced ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              Advanced
            </button>
            {showAdvanced && (
              <div className="mt-2">
                <Label htmlFor="rate-from" className="text-[11px]">
                  Effective from
                </Label>
                <Input
                  id="rate-from"
                  type="date"
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                  className="mt-1"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Backdate a correction, or schedule an increase ahead of time.
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onClose(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!valid || setComponent.isPending}
            onClick={() =>
              setComponent.mutate({
                scope: target.scope,
                deliveryRoleId: target.scope === 'role' ? target.deliveryRoleId : null,
                userId: target.scope === 'employee' ? target.userId : null,
                component: target.component,
                amountPerHour: parsed,
                effectiveFrom,
              })
            }
          >
            {setComponent.isPending ? 'Saving…' : 'Save rate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

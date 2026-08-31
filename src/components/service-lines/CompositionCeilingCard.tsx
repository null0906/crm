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

/**
 * The cap on what scoping answers may compose to (FR-P4-10).
 *
 * Company-wide rather than per service line, which is why it sits below the
 * per-line cards rather than inside one: the ceiling is a statement about how
 * far anyone should trust a questionnaire, not about a particular service.
 *
 * A new ceiling is a new version, so an estimate scoped last year still
 * resolves the rules that applied to it.
 */
export function CompositionCeilingCard() {
  const utils = trpc.useUtils();
  const { hasAccess } = useFinancialAccess();
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
    <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_4px_rgba(16,24,40,0.04)]">
      <h3 className="text-[12px] font-medium text-slate-700">Composition ceiling</h3>
      <p className="mt-0.5 max-w-xl text-[11px] leading-relaxed text-slate-400">
        Applies to every service line. Questions compound, so a badly-answered questionnaire can
        produce an implausible multiplier. Anything above the ceiling is capped — and the estimate
        says so, rather than hiding it.
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
    </section>
  );
}

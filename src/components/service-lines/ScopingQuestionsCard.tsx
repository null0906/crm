'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { useFinancialAccess } from '@/components/shared/FinancialAccessGate';
import { DriverEditor, type Driver } from '@/components/effort-catalog/DriverEditor';
import { NewDriverDialog } from '@/components/effort-catalog/NewDriverDialog';

/**
 * The questions asked when scoping this service line.
 *
 * Shows the questions scoped to this line and the global ones, because a global
 * question genuinely is asked here — hiding it would make the page a lie about
 * what an estimator sees. Which is which is marked, and so is the consequence
 * of editing a global one.
 *
 * Weights mutate in place rather than being effective-dated like cost rates.
 * That is safe because every estimate stores the multiplier it actually used at
 * the moment its questionnaire was answered, so changing a weight today cannot
 * move an estimate made yesterday.
 */
export function ScopingQuestionsCard({ serviceLine }: { serviceLine: string }) {
  const { hasAccess } = useFinancialAccess();
  // includeInactive, so a deactivated question stays visible and reactivatable.
  const { data: drivers = [], isLoading } = trpc.sizing.listDrivers.useQuery({
    serviceLine,
    includeInactive: true,
  });
  const [creating, setCreating] = useState(false);

  const active = drivers.filter((d) => d.isActive);
  const inactive = drivers.filter((d) => !d.isActive);

  return (
    <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_4px_rgba(16,24,40,0.04)]">
      <div className="mb-2 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-[12px] font-medium text-slate-700">Scoping questions</h3>
          <p className="mt-0.5 max-w-xl text-[11px] leading-relaxed text-slate-400">
            What makes one of these engagements bigger or smaller than standard. Answering them
            produces a size multiplier and nothing else — hours and people are set on the estimate
            by whoever is staffing it.
          </p>
        </div>
        {hasAccess && (
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-3 w-3" />
            Add question
          </Button>
        )}
      </div>

      {isLoading && <p className="text-[11px] text-slate-400">Loading…</p>}
      {!isLoading && drivers.length === 0 && (
        <p className="text-[11px] leading-relaxed text-slate-400">
          No questions yet, so every engagement on this service line is sized as standard (×1).
        </p>
      )}

      <div className="space-y-2">
        {active.map((d) => (
          <DriverEditor
            key={d.id}
            driver={d as unknown as Driver}
            canEdit={hasAccess}
            serviceLine={serviceLine}
          />
        ))}
      </div>

      {inactive.length > 0 && (
        <div className="mt-3">
          <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400">
            Inactive
          </h4>
          <p className="mb-2 text-[11px] text-slate-400">
            Not asked on new estimates. Existing estimates keep the answers they were built with.
          </p>
          <div className="space-y-2">
            {inactive.map((d) => (
              <DriverEditor
                key={d.id}
                driver={d as unknown as Driver}
                canEdit={hasAccess}
                serviceLine={serviceLine}
              />
            ))}
          </div>
        </div>
      )}

      <NewDriverDialog
        open={creating}
        onOpenChange={setCreating}
        nextPosition={drivers.length + 1}
        serviceLine={serviceLine}
      />
    </section>
  );
}

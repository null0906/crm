'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
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
import { useFinancialAccess } from '@/components/shared/FinancialAccessGate';
import { ServiceLineIdentityCard } from './ServiceLineIdentityCard';
import { IdealCostCard } from './IdealCostCard';
import { ScopingQuestionsCard } from './ScopingQuestionsCard';
import { RoleChecklistCard, type ChecklistBaseline } from './RoleChecklistCard';
import { CompositionCeilingCard } from './CompositionCeilingCard';

/** A label typed by a human, turned into the slug that gets stored forever. */
function slugify(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
}

/**
 * Everything you configure for one service line, on one page.
 *
 * It used to be three places: the service list was a source constant needing a
 * deploy, the scoping questions were one tab of the effort catalog and the
 * baselines another. Setting up a new service meant a code change and two
 * screens, and nothing showed you what a given service was actually configured
 * with.
 *
 * The order of the cards is the order of an estimate: what it is called, what
 * it should cost, what makes one bigger, and who works on it.
 */
export function ServiceLinesSettings() {
  const { hasAccess } = useFinancialAccess();
  const utils = trpc.useUtils();

  const { data: lines = [], isLoading } = trpc.serviceLines.list.useQuery({
    includeInactive: true,
  });
  const { data: baselines = [] } = trpc.catalog.listBaselines.useQuery();

  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState('');

  const create = trpc.serviceLines.upsert.useMutation({
    onSuccess: (row) => {
      toast.success('Service line added');
      setCreating(false);
      setNewLabel('');
      if (row) setSelected(row.slug);
      void utils.serviceLines.list.invalidate();
    },
    onError: (e) => toast.error('Could not add it', { description: e.message }),
  });

  // Falls through to the first line rather than holding null, so the detail
  // pane is never empty on arrival.
  const active = selected ?? lines[0]?.slug ?? null;
  const current = lines.find((l) => l.slug === active) ?? null;

  // The newest active baseline is the one estimates resolve; listBaselines
  // already returns them newest version first within a service line.
  const currentBaseline = baselines.find((b) => b.serviceLine === active);
  const baseline = (currentBaseline as unknown as ChecklistBaseline | undefined) ?? null;
  // Null for a caller without the entitlement — the server redacts it there.
  const idealCost = (currentBaseline?.idealCost as number | null | undefined) ?? null;

  const newSlug = slugify(newLabel);
  const slugTaken = lines.some((l) => l.slug === newSlug);

  return (
    <div className="grid gap-5 lg:grid-cols-[200px_1fr]">
      {/* ---- the rail ---- */}
      <aside>
        <h2 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400">
          Service lines
        </h2>
        {isLoading && <p className="px-1 text-[11px] text-slate-400">Loading…</p>}
        <nav className="space-y-0.5">
          {lines.map((l) => (
            <button
              key={l.slug}
              type="button"
              onClick={() => setSelected(l.slug)}
              className={
                l.slug === active
                  ? 'w-full rounded-md bg-slate-100 px-2 py-1.5 text-left text-[12px] font-medium text-slate-800'
                  : 'w-full rounded-md px-2 py-1.5 text-left text-[12px] text-slate-500 hover:bg-slate-50'
              }
            >
              {l.label}
              {!l.isActive && <span className="ml-1 text-[10px] text-slate-300">retired</span>}
            </button>
          ))}
        </nav>
        {hasAccess && (
          <Button
            size="sm"
            variant="ghost"
            className="mt-1 w-full justify-start"
            onClick={() => setCreating(true)}
          >
            <Plus className="mr-1 h-3 w-3" />
            Add service line
          </Button>
        )}
      </aside>

      {/* ---- the detail ---- */}
      <div className="space-y-4">
        {!current && !isLoading && (
          <p className="text-[12px] text-slate-400">
            No service lines configured. Add one to start costing engagements against it.
          </p>
        )}

        {current && (
          <>
            <ServiceLineIdentityCard
              key={current.slug}
              slug={current.slug}
              label={current.label}
              isActive={current.isActive}
              canEdit={hasAccess}
              onDeactivated={() => setSelected(null)}
            />

            {/* Money, so it sits behind the entitlement. The server nulls the
                value regardless of what this decides to render. */}
            {hasAccess && (
              <IdealCostCard baselineId={baseline?.id ?? null} idealCost={idealCost} />
            )}

            <ScopingQuestionsCard serviceLine={current.slug} />

            <RoleChecklistCard serviceLine={current.slug} baseline={baseline} />
          </>
        )}

        <CompositionCeilingCard />
      </div>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[14px]">Add a service line</DialogTitle>
            <DialogDescription className="text-[11px]">
              Its scoping questions, role checklist and ideal cost are set up here once it exists.
            </DialogDescription>
          </DialogHeader>

          <div className="py-1">
            <Label htmlFor="sl-new" className="text-[11px]">
              Label
            </Label>
            <Input
              id="sl-new"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. HIPAA"
              className="mt-1"
              autoFocus
            />
            {newSlug && (
              <p className="mt-1.5 text-[11px] text-slate-400">
                Stored as <span className="font-mono text-slate-500">{newSlug}</span>. Fixed once
                created — every estimate and checklist references it.
              </p>
            )}
            {slugTaken && (
              <p className="mt-1 text-[11px] text-amber-700">
                A service line already stores that name.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={newSlug.length < 2 || slugTaken || create.isPending}
              onClick={() =>
                create.mutate({
                  slug: newSlug,
                  label: newLabel.trim(),
                  position: lines.length,
                  isActive: true,
                })
              }
            >
              {create.isPending ? 'Adding…' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

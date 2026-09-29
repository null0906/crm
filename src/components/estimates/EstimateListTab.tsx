'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Calculator, Lock, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { useServiceLines } from '@/lib/use-service-lines';

const STATUS_VARIANT = {
  draft: 'secondary',
  approved: 'success',
  superseded: 'outline',
  archived: 'outline',
} as const;

/**
 * Estimates for one prospect.
 *
 * Shown to everyone: a deal owner should be able to see that their deal has
 * been costed and whether it is approved. Cost and margin arrive nulled from
 * the server for anyone without financial access — `listForDeal` redacts, so
 * this component never decides what to hide.
 */
export function EstimateListTab({ dealId }: { dealId: string }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.estimates.listForDeal.useQuery({ dealId });
  const { active: activeServiceLines, label: serviceLineLabel } = useServiceLines({
    includeInactive: true,
  });
  const { data: baselines = [] } = trpc.catalog.listBaselines.useQuery();

  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [serviceLine, setServiceLine] = useState('');
  const [baselineId, setBaselineId] = useState('');
  const [deleting, setDeleting] = useState<{ id: string; title: string } | null>(null);

  const create = trpc.estimates.create.useMutation({
    onSuccess: (result) => {
      result.warnings.forEach((w) => toast.info(w));
      void utils.estimates.listForDeal.invalidate({ dealId });
      setCreating(false);
      router.push(`/deals/${dealId}/estimates/${result.id}`);
    },
    onError: (err) => toast.error('Could not create the estimate', { description: err.message }),
  });

  const remove = trpc.estimates.delete.useMutation({
    onSuccess: () => {
      toast.success('Estimate deleted');
      setDeleting(null);
      void utils.estimates.listForDeal.invalidate({ dealId });
    },
    onError: (err) => toast.error('Could not delete the estimate', { description: err.message }),
  });

  const estimates = data?.estimates ?? [];
  const canSeeFinancials = data?.canSeeFinancials ?? false;
  const matching = serviceLine
    ? baselines.filter((b) => b.serviceLine === serviceLine)
    : baselines;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <p className="max-w-xl text-[11px] leading-relaxed text-slate-400">
          What this engagement would cost to deliver, and what that means for the price.
        </p>
        {canSeeFinancials && (
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-3 w-3" />
            New estimate
          </Button>
        )}
      </div>

      {!canSeeFinancials && estimates.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2">
          <Lock className="mt-0.5 h-3 w-3 flex-shrink-0 text-slate-400" />
          <p className="text-[11px] leading-relaxed text-slate-500">
            Cost and margin are hidden — they need financial access. You can still see that this
            prospect has been costed and whether the estimate is approved.
          </p>
        </div>
      )}

      {isLoading && <p className="px-1 text-[12px] text-slate-400">Loading…</p>}

      {!isLoading && estimates.length === 0 && (
        <div className="rounded-xl border border-slate-200/80 bg-white px-6 py-10 text-center shadow-[0_1px_4px_rgba(16,24,40,0.04)]">
          <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100">
            <Calculator className="h-4 w-4 text-slate-400" strokeWidth={1.75} />
          </div>
          <p className="text-[13px] font-medium text-slate-800">No estimate yet</p>
          <p className="mx-auto mt-1 max-w-sm text-[11px] leading-relaxed text-slate-400">
            {canSeeFinancials
              ? 'Build one from a catalog baseline to see what this engagement costs before you price it.'
              : 'Nobody has costed this prospect yet.'}
          </p>
        </div>
      )}

      {estimates.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_4px_rgba(16,24,40,0.04)]">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Estimate</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">Cost</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">Price</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">Margin</th>
                {canSeeFinancials && <th className="w-12 px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {estimates.map((e) => (
                <tr
                  key={e.id}
                  onClick={() => router.push(`/deals/${dealId}/estimates/${e.id}`)}
                  className="group cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50/80"
                >
                  <td className="px-4 py-2.5">
                    <p className="text-[13px] text-slate-800">{e.title}</p>
                    <p className="text-[11px] text-slate-400">
                      {e.serviceLine ? `${serviceLineLabel(e.serviceLine)} · ` : ''}
                      {formatDate(e.createdAt)}
                    </p>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={STATUS_VARIANT[e.status as keyof typeof STATUS_VARIANT]}>
                      {e.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right text-[13px] tabular-nums text-slate-700">
                    {e.totalDeliveryCost === null ? (
                      <span className="text-slate-300">—</span>
                    ) : (
                      formatCurrency(e.totalDeliveryCost, e.currency)
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[13px] tabular-nums text-slate-700">
                    {e.price === null ? (
                      <span className="text-slate-300">—</span>
                    ) : (
                      formatCurrency(e.price, e.currency)
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[13px] tabular-nums text-slate-700">
                    {e.marginPercent === null ? (
                      <span className="text-slate-300">—</span>
                    ) : (
                      `${e.marginPercent}%`
                    )}
                  </td>
                  {canSeeFinancials && (
                    <td className="px-4 py-2.5 text-right">
                      {/* Only a draft can go: an approved estimate is the frozen
                          record of a decision, and the server refuses anyway. */}
                      {e.status === 'draft' && (
                        <button
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setDeleting({ id: e.id, title: e.title });
                          }}
                          className="rounded p-1 text-slate-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 focus:opacity-100"
                          title="Delete estimate"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[14px]">New estimate</DialogTitle>
            <DialogDescription className="text-[11px]">
              Starting from a baseline seeds the team shape. Without one you begin from a blank
              sheet.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div>
              <Label htmlFor="est-title" className="text-[11px]">
                Title
              </Label>
              <Input
                id="est-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. SOC 2 Type II — initial scope"
                className="mt-1"
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="est-service" className="text-[11px]">
                Service line
              </Label>
              <select
                id="est-service"
                value={serviceLine}
                onChange={(e) => {
                  setServiceLine(e.target.value);
                  setBaselineId('');
                }}
                className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-700"
              >
                <option value="">Not set</option>
                {activeServiceLines.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="est-baseline" className="text-[11px]">
                Baseline
              </Label>
              <select
                id="est-baseline"
                value={baselineId}
                onChange={(e) => setBaselineId(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-700"
              >
                <option value="">Start from a blank sheet</option>
                {matching.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} (v{b.version})
                  </option>
                ))}
              </select>
              {serviceLine && matching.length === 0 && (
                <p className="mt-1 text-[11px] text-amber-700">
                  No baseline exists for {serviceLineLabel(serviceLine)} yet.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={title.trim().length < 2 || create.isPending}
              onClick={() =>
                create.mutate({
                  dealId,
                  title: title.trim(),
                  serviceLine: serviceLine || null,
                  baselineId: baselineId || null,
                })
              }
            >
              {create.isPending ? 'Creating…' : 'Create & open'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete estimate?"
        description={
          deleting
            ? `${deleting.title} and its team shape, cost lines and sizing all go with it. This cannot be undone — duplicate it first if you want to keep the working.`
            : undefined
        }
        confirmLabel="Delete"
        destructive
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate({ id: deleting.id })}
      />
    </div>
  );
}

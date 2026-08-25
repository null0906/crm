'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ChevronLeft, Copy, Lock, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { formatCurrency, formatDateTime } from '@/lib/formatters';
import { ScopingQuestionnaire, type DriverAnswerDraft } from './ScopingQuestionnaire';
import { TeamShapeEditor, type TeamLineDraft } from './TeamShapeEditor';
import { CostLinesEditor, type CostLineDraft } from './CostLinesEditor';

const SCOPE_LABEL: Record<string, string> = {
  employee: 'this person',
  role: 'the role',
  default: 'company default',
};

export function EstimateBuilder({ dealId, estimateId }: { dealId: string; estimateId: string }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.estimates.getById.useQuery({ id: estimateId });

  const [price, setPrice] = useState<string | null>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);

  const refresh = () => {
    void utils.estimates.getById.invalidate({ id: estimateId });
    void utils.estimates.listForDeal.invalidate({ dealId });
  };
  const fail = (verb: string) => (err: { message: string }) =>
    toast.error(`Could not ${verb}`, { description: err.message });

  const updateDrivers = trpc.estimates.updateDrivers.useMutation({
    onSuccess: (r) => {
      r.warnings.forEach((w) => toast.info(w));
      toast.success('Team re-sized');
      refresh();
    },
    onError: fail('apply the scoping answers'),
  });
  const updateTeam = trpc.estimates.updateTeam.useMutation({
    onSuccess: () => { toast.success('Team saved'); refresh(); },
    onError: fail('save the team'),
  });
  const updateCostLines = trpc.estimates.updateCostLines.useMutation({
    onSuccess: () => { toast.success('Costs saved'); refresh(); },
    onError: fail('save the costs'),
  });
  const save = trpc.estimates.save.useMutation({
    onSuccess: () => { toast.success('Saved'); refresh(); },
    onError: fail('save'),
  });
  const approve = trpc.estimates.approve.useMutation({
    onSuccess: () => { toast.success('Estimate approved and frozen'); refresh(); },
    onError: fail('approve'),
  });
  const duplicate = trpc.estimates.duplicate.useMutation({
    onSuccess: (r) => router.push(`/deals/${dealId}/estimates/${r.id}`),
    onError: fail('duplicate'),
  });

  if (isLoading) return <p className="px-6 py-8 text-[12px] text-slate-400">Loading…</p>;

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100">
          <Lock className="h-4 w-4 text-slate-400" />
        </div>
        <p className="text-[13px] font-medium text-slate-800">Not available</p>
        <p className="mt-1 text-[11px] text-slate-400">{error.message}</p>
        <Link href={`/deals/${dealId}`} className="mt-4 inline-block text-[11px] text-blue-600">
          Back to the prospect
        </Link>
      </div>
    );
  }
  if (!data) return null;

  const { estimate, teamLines, costLines, drivers, breakdown, margin } = data;
  const readOnly = estimate.status !== 'draft';
  const currency = estimate.currency;
  const priceValue = price ?? (estimate.price ?? '');

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link
        href={`/deals/${dealId}`}
        className="mb-4 inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600"
      >
        <ChevronLeft className="h-3 w-3" />
        Back to prospect
      </Link>

      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[15px] font-semibold tracking-tight text-slate-900">
            {estimate.title}
          </h1>
          <p className="mt-0.5 text-xs text-slate-400">
            {estimate.serviceLine ? `${estimate.serviceLine} · ` : ''}
            rates as at {estimate.asOfDate}
            {estimate.baselineVersion ? ` · baseline v${estimate.baselineVersion}` : ''}
          </p>
        </div>
        <Badge variant={readOnly ? 'success' : 'secondary'}>{estimate.status}</Badge>
      </div>

      {readOnly && (
        <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-green-200 bg-green-50 px-3.5 py-3">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-green-600" />
          <div className="flex-1">
            <p className="text-[12px] font-medium text-green-900">This estimate is frozen</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-green-800">
              Approved {estimate.approvedAt ? formatDateTime(estimate.approvedAt) : ''}. The figures
              below are the ones that were approved and will not move even if rates change.
              Duplicate it to explore a different scenario.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={duplicate.isPending}
            onClick={() => duplicate.mutate({ id: estimateId, title: `${estimate.title} (copy)` })}
          >
            <Copy className="mr-1 h-3 w-3" />
            Duplicate
          </Button>
        </div>
      )}

      {breakdown.warnings.length > 0 && !readOnly && (
        <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
          <div>
            <p className="text-[12px] font-medium text-amber-900">This estimate is incomplete</p>
            <ul className="mt-1 space-y-0.5">
              {breakdown.warnings.map((w, i) => (
                <li key={i} className="text-[11px] leading-relaxed text-amber-800">
                  {w}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <ScopingQuestionnaire
          key={drivers.map((d) => d.id).join(',')}
          answers={drivers.map((d) => ({
            driverId: d.driverId,
            optionId: d.optionId,
            numericValue: d.numericValue === null ? null : Number(d.numericValue),
            source: d.source,
            answerConfidence: d.answerConfidence as 'low' | 'medium' | 'high' | null,
          }))}
          readOnly={readOnly}
          isApplying={updateDrivers.isPending}
          onApply={(answers: DriverAnswerDraft[]) =>
            updateDrivers.mutate({ id: estimateId, answers })
          }
        />

        <TeamShapeEditor
          lines={teamLines.map((l) => ({
            deliveryRoleId: l.deliveryRoleId,
            resourceCount: String(l.resourceCount),
            weeks: String(Number(l.weeks)),
          }))}
          readOnly={readOnly}
          isSaving={updateTeam.isPending}
          onSave={(lines: TeamLineDraft[]) =>
            updateTeam.mutate({
              id: estimateId,
              lines: lines.map((l) => ({
                deliveryRoleId: l.deliveryRoleId,
                resourceCount: Number(l.resourceCount),
                weeks: Number(l.weeks),
              })),
            })
          }
        />

        <CostLinesEditor
          lines={costLines.map((l) => ({
            kind: l.kind as 'non_labour' | 'custom',
            label: l.label,
            amount: String(Number(l.amount)),
            basis: l.basis as 'engagement' | 'per_resource_week',
            passThrough: l.passThrough,
          }))}
          readOnly={readOnly}
          isSaving={updateCostLines.isPending}
          onSave={(lines: CostLineDraft[]) =>
            updateCostLines.mutate({
              id: estimateId,
              lines: lines.map((l) => ({ ...l, amount: Number(l.amount) })),
            })
          }
        />

        {/* ---- cost breakdown ---- */}
        <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_4px_rgba(16,24,40,0.04)]">
          <h2 className="mb-3 text-[13px] font-medium text-slate-800">What it costs</h2>

          <table className="w-full">
            <tbody>
              {breakdown.resources.map((r, i) => (
                <tr key={i} className="border-b border-slate-50">
                  <td className="py-1.5">
                    <p className="text-[12px] text-slate-700">
                      {r.resourceCount} × {r.deliveryRoleName}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      base {formatCurrency(r.base, currency)} + seat{' '}
                      {formatCurrency(r.seat, currency)} + support{' '}
                      {formatCurrency(r.support, currency)}
                      {' · from '}
                      {SCOPE_LABEL[r.resolvedFrom.base.scope]}
                      {r.resolvedFrom.base.overridden ? ' (overridden)' : ''}
                    </p>
                  </td>
                  <td className="py-1.5 text-right text-[11px] tabular-nums text-slate-400">
                    {formatCurrency(r.loadedWeekly, currency)}/w × {r.weeks}w
                  </td>
                  <td className="w-32 py-1.5 text-right text-[12px] tabular-nums text-slate-700">
                    {formatCurrency(r.total, currency)}
                  </td>
                </tr>
              ))}
              <Row label="Labour" value={formatCurrency(breakdown.labourSubtotal, currency)} />
              {breakdown.nonLabourPassThrough > 0 && (
                <Row
                  label="Non-labour, pass-through"
                  hint="quoted at cost, earns no margin"
                  value={formatCurrency(breakdown.nonLabourPassThrough, currency)}
                />
              )}
              {breakdown.nonLabourMarkedUp > 0 && (
                <Row
                  label="Non-labour, marked up"
                  value={formatCurrency(breakdown.nonLabourMarkedUp, currency)}
                />
              )}
              {breakdown.customTotal !== 0 && (
                <Row label="Custom" value={formatCurrency(breakdown.customTotal, currency)} />
              )}
              <Row
                label={`GNR ${breakdown.gnr.ratePercent}%`}
                hint={`on ${breakdown.gnr.appliesTo === 'total' ? 'the total' : 'labour only'}`}
                value={formatCurrency(breakdown.gnr.gnrAmount, currency)}
              />
            </tbody>
          </table>

          <div className="mt-3 flex items-baseline justify-between border-t border-slate-200 pt-3">
            <span className="text-[12px] font-medium text-slate-700">Total delivery cost</span>
            <span className="text-[18px] font-semibold tabular-nums text-slate-900">
              {formatCurrency(breakdown.totalDeliveryCost, currency)}
            </span>
          </div>
        </section>

        {/* ---- price & margin ---- */}
        <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_4px_rgba(16,24,40,0.04)]">
          <h2 className="mb-1 text-[13px] font-medium text-slate-800">Price</h2>
          <p className="mb-3 text-[11px] text-slate-400">
            Cost sets the floor; the market sets the number. The target is guidance, not a rule.
          </p>

          <div className="flex flex-wrap items-end gap-4">
            <div>
              <Label htmlFor="price" className="text-[11px]">
                Quoted price
              </Label>
              <Input
                id="price"
                type="number"
                min={0}
                step="any"
                disabled={readOnly}
                value={priceValue}
                onChange={(e) => setPrice(e.target.value)}
                className="mt-1 w-40"
              />
            </div>
            {!readOnly && price !== null && (
              <Button
                size="sm"
                disabled={save.isPending}
                onClick={() => save.mutate({ id: estimateId, price: Number(price) })}
              >
                {save.isPending ? 'Saving…' : 'Save price'}
              </Button>
            )}

            {margin && (
              <div className="ml-auto text-right">
                <p
                  className={
                    margin.belowFloor
                      ? 'text-[20px] font-semibold tabular-nums text-red-600'
                      : 'text-[20px] font-semibold tabular-nums text-slate-900'
                  }
                >
                  {margin.marginPercent}%
                </p>
                <p className="text-[10px] text-slate-400">
                  margin · {formatCurrency(margin.marginAmount, currency)}
                </p>
              </div>
            )}
          </div>

          {margin?.belowFloor && (
            <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-red-600" />
              <p className="text-[11px] leading-relaxed text-red-800">
                This price is below the {margin.floorMarginPercent}% floor. If you need to come down
                further, consider removing scope rather than discounting — the same signed value is
                a very different engagement depending on which one you did.
              </p>
            </div>
          )}

          {margin && margin.suggestedPrice !== null && !margin.clearsTarget && !margin.belowFloor && (
            <p className="mt-2 text-[11px] text-slate-400">
              {formatCurrency(margin.suggestedPrice, currency)} would hit the target margin.
            </p>
          )}

          {!readOnly && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <Button
                size="sm"
                disabled={approve.isPending || !estimate.price}
                onClick={() => setConfirmApprove(true)}
              >
                Approve &amp; freeze
              </Button>
              <p className="mt-1.5 text-[11px] text-slate-400">
                {estimate.price
                  ? 'Freezes the basis permanently. It cannot be edited afterwards.'
                  : 'Set a price before approving.'}
              </p>
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={confirmApprove}
        onOpenChange={setConfirmApprove}
        title="Approve and freeze this estimate?"
        description="The team, costs, rates and price are frozen as they are now. This cannot be undone — to explore an alternative afterwards you duplicate the estimate instead."
        confirmLabel="Approve & freeze"
        onConfirm={() => {
          approve.mutate({ id: estimateId });
          setConfirmApprove(false);
        }}
      />
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <tr className="border-b border-slate-50">
      <td className="py-1.5" colSpan={2}>
        <span className="text-[12px] text-slate-600">{label}</span>
        {hint && <span className="ml-1.5 text-[10px] text-slate-400">{hint}</span>}
      </td>
      <td className="py-1.5 text-right text-[12px] tabular-nums text-slate-700">{value}</td>
    </tr>
  );
}

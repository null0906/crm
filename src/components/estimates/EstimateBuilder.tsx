'use client';

import { useMemo, useState } from 'react';
import { useAutosave } from '@/hooks/useAutosave';
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
import { useServiceLines } from '@/lib/use-service-lines';
import { SaveStatus } from './SaveStatus';
import { ScopingQuestionnaire, type DriverAnswerDraft } from './ScopingQuestionnaire';
import { TeamShapeEditor, type TeamLineDraft } from './TeamShapeEditor';
import { CostLinesEditor, type CostLineDraft } from './CostLinesEditor';

/**
 * Where a resolved rate came from.
 *
 * Only `employee` is reachable for a rate that actually resolved — role and
 * default rates were retired when cost moved to people. They stay listed
 * because an approved estimate's frozen snapshot can still carry them, and a
 * historic breakdown should read as what it was, not as a blank.
 */
const SCOPE_LABEL: Record<string, string> = {
  employee: 'their own rate',
  role: 'a role average (historic)',
  default: 'the company default (historic)',
};

export function EstimateBuilder({ dealId, estimateId }: { dealId: string; estimateId: string }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.estimates.getById.useQuery({ id: estimateId });
  const { label: serviceLineLabel } = useServiceLines({ includeInactive: true });

  const [price, setPrice] = useState<string | null>(null);
  const [gnrRate, setGnrRate] = useState<string | null>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);

  const refresh = () => {
    void utils.estimates.getById.invalidate({ id: estimateId });
    void utils.estimates.listForDeal.invalidate({ dealId });
  };
  const fail = (verb: string) => (err: { message: string }) =>
    toast.error(`Could not ${verb}`, { description: err.message });

  // No success toasts on the panels that save themselves: at a two-second
  // cadence they would be constant. The inline status carries it instead.
  // Every onError stays — a write that silently did not happen to a financial
  // record is the one outcome nobody may miss, and the status pill is too quiet
  // to carry that alone.
  const updateDrivers = trpc.estimates.updateDrivers.useMutation({
    onSuccess: (r) => {
      r.warnings.forEach((w) => toast.info(w));
      refresh();
    },
    onError: fail('save the scoping answers'),
  });
  const seedRoles = trpc.estimates.seedRolesFromBaseline.useMutation({
    onSuccess: (r) => {
      r.warnings.forEach((w) => toast.info(w));
      toast.success(
        r.added === 0
          ? 'The team already has every role the baseline suggests'
          : r.added === 1
            ? 'One role added, with no hours'
            : `${r.added} roles added, with no hours`
      );
      refresh();
    },
    onError: fail('seed the roles'),
  });
  const updateTeam = trpc.estimates.updateTeam.useMutation({
    onSuccess: () => refresh(),
    onError: fail('save the team'),
  });
  const updateCostLines = trpc.estimates.updateCostLines.useMutation({
    onSuccess: () => refresh(),
    onError: fail('save the costs'),
  });
  const save = trpc.estimates.save.useMutation({
    onSuccess: () => { setGnrRate(null); refresh(); },
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

  const { estimate, teamLines, costLines, drivers, breakdown, margin, benchmark } = data;
  const readOnly = estimate.status !== 'draft';
  const currency = estimate.currency;
  const priceDraft = price ?? (estimate.price ?? '');
  const gnrDraft = gnrRate ?? (estimate.gnrRateOverride ?? '');

  // Cost is worked out per person, so a line naming nobody contributes nothing
  // and makes the total quietly too low. Fine while drafting; not something to
  // freeze. The server refuses it too — this only saves the round trip and
  // explains why the button is off.
  const unstaffed = teamLines.filter((l) => !l.userId).length;

  /**
   * Memoised because the editors below reset their draft when this prop's
   * identity changes. Mapped inline it was a new array on every render, so
   * typing a character in the price box discarded unsaved team edits — and with
   * edits now saving themselves, every save would land on the next keystroke.
   */
  const priceAutosave = useAutosave({
    value: priceDraft,
    serialise: (v) => v.trim(),
    // Blank is not "free" -- it is nobody having decided, which the estimate
    // already represents as null. A half-typed number waits.
    isValid: (v) => v.trim() === '' || (Number.isFinite(Number(v)) && Number(v) >= 0),
    enabled: !readOnly,
    isSaving: save.isPending,
    isError: save.isError,
    onSave: (v) =>
      save.mutate({ id: estimateId, price: v.trim() === '' ? null : Number(v) }),
  });

  const gnrAutosave = useAutosave({
    value: gnrDraft,
    serialise: (v) => v.trim(),
    isValid: (v) =>
      v.trim() === '' || (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 100),
    enabled: !readOnly && !estimate.gnrExcluded,
    isSaving: save.isPending,
    isError: save.isError,
    // Empty clears the override and falls back to the effective policy.
    onSave: (v) =>
      save.mutate({ id: estimateId, gnrRateOverride: v.trim() === '' ? null : Number(v) }),
  });

  const teamDraftLines = useMemo(
    () =>
      teamLines.map((l) => ({
        deliveryRoleId: l.deliveryRoleId,
        userId: l.userId ?? '',
        resourceCount: String(l.resourceCount),
        // Blank, not '0': the role is on the sheet precisely because how long it
        // is needed for has not been decided.
        hours: l.hours === null ? '' : String(Number(l.hours)),
      })),
    [teamLines]
  );

  const costDraftLines = useMemo(
    () =>
      costLines.map((l) => ({
        kind: l.kind as 'non_labour' | 'custom',
        label: l.label,
        amount: String(Number(l.amount)),
        passThrough: l.passThrough,
      })),
    [costLines]
  );

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
            {estimate.serviceLine ? `${serviceLineLabel(estimate.serviceLine)} · ` : ''}
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
          serviceLine={estimate.serviceLine}
          readOnly={readOnly}
          isApplying={updateDrivers.isPending}
          isError={updateDrivers.isError}
          onApply={(answers: DriverAnswerDraft[]) =>
            updateDrivers.mutate({ id: estimateId, answers })
          }
        />

        <TeamShapeEditor
          lines={teamDraftLines}
          readOnly={readOnly}
          isSaving={updateTeam.isPending}
          isError={updateTeam.isError}
          isErrorEngagement={save.isError}
          onSave={(lines: TeamLineDraft[]) =>
            updateTeam.mutate({
              id: estimateId,
              lines: lines.map((l) => ({
                deliveryRoleId: l.deliveryRoleId,
                // Empty string clears the person and returns the line to the
                // role average; the server takes null for that.
                userId: l.userId || null,
                resourceCount: Number(l.resourceCount),
                hours: l.hours.trim() === '' ? null : Number(l.hours),
              })),
            })
          }
          engagementWeeks={estimate.engagementWeeks === null ? null : Number(estimate.engagementWeeks)}
          engagementHours={estimate.engagementHours === null ? null : Number(estimate.engagementHours)}
          isSavingEngagement={save.isPending}
          onSaveEngagement={({ weeks, hours }) =>
            save.mutate({ id: estimateId, engagementWeeks: weeks, engagementHours: hours })
          }
          hasBaseline={estimate.baselineId !== null}
          isSeeding={seedRoles.isPending}
          onSeedRoles={() => seedRoles.mutate({ id: estimateId })}
        />

        <CostLinesEditor
          lines={costDraftLines}
          readOnly={readOnly}
          isSaving={updateCostLines.isPending}
          isError={updateCostLines.isError}
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
                    {/* Cost belongs to a person, so an unnamed line has no rate
                        to explain — saying "company default" would name a
                        fallback that no longer exists and read as a real
                        figure. */}
                    {r.userId ? (
                      <p className="text-[10px] text-slate-400">
                        base {formatCurrency(r.base, currency)}
                        {' + seat '}
                        {formatCurrency(r.seat, currency)}
                        {' · from '}
                        {r.resolvedFrom.base.overridden
                          ? 'a figure set on this estimate'
                          : SCOPE_LABEL[r.resolvedFrom.base.scope]}
                      </p>
                    ) : (
                      <p className="text-[10px] text-amber-600">
                        nobody named, so this line costs nothing
                      </p>
                    )}
                  </td>
                  <td className="py-1.5 text-right text-[11px] tabular-nums text-slate-400">
                    {formatCurrency(r.loadedHourly, currency)}/h × {r.hours}h
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
                label={estimate.gnrExcluded ? 'GNR — excluded' : `GNR ${breakdown.gnr.ratePercent}%`}
                hint={
                  estimate.gnrExcluded
                    ? 'not charged on this engagement'
                    : `on ${breakdown.gnr.appliesTo === 'total' ? 'the total' : 'labour only'}${
                        breakdown.gnr.isOverride ? ' · set on this estimate' : ''
                      }`
                }
                value={formatCurrency(breakdown.gnr.gnrAmount, currency)}
              />
            </tbody>
          </table>

          {!readOnly && (
            <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
              <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
                <input
                  type="checkbox"
                  checked={!estimate.gnrExcluded}
                  onChange={(e) =>
                    save.mutate({ id: estimateId, gnrExcluded: !e.target.checked })
                  }
                />
                Charge GNR
              </label>
              {!estimate.gnrExcluded && (
                <>
                  <div>
                    <Label htmlFor="gnr-rate" className="text-[11px]">
                      Rate for this engagement
                    </Label>
                    <Input
                      id="gnr-rate"
                      type="number"
                      min={0}
                      max={100}
                      step="any"
                      className="mt-1 h-8 w-24"
                      placeholder={String(breakdown.gnr.ratePercent)}
                      value={gnrDraft}
                      onChange={(e) => setGnrRate(e.target.value)}
                    />
                  </div>
                  {gnrDraft !== '' && (
                    <button
                      type="button"
                      onClick={() => setGnrRate('')}
                      className="pb-1.5 text-[11px] text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline"
                    >
                      use the standard rate
                    </button>
                  )}
                </>
              )}
              <p className="w-full text-[10px] leading-relaxed text-slate-400">
                {estimate.gnrExcluded
                  ? 'Nothing is added for bench time, rework or unbilled admin. The cost below is what this engagement bills for, not what it costs to run.'
                  : 'Applies to this estimate only. Leave the rate empty to follow the standard policy; changing the policy itself is in Settings under Cost Model.'}
              </p>
            </div>
          )}

          <div className="mt-3 flex items-baseline justify-between border-t border-slate-200 pt-3">
            <span className="text-[12px] font-medium text-slate-700">Total delivery cost</span>
            <span className="text-[18px] font-semibold tabular-nums text-slate-900">
              {formatCurrency(breakdown.totalDeliveryCost, currency)}
            </span>
          </div>

          {/* The benchmark reports, it does not price. A wide gap means the
              hours, the team or the scoping answers disagree with each other,
              and which of them is wrong is not something this can know. */}
          {benchmark ? (
            <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-slate-100 pt-2">
              <span className="text-[11px] text-slate-400">
                A standard one costs {formatCurrency(benchmark.idealCost, currency)}, and this
                scopes at ×{benchmark.multiplier} —{' '}
                {formatCurrency(benchmark.expectedCost, currency)} expected
              </span>
              <span
                className={
                  Math.abs(benchmark.deltaPercent) >= 25
                    ? 'text-[11px] font-medium tabular-nums text-amber-700'
                    : 'text-[11px] tabular-nums text-slate-400'
                }
              >
                {benchmark.deltaPercent === 0
                  ? 'on the benchmark'
                  : `${Math.abs(benchmark.deltaPercent)}% ${benchmark.deltaPercent > 0 ? 'over' : 'under'}`}
              </span>
            </div>
          ) : (
            <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] text-slate-300">
              No ideal cost is set on this baseline, so there is nothing to compare against.
            </p>
          )}
        </section>

        {/* ---- price & margin ---- */}
        <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_4px_rgba(16,24,40,0.04)]">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <h2 className="text-[13px] font-medium text-slate-800">Price</h2>
            <SaveStatus
              status={priceAutosave.status !== 'idle' ? priceAutosave.status : gnrAutosave.status}
            />
          </div>
          <p className="mb-3 text-[11px] text-slate-400">
            Cost sets the floor; the market sets the number. The target is guidance, not a rule.
            Changes save themselves.
          </p>

          {/* Shown before a price is entered, not after — it is what you price
              against, so waiting for the price defeats it. This is a COST, not a
              price: the baseline figure scaled by the scoping multiplier, with
              no margin in it. Labelled as one, because a cost sitting beside a
              price box gets read as a price unless it says otherwise. */}
          {benchmark && (
            <div className="mb-3 rounded-lg bg-slate-50/80 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400">
                Ideal cost for this size
              </p>
              <p className="mt-0.5 text-[18px] font-semibold tabular-nums text-slate-900">
                {formatCurrency(benchmark.expectedCost, currency)}
              </p>
              <p className="text-[11px] leading-relaxed text-slate-400">
                {formatCurrency(benchmark.idealCost, currency)} for a standard one, × the
                {' '}×{benchmark.multiplier} this scopes at. What you charge on top is the margin
                below.
              </p>
            </div>
          )}

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
                value={priceDraft}
                onChange={(e) => setPrice(e.target.value)}
                className="mt-1 w-40"
              />
            </div>

            {margin && (
              <div className="ml-auto text-right">
                <p
                  className={
                    // A negative margin is a loss whether or not anyone has
                    // configured a floor, so it does not wait for one to turn red.
                    margin.belowFloor || margin.marginPercent < 0
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
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
              {formatCurrency(margin.suggestedPrice, currency)} would hit the target margin on what
              this engagement actually costs
              {benchmark && ` (${formatCurrency(breakdown.totalDeliveryCost, currency)}, against the ${formatCurrency(benchmark.expectedCost, currency)} above)`}
              .
            </p>
          )}

          {!readOnly && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <Button
                size="sm"
                disabled={approve.isPending || !estimate.price || unstaffed > 0}
                onClick={() => setConfirmApprove(true)}
              >
                Approve &amp; freeze
              </Button>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
                {unstaffed > 0
                  ? `${unstaffed === 1 ? 'One line names' : `${unstaffed} lines name`} nobody, so ${
                      unstaffed === 1 ? 'it costs' : 'they cost'
                    } nothing. Cost is worked out per person — name who will do the work before approving.`
                  : estimate.price
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

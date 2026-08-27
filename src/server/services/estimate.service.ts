import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { db as defaultDb } from '@/server/db';
import {
  estimateCostLines,
  estimateDrivers,
  estimateTeamLines,
  estimates,
  supportCostPolicies,
} from '@/server/db/schema';
import {
  computeCost,
  computeMargin,
  resolveMarginTarget,
  type CostBreakdown,
} from './cost-engine.service';
import { applyBaseline, composeMultiplier, type DriverAnswer } from './sizing.service';

type DbClient = typeof defaultDb;

/** Thrown when a write is attempted against an estimate that is no longer a draft. */
export class EstimateFrozenError extends Error {
  readonly code = 'ESTIMATE_FROZEN';
  constructor(status: string) {
    super(
      `This estimate is ${status} and cannot be changed. Duplicate it to explore a different scenario.`
    );
    this.name = 'EstimateFrozenError';
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function num(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** The widest value estimates.margin_percent can hold — numeric(9, 2). */
const MARGIN_PERCENT_LIMIT = 9_999_999.99;

/**
 * Bounds the stored margin to what the column can hold.
 *
 * Margin on price is unbounded below — quoting 0.01 against a cost of 832,600
 * is -8,325,999,900%. Widening the column alone cannot fix that, and an
 * overflow here does not merely fail to save the margin: it rejects the whole
 * UPDATE, which strands the estimate because every mutation calls persistTotals.
 *
 * Clamping the stored copy loses nothing. This column is a denormalised
 * convenience for the list and comparison views; `recalculate` returns the
 * exact figure from `computeMargin` on every read, so the builder still shows
 * the true number. Do not push this clamp down into computeMargin, which is the
 * source of truth for `belowFloor` and everything on screen.
 */
function clampStoredMargin(marginPercent: number): number {
  if (!Number.isFinite(marginPercent)) return 0;
  return Math.max(-MARGIN_PERCENT_LIMIT, Math.min(MARGIN_PERCENT_LIMIT, marginPercent));
}

/**
 * The immutability control (FR-P4-47, NFR-AUD-04).
 *
 * Every mutating path calls this first. Enforced in the service rather than the
 * UI, and backed by estimate_approved_is_frozen_check in the database — an
 * estimate that could be edited after approval would destroy the only signal
 * that tells you the estimates were wrong.
 */
async function assertDraft(estimateId: string, db: DbClient): Promise<void> {
  const [row] = await db
    .select({ status: estimates.status })
    .from(estimates)
    .where(eq(estimates.id, estimateId))
    .limit(1);
  if (!row) throw new Error('Estimate not found.');
  if (row.status !== 'draft') throw new EstimateFrozenError(row.status);
}

export interface CreateEstimateInput {
  dealId?: string | null;
  companyId?: string | null;
  title: string;
  serviceLine?: string | null;
  baselineId?: string | null;
  asOfDate?: string;
  currency?: string;
  ownerId?: string | null;
  createdBy: string;
}

/**
 * Resolves the support default effective on a date.
 *
 * Support used to be a per-resource cost component, which meant it reached the
 * total without anyone seeing it. It is now seeded as an ordinary cost line so
 * an estimator can see the figure and adjust it for an engagement that really
 * does carry more or less overhead than usual.
 */
async function resolveSupportPolicy(asOf: string, db: DbClient) {
  const [policy] = await db
    .select()
    .from(supportCostPolicies)
    .where(
      and(
        lte(supportCostPolicies.effectiveFrom, asOf),
        or(
          isNull(supportCostPolicies.effectiveTo),
          sql`${supportCostPolicies.effectiveTo} >= ${asOf}`
        )
      )
    )
    .orderBy(sql`${supportCostPolicies.effectiveFrom} DESC`, sql`${supportCostPolicies.version} DESC`)
    .limit(1);
  return policy ?? null;
}

/**
 * Creates a draft. When a baseline is given the team shape is seeded from it,
 * otherwise the estimator starts from an empty sheet. Either way the support
 * line is seeded, so overhead is on the estimate from the start rather than
 * remembered by whoever happens to be building it.
 */
export async function createEstimate(
  input: CreateEstimateInput,
  db: DbClient = defaultDb
): Promise<{ id: string; warnings: string[] }> {
  const asOfDate = input.asOfDate ?? today();
  const warnings: string[] = [];

  return db.transaction(async (tx) => {
    let baselineVersion: number | null = null;
    let seededLines: Awaited<ReturnType<typeof applyBaseline>>['lines'] = [];

    if (input.baselineId) {
      const sized = await applyBaseline(
        input.baselineId,
        { hoursMultiplier: 1, teamMultiplier: 1 },
        tx as unknown as DbClient
      );
      baselineVersion = sized.baselineVersion;
      seededLines = sized.lines;
      warnings.push(...sized.warnings);
    }

    const [created] = await tx
      .insert(estimates)
      .values({
        dealId: input.dealId ?? null,
        companyId: input.companyId ?? null,
        title: input.title,
        serviceLine: input.serviceLine ?? null,
        baselineId: input.baselineId ?? null,
        baselineVersion,
        asOfDate,
        currency: input.currency ?? 'INR',
        ownerId: input.ownerId ?? input.createdBy,
        createdBy: input.createdBy,
      })
      .returning();

    if (seededLines.length) {
      await tx.insert(estimateTeamLines).values(
        seededLines.map((line) => ({
          estimateId: created!.id,
          deliveryRoleId: line.deliveryRoleId,
          deliveryStage: line.deliveryStage,
          resourceCount: line.resourceCount,
          hours: line.hours.toString(),
          position: line.position,
        }))
      );
    }

    const support = await resolveSupportPolicy(asOfDate, tx as unknown as DbClient);
    if (support) {
      await tx.insert(estimateCostLines).values({
        estimateId: created!.id,
        kind: 'custom',
        label: support.label,
        amount: support.amount,
        basis: support.basis,
        // Overhead is ours, not the client's disbursement, so it is never
        // quoted at cost the way a pass-through line is.
        passThrough: false,
        position: 0,
      });
    } else {
      warnings.push(
        'No support cost is configured, so nothing was added for overhead. Set one in Settings under Cost Model.'
      );
    }

    return { id: created!.id, warnings };
  });
}

export interface EstimateDetail {
  estimate: typeof estimates.$inferSelect;
  teamLines: (typeof estimateTeamLines.$inferSelect)[];
  costLines: (typeof estimateCostLines.$inferSelect)[];
  drivers: (typeof estimateDrivers.$inferSelect)[];
}

export async function getEstimateDetail(
  estimateId: string,
  db: DbClient = defaultDb
): Promise<EstimateDetail | null> {
  const [estimate] = await db.select().from(estimates).where(eq(estimates.id, estimateId)).limit(1);
  if (!estimate) return null;

  // Sequential, not Promise.all: `db` here may be a transaction client, which is
  // a single connection. Concurrent queries on one connection are deprecated in
  // node-postgres and break outright in pg@9. These are three small indexed
  // lookups, so the extra round trips cost nothing worth having a footgun for.
  const teamLines = await db
    .select()
    .from(estimateTeamLines)
    .where(eq(estimateTeamLines.estimateId, estimateId))
    .orderBy(asc(estimateTeamLines.position));
  const costLines = await db
    .select()
    .from(estimateCostLines)
    .where(eq(estimateCostLines.estimateId, estimateId))
    .orderBy(asc(estimateCostLines.position));
  const drivers = await db
    .select()
    .from(estimateDrivers)
    .where(eq(estimateDrivers.estimateId, estimateId))
    .orderBy(asc(estimateDrivers.position));

  return { estimate, teamLines, costLines, drivers };
}

/**
 * Margin for an estimate, using its own frozen target where it has one and
 * otherwise the configured target for its service line. The floor is always
 * resolved live — it is a warning threshold, not part of the frozen basis.
 */
async function marginFor(
  estimate: typeof estimates.$inferSelect,
  totalDeliveryCost: number,
  db: DbClient
) {
  const price = num(estimate.price);
  if (price === null) return null;

  const configured = await resolveMarginTarget(estimate.serviceLine, estimate.asOfDate, db);
  const target = num(estimate.targetMarginPercent) ?? configured?.targetMarginPercent ?? null;
  return computeMargin(totalDeliveryCost, price, target, configured?.floorMarginPercent ?? null);
}

/**
 * Recomputes without saving.
 *
 * An approved estimate returns its frozen snapshot instead of recomputing, so
 * what you see is what was approved even after rates have moved on.
 */
export async function recalculate(
  estimateId: string,
  db: DbClient = defaultDb
): Promise<{ breakdown: CostBreakdown; margin: ReturnType<typeof computeMargin> | null }> {
  const detail = await getEstimateDetail(estimateId, db);
  if (!detail) throw new Error('Estimate not found.');
  const { estimate, teamLines, costLines } = detail;

  if (estimate.status !== 'draft' && estimate.snapshot) {
    const breakdown = estimate.snapshot as CostBreakdown;
    return { breakdown, margin: await marginFor(estimate, breakdown.totalDeliveryCost, db) };
  }

  const breakdown = await computeCost(
    {
      team: teamLines.map((line) => ({
        deliveryRoleId: line.deliveryRoleId,
        // Whether a line is costed against a named person or role averages is a
        // property of the line, not of the estimate: the lead is usually known
        // long before the analysts are. A line with nobody named resolves the
        // role rate, which is exactly what the old estimate-wide 'blended' mode
        // did, so nothing is lost by deciding it per line.
        userId: line.userId,
        hours: Number(line.hours),
        resourceCount: line.resourceCount,
        overrides: {
          ...(line.overrideBase !== null ? { base: Number(line.overrideBase) } : {}),
          ...(line.overrideSeat !== null ? { seat: Number(line.overrideSeat) } : {}),
        },
      })),
      nonLabour: costLines
        .filter((l) => l.kind === 'non_labour')
        .map((l) => ({ label: l.label, amount: Number(l.amount), passThrough: l.passThrough })),
      customLines: costLines
        .filter((l) => l.kind === 'custom')
        .map((l) => ({
          label: l.label,
          amount: Number(l.amount),
          basis: l.basis,
          passThrough: l.passThrough,
        })),
      asOf: estimate.asOfDate,
      gnrPolicyId: estimate.gnrPolicyId,
      // Excluding GNR is a rate of zero the estimator chose; the flag is what
      // distinguishes it from a zero that means no policy was ever configured.
      gnrRatePercentOverride: estimate.gnrExcluded ? 0 : num(estimate.gnrRateOverride),
      currency: estimate.currency,
    },
    db
  );

  return { breakdown, margin: await marginFor(estimate, breakdown.totalDeliveryCost, db) };
}

/** Recomputes and writes the totals back onto the draft. */
export async function persistTotals(
  estimateId: string,
  db: DbClient = defaultDb
): Promise<CostBreakdown> {
  await assertDraft(estimateId, db);
  const { breakdown, margin } = await recalculate(estimateId, db);

  await db
    .update(estimates)
    .set({
      labourSubtotal: breakdown.labourSubtotal.toString(),
      nonLabourPassThrough: breakdown.nonLabourPassThrough.toString(),
      nonLabourMarkedUp: breakdown.nonLabourMarkedUp.toString(),
      customTotal: breakdown.customTotal.toString(),
      subtotalBeforeGnr: breakdown.subtotalBeforeGnr.toString(),
      gnrAmount: breakdown.gnr.gnrAmount.toString(),
      totalDeliveryCost: breakdown.totalDeliveryCost.toString(),
      gnrPolicyId: breakdown.gnr.policyId,
      gnrRatePercent: breakdown.gnr.ratePercent.toString(),
      gnrAppliesTo: breakdown.gnr.appliesTo,
      marginPercent: margin ? clampStoredMargin(margin.marginPercent).toString() : null,
      updatedAt: new Date(),
    })
    .where(eq(estimates.id, estimateId));

  return breakdown;
}

export async function replaceTeamLines(
  estimateId: string,
  lines: {
    deliveryRoleId: string;
    userId?: string | null;
    deliveryStage?: string | null;
    resourceCount: number;
    hours: number;
    overrideBase?: number | null;
    overrideSeat?: number | null;
  }[],
  db: DbClient = defaultDb
): Promise<void> {
  await assertDraft(estimateId, db);
  await db.transaction(async (tx) => {
    await tx.delete(estimateTeamLines).where(eq(estimateTeamLines.estimateId, estimateId));
    if (lines.length) {
      await tx.insert(estimateTeamLines).values(
        lines.map((line, i) => ({
          estimateId,
          deliveryRoleId: line.deliveryRoleId,
          userId: line.userId ?? null,
          deliveryStage: line.deliveryStage ?? null,
          resourceCount: line.resourceCount,
          hours: line.hours.toString(),
          overrideBase: line.overrideBase?.toString() ?? null,
          overrideSeat: line.overrideSeat?.toString() ?? null,
          position: i,
        }))
      );
    }
  });
  await persistTotals(estimateId, db);
}

export async function replaceCostLines(
  estimateId: string,
  lines: {
    kind: 'non_labour' | 'custom';
    label: string;
    amount: number;
    basis: 'engagement' | 'per_resource_hour';
    passThrough: boolean;
  }[],
  db: DbClient = defaultDb
): Promise<void> {
  await assertDraft(estimateId, db);
  await db.transaction(async (tx) => {
    await tx.delete(estimateCostLines).where(eq(estimateCostLines.estimateId, estimateId));
    if (lines.length) {
      await tx.insert(estimateCostLines).values(
        lines.map((line, i) => ({
          estimateId,
          kind: line.kind,
          label: line.label,
          amount: line.amount.toString(),
          basis: line.basis,
          passThrough: line.passThrough,
          position: i,
        }))
      );
    }
  });
  await persistTotals(estimateId, db);
}

/**
 * Records driver answers, recomposes the multiplier and re-sizes the team from
 * the baseline (FR-P4-11, FR-P4-13).
 *
 * Re-sizing replaces the team shape, so manual edits made after the last
 * questionnaire change are lost — the caller should warn before doing it.
 */
export async function applyDriverAnswers(
  estimateId: string,
  answers: DriverAnswer[],
  db: DbClient = defaultDb
): Promise<{ multiplier: number; warnings: string[] }> {
  await assertDraft(estimateId, db);
  const detail = await getEstimateDetail(estimateId, db);
  if (!detail) throw new Error('Estimate not found.');

  const sizing = await composeMultiplier(answers, detail.estimate.asOfDate, db);
  const warnings = [...sizing.warnings];

  await db.transaction(async (tx) => {
    await tx.delete(estimateDrivers).where(eq(estimateDrivers.estimateId, estimateId));
    if (answers.length) {
      const byDriver = new Map(sizing.contributions.map((c) => [c.driverId, c]));
      const rows = answers
        .filter((a) => byDriver.has(a.driverId))
        .map((a, i) => ({
          estimateId,
          driverId: a.driverId,
          optionId: a.optionId ?? null,
          numericValue: a.numericValue?.toString() ?? null,
          multiplierApplied: byDriver.get(a.driverId)!.multiplier.toString(),
          source: a.source ?? null,
          answerConfidence: a.answerConfidence ?? null,
          position: i,
        }));
      if (rows.length) await tx.insert(estimateDrivers).values(rows);
    }

    await tx
      .update(estimates)
      .set({
        sizeMultiplier: sizing.multiplier.toString(),
        sizingPolicyId: sizing.policyId,
        updatedAt: new Date(),
      })
      .where(eq(estimates.id, estimateId));
  });

  if (detail.estimate.baselineId) {
    const sized = await applyBaseline(detail.estimate.baselineId, sizing, db);
    warnings.push(...sized.warnings);

    // Re-sizing regenerates the team from the baseline, which cannot know who
    // was on it. Say so: names disappearing silently reads as a bug, and the
    // cost drops with them because seat only resolves for a named person.
    const wereNamed = detail.teamLines.filter((l) => l.userId).length;
    if (wereNamed > 0) {
      warnings.push(
        wereNamed === 1
          ? 'The person named on the team was cleared by re-sizing. Name them again to include their seat cost.'
          : `The ${wereNamed} people named on the team were cleared by re-sizing. Name them again to include their seat costs.`
      );
    }
    await replaceTeamLines(
      estimateId,
      sized.lines.map((l) => ({
        deliveryRoleId: l.deliveryRoleId,
        deliveryStage: l.deliveryStage,
        resourceCount: l.resourceCount,
        hours: l.hours,
      })),
      db
    );
  } else {
    warnings.push('No baseline is attached, so the team shape was not re-sized.');
    await persistTotals(estimateId, db);
  }

  return { multiplier: sizing.multiplier, warnings };
}

export async function saveCommercials(
  estimateId: string,
  input: {
    title?: string;
    price?: number | null;
    targetMarginPercent?: number | null;
    asOfDate?: string;
    gnrPolicyId?: string | null;
    gnrRateOverride?: number | null;
    gnrExcluded?: boolean;
  },
  db: DbClient = defaultDb
): Promise<void> {
  await assertDraft(estimateId, db);

  // One transaction, because these two writes were previously independent: a
  // failure in persistTotals left the new price committed against stale totals,
  // and since every mutation recomputes totals, the estimate could no longer be
  // edited at all — not even to undo the price that broke it.
  await db.transaction(async (tx) => {
    await tx
      .update(estimates)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.price !== undefined ? { price: input.price?.toString() ?? null } : {}),
        ...(input.targetMarginPercent !== undefined
          ? { targetMarginPercent: input.targetMarginPercent?.toString() ?? null }
          : {}),
        ...(input.asOfDate !== undefined ? { asOfDate: input.asOfDate } : {}),
        ...(input.gnrPolicyId !== undefined ? { gnrPolicyId: input.gnrPolicyId } : {}),
        ...(input.gnrRateOverride !== undefined
          ? { gnrRateOverride: input.gnrRateOverride?.toString() ?? null }
          : {}),
        ...(input.gnrExcluded !== undefined ? { gnrExcluded: input.gnrExcluded } : {}),
        updatedAt: new Date(),
      })
      .where(eq(estimates.id, estimateId));

    await persistTotals(estimateId, tx as unknown as DbClient);
  });
}

/**
 * Freezes the estimate (FR-P4-47).
 *
 * Writes the full breakdown to `snapshot` and flips the status in one
 * statement. The database CHECK refuses an approved row without both, so a
 * status flip cannot skip the freeze even if this code is bypassed.
 */
export async function approveEstimate(
  estimateId: string,
  approvedBy: string,
  db: DbClient = defaultDb
): Promise<CostBreakdown> {
  await assertDraft(estimateId, db);
  const breakdown = await persistTotals(estimateId, db);
  const now = new Date();

  await db
    .update(estimates)
    .set({
      status: 'approved',
      snapshot: breakdown,
      frozenAt: now,
      approvedBy,
      approvedAt: now,
      updatedAt: now,
    })
    .where(and(eq(estimates.id, estimateId), eq(estimates.status, 'draft')));

  return breakdown;
}

/**
 * Copies an estimate into a fresh draft for scenario comparison (FR-P4-34).
 * The copy records what it came from but does not supersede it.
 */
export async function duplicateEstimate(
  estimateId: string,
  createdBy: string,
  title: string,
  db: DbClient = defaultDb
): Promise<string> {
  const detail = await getEstimateDetail(estimateId, db);
  if (!detail) throw new Error('Estimate not found.');
  const { estimate, teamLines, costLines, drivers } = detail;

  return db.transaction(async (tx) => {
    const [copy] = await tx
      .insert(estimates)
      .values({
        dealId: estimate.dealId,
        companyId: estimate.companyId,
        title,
        serviceLine: estimate.serviceLine,
        status: 'draft',
        supersedesId: estimate.id,
        baselineId: estimate.baselineId,
        baselineVersion: estimate.baselineVersion,
        sizingPolicyId: estimate.sizingPolicyId,
        gnrPolicyId: estimate.gnrPolicyId,
        asOfDate: estimate.asOfDate,
        costingMode: estimate.costingMode,
        currency: estimate.currency,
        sizeMultiplier: estimate.sizeMultiplier,
        price: estimate.price,
        targetMarginPercent: estimate.targetMarginPercent,
        ownerId: createdBy,
        createdBy,
      })
      .returning();

    if (teamLines.length) {
      await tx.insert(estimateTeamLines).values(
        teamLines.map(({ id: _id, estimateId: _e, ...line }) => ({ ...line, estimateId: copy!.id }))
      );
    }
    if (costLines.length) {
      await tx.insert(estimateCostLines).values(
        costLines.map(({ id: _id, estimateId: _e, ...line }) => ({ ...line, estimateId: copy!.id }))
      );
    }
    if (drivers.length) {
      await tx.insert(estimateDrivers).values(
        drivers.map(({ id: _id, estimateId: _e, ...d }) => ({ ...d, estimateId: copy!.id }))
      );
    }

    return copy!.id;
  });
}

export async function listEstimatesForDeal(dealId: string, db: DbClient = defaultDb) {
  return db
    .select()
    .from(estimates)
    .where(eq(estimates.dealId, dealId))
    .orderBy(desc(estimates.createdAt));
}

export async function deleteDraft(estimateId: string, db: DbClient = defaultDb): Promise<void> {
  await assertDraft(estimateId, db);
  await db.delete(estimates).where(and(eq(estimates.id, estimateId), eq(estimates.status, 'draft')));
}

/** Side-by-side scenario comparison (FR-P4-34). */
export async function compareEstimates(estimateIds: string[], db: DbClient = defaultDb) {
  if (!estimateIds.length) return [];
  return db
    .select({
      id: estimates.id,
      title: estimates.title,
      status: estimates.status,
      sizeMultiplier: estimates.sizeMultiplier,
      totalDeliveryCost: estimates.totalDeliveryCost,
      price: estimates.price,
      marginPercent: estimates.marginPercent,
      currency: estimates.currency,
      asOfDate: estimates.asOfDate,
    })
    .from(estimates)
    .where(inArray(estimates.id, estimateIds))
    .orderBy(asc(estimates.createdAt));
}

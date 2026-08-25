import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db as defaultDb } from '@/server/db';
import {
  estimateCostLines,
  estimateDrivers,
  estimateTeamLines,
  estimates,
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
 * Creates a draft. When a baseline is given the team shape is seeded from it,
 * otherwise the estimator starts from an empty sheet.
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
        { weeksMultiplier: 1, teamMultiplier: 1 },
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
          weeks: line.weeks.toString(),
          position: line.position,
        }))
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

  const [teamLines, costLines, drivers] = await Promise.all([
    db
      .select()
      .from(estimateTeamLines)
      .where(eq(estimateTeamLines.estimateId, estimateId))
      .orderBy(asc(estimateTeamLines.position)),
    db
      .select()
      .from(estimateCostLines)
      .where(eq(estimateCostLines.estimateId, estimateId))
      .orderBy(asc(estimateCostLines.position)),
    db
      .select()
      .from(estimateDrivers)
      .where(eq(estimateDrivers.estimateId, estimateId))
      .orderBy(asc(estimateDrivers.position)),
  ]);

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
        userId: estimate.costingMode === 'named' ? line.userId : null,
        weeks: Number(line.weeks),
        resourceCount: line.resourceCount,
        overrides: {
          ...(line.overrideBase !== null ? { base: Number(line.overrideBase) } : {}),
          ...(line.overrideSeat !== null ? { seat: Number(line.overrideSeat) } : {}),
          ...(line.overrideSupport !== null ? { support: Number(line.overrideSupport) } : {}),
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
      marginPercent: margin ? margin.marginPercent.toString() : null,
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
    weeks: number;
    overrideBase?: number | null;
    overrideSeat?: number | null;
    overrideSupport?: number | null;
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
          weeks: line.weeks.toString(),
          overrideBase: line.overrideBase?.toString() ?? null,
          overrideSeat: line.overrideSeat?.toString() ?? null,
          overrideSupport: line.overrideSupport?.toString() ?? null,
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
    basis: 'engagement' | 'per_resource_week';
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
    await replaceTeamLines(
      estimateId,
      sized.lines.map((l) => ({
        deliveryRoleId: l.deliveryRoleId,
        deliveryStage: l.deliveryStage,
        resourceCount: l.resourceCount,
        weeks: l.weeks,
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
    costingMode?: 'blended' | 'named';
  },
  db: DbClient = defaultDb
): Promise<void> {
  await assertDraft(estimateId, db);
  await db
    .update(estimates)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.price !== undefined ? { price: input.price?.toString() ?? null } : {}),
      ...(input.targetMarginPercent !== undefined
        ? { targetMarginPercent: input.targetMarginPercent?.toString() ?? null }
        : {}),
      ...(input.asOfDate !== undefined ? { asOfDate: input.asOfDate } : {}),
      ...(input.gnrPolicyId !== undefined ? { gnrPolicyId: input.gnrPolicyId } : {}),
      ...(input.costingMode !== undefined ? { costingMode: input.costingMode } : {}),
      updatedAt: new Date(),
    })
    .where(eq(estimates.id, estimateId));

  await persistTotals(estimateId, db);
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

import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { db as defaultDb } from '@/server/db';
import {
  deliveryRoles,
  effortBaselines,
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
import { baselineRoles, composeMultiplier, type DriverAnswer } from './sizing.service';

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

/**
 * Thrown when approval is attempted on an estimate that cannot be fully costed.
 *
 * Cost is priced against a person, so a line naming nobody contributes nothing
 * and quietly makes the total too low. That is tolerable in a draft, which is
 * where the thinking happens — but an approved estimate is the frozen record of
 * a decision, and freezing a number that is wrong by an unstaffed role is worse
 * than refusing to freeze it.
 */
export class EstimateIncompleteError extends Error {
  readonly code = 'ESTIMATE_INCOMPLETE';
  constructor(message: string) {
    super(message);
    this.name = 'EstimateIncompleteError';
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
 * Creates a draft. When a baseline is given, the roles a standard engagement of
 * that service needs are seeded onto the sheet with no hours -- the roles are
 * a suggestion worth having, the hours are a decision nobody has made yet.
 * Either way the support line is seeded, so overhead is on the estimate from
 * the start rather than remembered by whoever happens to be building it.
 */
export async function createEstimate(
  input: CreateEstimateInput,
  db: DbClient = defaultDb
): Promise<{ id: string; warnings: string[] }> {
  const asOfDate = input.asOfDate ?? today();
  const warnings: string[] = [];

  return db.transaction(async (tx) => {
    let baselineVersion: number | null = null;
    let seededRoles: Awaited<ReturnType<typeof baselineRoles>>['roles'] = [];

    if (input.baselineId) {
      const catalog = await baselineRoles(input.baselineId, tx as unknown as DbClient);
      baselineVersion = catalog.baselineVersion;
      seededRoles = catalog.roles;
      warnings.push(...catalog.warnings);
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

    if (seededRoles.length) {
      await tx.insert(estimateTeamLines).values(
        seededRoles.map((role) => ({
          estimateId: created!.id,
          deliveryRoleId: role.deliveryRoleId,
          deliveryStage: role.deliveryStage,
          resourceCount: role.resourceCount,
          // Null, not the baseline's hours: how long this engagement needs each
          // role for is the estimator's call, and a seeded number would be read
          // as one.
          hours: null,
          position: role.position,
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
 * What this engagement ought to cost, against what the engine says it does.
 *
 * The baseline's ideal cost is the price of a standard engagement of that
 * service, set by hand in Settings; multiplied by the scoping multiplier it
 * says what an engagement of this size should come to. It sets nothing and
 * blocks nothing -- a wide gap means the team, the hours or the scoping answers
 * disagree with each other, and which of them is wrong is a judgement.
 *
 * Null when there is no baseline or no ideal cost on it. A caller that has no
 * benchmark should say so rather than render a zero, which reads as free.
 */
export interface CostBenchmark {
  idealCost: number;
  multiplier: number;
  expectedCost: number;
  /** How far the engine's figure sits from expected. Negative is under. */
  deltaPercent: number;
}

async function benchmarkFor(
  estimate: typeof estimates.$inferSelect,
  totalDeliveryCost: number,
  db: DbClient
): Promise<CostBenchmark | null> {
  if (!estimate.baselineId) return null;

  const [baseline] = await db
    .select({ idealCost: effortBaselines.idealCost })
    .from(effortBaselines)
    .where(eq(effortBaselines.id, estimate.baselineId))
    .limit(1);

  const idealCost = num(baseline?.idealCost);
  if (idealCost === null || idealCost <= 0) return null;

  const multiplier = num(estimate.sizeMultiplier) ?? 1;
  const expectedCost = round2(idealCost * multiplier);

  return {
    idealCost,
    multiplier,
    expectedCost,
    deltaPercent: round2(((totalDeliveryCost - expectedCost) / expectedCost) * 100),
  };
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
): Promise<{
  breakdown: CostBreakdown;
  margin: ReturnType<typeof computeMargin> | null;
  benchmark: CostBenchmark | null;
}> {
  const detail = await getEstimateDetail(estimateId, db);
  if (!detail) throw new Error('Estimate not found.');
  const { estimate, teamLines, costLines } = detail;

  if (estimate.status !== 'draft' && estimate.snapshot) {
    const breakdown = estimate.snapshot as CostBreakdown;
    return {
      breakdown,
      margin: await marginFor(estimate, breakdown.totalDeliveryCost, db),
      benchmark: await benchmarkFor(estimate, breakdown.totalDeliveryCost, db),
    };
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
        // Null until somebody decides how long this role is needed for. The
        // engine costs it at zero and warns rather than guessing.
        hours: line.hours === null ? null : Number(line.hours),
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

  return {
    breakdown,
    margin: await marginFor(estimate, breakdown.totalDeliveryCost, db),
    benchmark: await benchmarkFor(estimate, breakdown.totalDeliveryCost, db),
  };
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
    /** Null while nobody has decided how long this role is needed for. */
    hours: number | null;
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
          hours: line.hours === null ? null : line.hours.toString(),
          overrideBase: line.overrideBase?.toString() ?? null,
          overrideSeat: line.overrideSeat?.toString() ?? null,
          position: i,
        }))
      );
    }
  });
  await persistTotals(estimateId, db);
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Puts the roles a standard engagement of this service needs onto the sheet.
 *
 * Additive and idempotent: a role the estimate already carries is left exactly
 * as it is, whoever is named on it and whatever hours it holds. Only roles that
 * are missing are appended, and they arrive with no hours.
 *
 * This replaces `resizeTeamFromBaseline`, which ran on every trip through the
 * questionnaire and rewrote how long each role was working. Seeding is now
 * something the estimator asks for once, because a scoping answer is not a
 * staffing decision.
 */
export async function seedRolesFromBaseline(
  estimateId: string,
  db: DbClient = defaultDb
): Promise<{ added: number; warnings: string[] }> {
  await assertDraft(estimateId, db);

  const [estimate] = await db
    .select({ baselineId: estimates.baselineId })
    .from(estimates)
    .where(eq(estimates.id, estimateId))
    .limit(1);
  if (!estimate) throw new Error('Estimate not found.');
  if (!estimate.baselineId) {
    return {
      added: 0,
      warnings: ['No baseline is attached to this estimate, so there are no roles to seed.'],
    };
  }

  const catalog = await baselineRoles(estimate.baselineId, db);
  const warnings = [...catalog.warnings];

  const existing = await db
    .select()
    .from(estimateTeamLines)
    .where(eq(estimateTeamLines.estimateId, estimateId));

  // Role and stage together identify a line: the same role can legitimately
  // appear at two stages, and they are different work.
  const key = (roleId: string, stage: string | null) => `${roleId}::${stage ?? ''}`;
  const present = new Set(existing.map((l) => key(l.deliveryRoleId, l.deliveryStage)));
  const missing = catalog.roles.filter((r) => !present.has(key(r.deliveryRoleId, r.deliveryStage)));

  if (!missing.length) {
    return { added: 0, warnings };
  }

  let nextPosition = existing.reduce((max, l) => Math.max(max, l.position), -1) + 1;
  await db.insert(estimateTeamLines).values(
    missing.map((role) => ({
      estimateId,
      deliveryRoleId: role.deliveryRoleId,
      deliveryStage: role.deliveryStage,
      resourceCount: role.resourceCount,
      hours: null,
      position: nextPosition++,
    }))
  );

  // Adding a role with no hours moves no money, but the warning about
  // unassigned hours is the point of the exercise.
  await persistTotals(estimateId, db);
  return { added: missing.length, warnings };
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
 * Records driver answers and recomposes the size multiplier (FR-P4-11).
 *
 * It touches no team line. This used to re-size the whole team from the
 * baseline on every save, which meant answering a scoping question rewrote how
 * long each person was working -- an estimator who had assigned hours
 * deliberately would find them changed underneath. Scoping records how big the
 * engagement is; the hours stay where whoever is staffing it put them.
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

  // The multiplier carries no money on its own -- it is a size, and cost comes
  // from the hours somebody assigned. Totals are refreshed anyway so the stored
  // copy and the warnings stay in step with the rest of the estimate.
  await persistTotals(estimateId, db);

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
    /** The window the client asked for, and the effort judged to fill it. */
    engagementWeeks?: number | null;
    engagementHours?: number | null;
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
        ...(input.engagementWeeks !== undefined
          ? { engagementWeeks: input.engagementWeeks?.toString() ?? null }
          : {}),
        ...(input.engagementHours !== undefined
          ? { engagementHours: input.engagementHours?.toString() ?? null }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(estimates.id, estimateId));

    await persistTotals(estimateId, tx as unknown as DbClient);
  });
}

/**
 * Refuses to freeze an estimate carrying a line nobody is on.
 *
 * Named separately from the frozen check because it fails for the opposite
 * reason: not "this is finished" but "this is not finished enough to finish".
 * The roles are listed in the message — "two lines are unstaffed" sends someone
 * hunting, and the builder disables the button for the same reason.
 */
async function assertEveryLineIsStaffed(estimateId: string, db: DbClient): Promise<void> {
  const unstaffed = await db
    .select({ roleName: deliveryRoles.name })
    .from(estimateTeamLines)
    .leftJoin(deliveryRoles, eq(deliveryRoles.id, estimateTeamLines.deliveryRoleId))
    .where(and(eq(estimateTeamLines.estimateId, estimateId), isNull(estimateTeamLines.userId)));

  if (!unstaffed.length) return;

  const names = [...new Set(unstaffed.map((r) => r.roleName ?? 'an unnamed role'))];
  throw new EstimateIncompleteError(
    `${names.join(', ')} ${names.length === 1 ? 'has' : 'have'} nobody named, so ${
      names.length === 1 ? 'that line costs' : 'those lines cost'
    } nothing. Cost is worked out per person — name who will do the work before approving.`
  );
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
  await assertEveryLineIsStaffed(estimateId, db);
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
        teamSizingMode: estimate.teamSizingMode,
        currency: estimate.currency,
        engagementWeeks: estimate.engagementWeeks,
        engagementHours: estimate.engagementHours,
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

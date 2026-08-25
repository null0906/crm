import { and, asc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { db as defaultDb } from '@/server/db';
import {
  effortBaselineLines,
  effortBaselines,
  sizingDriverOptions,
  sizingDrivers,
  sizingPolicies,
} from '@/server/db/schema';
import type { SizingAppliesTo, SizingComposition } from '@/lib/types';

type DbClient = typeof defaultDb;

export interface DriverAnswer {
  driverId: string;
  /** For `select` drivers. */
  optionId?: string | null;
  /** For `number` drivers. */
  numericValue?: number | null;
  source?: string | null;
  answerConfidence?: 'low' | 'medium' | 'high' | null;
}

export interface DriverContribution {
  driverId: string;
  slug: string;
  name: string;
  appliesTo: SizingAppliesTo;
  /** What this driver alone multiplies effort by. 1.0 means neutral. */
  multiplier: number;
  answerLabel: string;
}

export interface SizingResult {
  /** Total effort multiplier: weeksMultiplier x teamMultiplier. */
  multiplier: number;
  weeksMultiplier: number;
  teamMultiplier: number;
  /** What the drivers composed to before the policy ceiling was applied. */
  rawMultiplier: number;
  capped: boolean;
  maxMultiplier: number;
  composition: SizingComposition;
  policyId: string | null;
  contributions: DriverContribution[];
  warnings: string[];
}

function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

async function resolveSizingPolicy(asOf: string, db: DbClient) {
  const [policy] = await db
    .select()
    .from(sizingPolicies)
    .where(
      and(
        lte(sizingPolicies.effectiveFrom, asOf),
        or(isNull(sizingPolicies.effectiveTo), sql`${sizingPolicies.effectiveTo} >= ${asOf}`)
      )
    )
    .orderBy(sql`${sizingPolicies.effectiveFrom} DESC`, sql`${sizingPolicies.version} DESC`)
    .limit(1);
  return policy ?? null;
}

/**
 * Composes driver answers into a single effort multiplier (FR-P4-09, FR-P4-10).
 *
 * A driver states whether it lengthens the engagement, enlarges the team, or
 * both, because those cost differently. `both` is split as the square root
 * across each axis, so that weeksMultiplier x teamMultiplier reproduces the
 * driver's stated effect on total effort rather than squaring it.
 *
 * The policy ceiling is applied to the composed total and reported rather than
 * hidden — a capped estimate is a signal that the drivers disagree with
 * reality, not something to smooth over.
 */
export async function composeMultiplier(
  answers: DriverAnswer[],
  asOf: string,
  db: DbClient = defaultDb
): Promise<SizingResult> {
  const warnings: string[] = [];
  const policy = await resolveSizingPolicy(asOf, db);
  const composition: SizingComposition = policy?.composition ?? 'multiplicative';
  const maxMultiplier = Number(policy?.maxMultiplier ?? 2.5);
  if (!policy) warnings.push(`No sizing policy effective on ${asOf}. Ceiling defaulted to 2.5x.`);

  const contributions: DriverContribution[] = [];
  if (!answers.length) {
    return {
      multiplier: 1, weeksMultiplier: 1, teamMultiplier: 1, rawMultiplier: 1,
      capped: false, maxMultiplier, composition, policyId: policy?.id ?? null,
      contributions, warnings,
    };
  }

  const driverIds = [...new Set(answers.map((a) => a.driverId))];
  const drivers = await db
    .select()
    .from(sizingDrivers)
    .where(inArray(sizingDrivers.id, driverIds));
  const driverById = new Map(drivers.map((d) => [d.id, d]));

  const optionIds = answers.map((a) => a.optionId).filter((x): x is string => !!x);
  const options = optionIds.length
    ? await db.select().from(sizingDriverOptions).where(inArray(sizingDriverOptions.id, optionIds))
    : [];
  const optionById = new Map(options.map((o) => [o.id, o]));

  for (const answer of answers) {
    const driver = driverById.get(answer.driverId);
    if (!driver) {
      warnings.push(`Unknown sizing driver ${answer.driverId}; ignored.`);
      continue;
    }

    let multiplier = 1;
    let answerLabel = '';

    if (driver.valueType === 'select') {
      const option = answer.optionId ? optionById.get(answer.optionId) : undefined;
      if (!option) {
        warnings.push(`${driver.name} has no answer selected; treated as neutral.`);
        continue;
      }
      multiplier = Number(option.multiplier);
      answerLabel = option.label;
    } else {
      const value = answer.numericValue;
      if (value === null || value === undefined) {
        warnings.push(`${driver.name} has no value entered; treated as neutral.`);
        continue;
      }
      const perUnit = Number(driver.multiplierPerUnit ?? 0);
      // Units at or below the baseline are already priced into the catalog.
      const chargeableUnits = Math.max(0, value - driver.unitBaseline);
      multiplier = 1 + perUnit * chargeableUnits;
      answerLabel = `${value}`;
    }

    contributions.push({
      driverId: driver.id,
      slug: driver.slug,
      name: driver.name,
      appliesTo: driver.appliesTo,
      multiplier: round4(multiplier),
      answerLabel,
    });
  }

  const combine = (values: number[]): number =>
    composition === 'additive'
      ? 1 + values.reduce((sum, m) => sum + (m - 1), 0)
      : values.reduce((product, m) => product * m, 1);

  const weeksValues = contributions
    .filter((c) => c.appliesTo === 'weeks' || c.appliesTo === 'both')
    .map((c) => (c.appliesTo === 'both' ? Math.sqrt(c.multiplier) : c.multiplier));
  const teamValues = contributions
    .filter((c) => c.appliesTo === 'team' || c.appliesTo === 'both')
    .map((c) => (c.appliesTo === 'both' ? Math.sqrt(c.multiplier) : c.multiplier));

  let weeksMultiplier = combine(weeksValues);
  let teamMultiplier = combine(teamValues);
  const rawMultiplier = weeksMultiplier * teamMultiplier;

  let capped = false;
  let multiplier = rawMultiplier;
  if (rawMultiplier > maxMultiplier) {
    capped = true;
    const scale = Math.sqrt(maxMultiplier / rawMultiplier);
    weeksMultiplier *= scale;
    teamMultiplier *= scale;
    multiplier = maxMultiplier;
    warnings.push(
      `Composed multiplier ${round2(rawMultiplier)}x exceeded the ${maxMultiplier}x ceiling and was capped.`
    );
  }

  return {
    multiplier: round4(multiplier),
    weeksMultiplier: round4(weeksMultiplier),
    teamMultiplier: round4(teamMultiplier),
    rawMultiplier: round4(rawMultiplier),
    capped,
    maxMultiplier,
    composition,
    policyId: policy?.id ?? null,
    contributions,
    warnings,
  };
}

export interface SizedTeamLine {
  deliveryRoleId: string;
  deliveryStage: string | null;
  resourceCount: number;
  weeks: number;
  position: number;
}

export interface SizedBaseline {
  baselineId: string;
  baselineVersion: number;
  serviceLine: string;
  isJudgementBased: boolean;
  confidence: string;
  lines: SizedTeamLine[];
  warnings: string[];
}

/**
 * Expands a catalog baseline into a sized team shape (FR-P4-01, FR-P4-13).
 *
 * Headcount is a whole number of people, so the team multiplier is rounded and
 * the rounding residue is folded back into weeks. That keeps total effort equal
 * to baseline effort x multiplier instead of silently drifting by up to half a
 * person per line.
 */
export async function applyBaseline(
  baselineId: string,
  sizing: Pick<SizingResult, 'weeksMultiplier' | 'teamMultiplier'>,
  db: DbClient = defaultDb
): Promise<SizedBaseline> {
  const [baseline] = await db
    .select()
    .from(effortBaselines)
    .where(eq(effortBaselines.id, baselineId))
    .limit(1);
  if (!baseline) throw new Error('Baseline not found.');

  const lines = await db
    .select()
    .from(effortBaselineLines)
    .where(eq(effortBaselineLines.baselineId, baselineId))
    .orderBy(asc(effortBaselineLines.position));

  const warnings: string[] = [];
  if (!lines.length) warnings.push('This baseline has no team lines, so the estimate starts empty.');
  if (baseline.isJudgementBased) {
    warnings.push(
      'This baseline is judgement-based: no delivered effort supports it yet, so treat the numbers as a starting point.'
    );
  }

  const sized = lines.map((line) => {
    const baseCount = line.resourceCount;
    const baseWeeks = Number(line.weeks);
    const targetEffort = baseCount * baseWeeks * sizing.teamMultiplier * sizing.weeksMultiplier;

    const resourceCount = Math.max(1, Math.round(baseCount * sizing.teamMultiplier));
    // Residue from rounding headcount goes into weeks so effort is preserved.
    const weeks = round2(targetEffort / resourceCount);

    return {
      deliveryRoleId: line.deliveryRoleId,
      deliveryStage: line.deliveryStage,
      resourceCount,
      weeks,
      position: line.position,
    };
  });

  return {
    baselineId: baseline.id,
    baselineVersion: baseline.version,
    serviceLine: baseline.serviceLine,
    isJudgementBased: baseline.isJudgementBased,
    confidence: baseline.confidence,
    lines: sized,
    warnings,
  };
}

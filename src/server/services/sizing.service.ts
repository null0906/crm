import { and, asc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { db as defaultDb } from '@/server/db';
import {
  effortBaselineLines,
  effortBaselines,
  sizingDriverOptions,
  sizingDrivers,
  sizingPolicies,
} from '@/server/db/schema';
import type { SizingComposition } from '@/lib/types';

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
  /** What this driver alone multiplies the engagement's size by. 1.0 is neutral. */
  multiplier: number;
  answerLabel: string;
}

export interface SizingResult {
  /** How big this engagement is against a standard one. 2.3 means 2.3x. */
  multiplier: number;
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
 * Composes driver answers into a single size multiplier (FR-P4-09, FR-P4-10).
 *
 * This answers one question and stops: how big is this engagement against a
 * standard one of its service line. It used to answer two — hours per person
 * and headcount — and hand the pair to a baseline expander that produced a
 * fully staffed team. That made scoping responsible for staffing decisions it
 * has no basis for: how big the work is does not tell you how many hours anyone
 * will commit or who is free to do them. Both are now typed by a person.
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
      multiplier: 1, rawMultiplier: 1,
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
      multiplier: round4(multiplier),
      answerLabel,
    });
  }

  const rawMultiplier =
    composition === 'additive'
      ? 1 + contributions.reduce((sum, c) => sum + (c.multiplier - 1), 0)
      : contributions.reduce((product, c) => product * c.multiplier, 1);

  const capped = rawMultiplier > maxMultiplier;
  if (capped) {
    warnings.push(
      `Composed multiplier ${round2(rawMultiplier)}x exceeded the ${maxMultiplier}x ceiling and was capped.`
    );
  }

  return {
    multiplier: round4(Math.min(rawMultiplier, maxMultiplier)),
    rawMultiplier: round4(rawMultiplier),
    capped,
    maxMultiplier,
    composition,
    policyId: policy?.id ?? null,
    contributions,
    warnings,
  };
}

export interface BaselineRole {
  deliveryRoleId: string;
  deliveryStage: string | null;
  resourceCount: number;
  position: number;
}

export interface BaselineRoles {
  baselineId: string;
  baselineVersion: number;
  serviceLine: string;
  isJudgementBased: boolean;
  confidence: string;
  roles: BaselineRole[];
  warnings: string[];
}

/**
 * Reads which roles a standard engagement of this service line needs.
 *
 * Deliberately arithmetic-free. This used to be `applyBaseline`, which
 * multiplied the baseline's headcount and hours by the sizing result to produce
 * a staffed team — so answering a questionnaire silently rewrote how long
 * everyone on the engagement was working. Seeding now copies the roles and
 * their usual headcount and leaves hours null, because the baseline's hours are
 * a record of what past engagements took, not a decision about this one.
 */
export async function baselineRoles(
  baselineId: string,
  db: DbClient = defaultDb
): Promise<BaselineRoles> {
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
  if (!lines.length) warnings.push('This baseline lists no roles, so the estimate starts empty.');
  if (baseline.isJudgementBased) {
    warnings.push(
      'This baseline is judgement-based: no delivered effort supports it yet, so treat the roles as a starting point.'
    );
  }

  return {
    baselineId: baseline.id,
    baselineVersion: baseline.version,
    serviceLine: baseline.serviceLine,
    isJudgementBased: baseline.isJudgementBased,
    confidence: baseline.confidence,
    roles: lines.map((line) => ({
      deliveryRoleId: line.deliveryRoleId,
      deliveryStage: line.deliveryStage,
      resourceCount: line.resourceCount,
      position: line.position,
    })),
    warnings,
  };
}

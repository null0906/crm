import { and, asc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { db as defaultDb } from '@/server/db';
import {
  deliveryRoles,
  gnrPolicies,
  resourceCostComponents,
} from '@/server/db/schema';
import type { CostComponent, CostScope, GnrBasis } from '@/lib/types';

type DbClient = typeof defaultDb;

const COMPONENTS: CostComponent[] = ['base', 'seat', 'support'];

/** Most-specific-wins. A higher number beats a lower one. */
const SCOPE_RANK: Record<CostScope, number> = { default: 0, role: 1, employee: 2 };

export interface TeamMemberInput {
  deliveryRoleId: string;
  /** Optional. When given, the engine costs this named person (FR-P4-18). */
  userId?: string | null;
  weeks: number;
  /** Per-component overrides. Every figure is editable (FR-P4-55). */
  overrides?: Partial<Record<CostComponent, number>>;
}

export interface NonLabourLineInput {
  label: string;
  amount: number;
  /** Pass-through lines are quoted at cost and never marked up (FR-P4-16). */
  passThrough: boolean;
}

/** Custom estimator-defined cost variables (FR-P4-56). */
export interface CustomLineInput {
  label: string;
  amount: number;
  /** 'per_resource_week' multiplies by total team weeks; 'engagement' is flat. */
  basis: 'per_resource_week' | 'engagement';
  passThrough?: boolean;
}

export interface CostEngineInput {
  team: TeamMemberInput[];
  nonLabour?: NonLabourLineInput[];
  customLines?: CustomLineInput[];
  /** Resolves effective-dated rates. Defaults to today (NFR-REP-01). */
  asOf?: string;
  /** Pin a specific GNR policy; otherwise the one effective on `asOf` is used. */
  gnrPolicyId?: string | null;
  /** Explicit GNR override, bypassing policy lookup (FR-P4-55). */
  gnrRatePercentOverride?: number | null;
  currency?: string;
}

interface ResolvedComponent {
  amount: number;
  scope: CostScope;
  overridden: boolean;
}

export interface CostedResource {
  deliveryRoleId: string;
  deliveryRoleName: string;
  userId: string | null;
  weeks: number;
  base: number;
  seat: number;
  support: number;
  loadedWeekly: number;
  total: number;
  /** Which scope each component resolved from, so the number is explainable. */
  resolvedFrom: Record<CostComponent, { scope: CostScope; overridden: boolean }>;
}

export interface CostBreakdown {
  currency: string;
  asOf: string;
  resources: CostedResource[];
  totalWeeks: number;
  labourSubtotal: number;
  nonLabourPassThrough: number;
  nonLabourMarkedUp: number;
  nonLabourTotal: number;
  customTotal: number;
  subtotalBeforeGnr: number;
  gnr: {
    policyId: string | null;
    policyName: string | null;
    policyVersion: number | null;
    ratePercent: number;
    appliesTo: GnrBasis;
    basisAmount: number;
    gnrAmount: number;
    isOverride: boolean;
  };
  totalDeliveryCost: number;
  /** Populated when a rate could not be resolved — the estimate is incomplete. */
  warnings: string[];
}

function money(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Loads every cost component effective on `asOf`, then picks the most specific
 * scope per (role, user, component).
 *
 * One query for the whole team rather than one per resource per component.
 */
async function resolveComponents(
  team: TeamMemberInput[],
  asOf: string,
  db: DbClient
): Promise<Map<string, ResolvedComponent>> {
  const rows = await db
    .select({
      scope: resourceCostComponents.scope,
      deliveryRoleId: resourceCostComponents.deliveryRoleId,
      userId: resourceCostComponents.userId,
      component: resourceCostComponents.component,
      amountPerWeek: resourceCostComponents.amountPerWeek,
      effectiveFrom: resourceCostComponents.effectiveFrom,
    })
    .from(resourceCostComponents)
    .where(
      and(
        lte(resourceCostComponents.effectiveFrom, asOf),
        or(
          isNull(resourceCostComponents.effectiveTo),
          sql`${resourceCostComponents.effectiveTo} >= ${asOf}`
        )
      )
    )
    .orderBy(asc(resourceCostComponents.effectiveFrom));

  const best = new Map<string, ResolvedComponent>();

  for (const member of team) {
    for (const component of COMPONENTS) {
      const key = `${member.deliveryRoleId}|${member.userId ?? ''}|${component}`;
      let winner: ResolvedComponent | null = null;

      for (const row of rows) {
        if (row.component !== component) continue;

        const applies =
          (row.scope === 'default' && !row.deliveryRoleId && !row.userId) ||
          (row.scope === 'role' && row.deliveryRoleId === member.deliveryRoleId) ||
          (row.scope === 'employee' && !!member.userId && row.userId === member.userId);
        if (!applies) continue;

        // Later effective_from wins within a scope; rows arrive ascending.
        if (!winner || SCOPE_RANK[row.scope] >= SCOPE_RANK[winner.scope]) {
          winner = {
            amount: Number(row.amountPerWeek ?? 0),
            scope: row.scope,
            overridden: false,
          };
        }
      }

      if (winner) best.set(key, winner);
    }
  }

  return best;
}

async function resolveGnr(
  input: CostEngineInput,
  asOf: string,
  db: DbClient
): Promise<{
  policyId: string | null;
  policyName: string | null;
  policyVersion: number | null;
  ratePercent: number;
  appliesTo: GnrBasis;
  isOverride: boolean;
}> {
  if (input.gnrRatePercentOverride !== undefined && input.gnrRatePercentOverride !== null) {
    return {
      policyId: null,
      policyName: null,
      policyVersion: null,
      ratePercent: input.gnrRatePercentOverride,
      appliesTo: 'total',
      isOverride: true,
    };
  }

  const [policy] = input.gnrPolicyId
    ? await db.select().from(gnrPolicies).where(eq(gnrPolicies.id, input.gnrPolicyId)).limit(1)
    : await db
        .select()
        .from(gnrPolicies)
        .where(
          and(
            lte(gnrPolicies.effectiveFrom, asOf),
            or(isNull(gnrPolicies.effectiveTo), sql`${gnrPolicies.effectiveTo} >= ${asOf}`)
          )
        )
        .orderBy(sql`${gnrPolicies.effectiveFrom} DESC`, sql`${gnrPolicies.version} DESC`)
        .limit(1);

  if (!policy) {
    return {
      policyId: null,
      policyName: null,
      policyVersion: null,
      ratePercent: 0,
      appliesTo: 'total',
      isOverride: false,
    };
  }

  return {
    policyId: policy.id,
    policyName: policy.name,
    policyVersion: policy.version,
    ratePercent: Number(policy.ratePercent ?? 0),
    appliesTo: policy.appliesTo,
    isOverride: false,
  };
}

/**
 * The cost engine (FR-P4-15 to FR-P4-18).
 *
 *   per resource, per week: base + seat + support = loaded weekly cost
 *   engagement: Σ(loaded weekly × weeks) + non-labour, × (1 + GNR%)
 *
 * Returns raw cost. Callers are responsible for gating the result through
 * `financial-access.ts` before it leaves the server.
 */
export async function computeCost(
  input: CostEngineInput,
  db: DbClient = defaultDb
): Promise<CostBreakdown> {
  const asOf = input.asOf ?? today();
  const currency = input.currency ?? 'INR';
  const warnings: string[] = [];

  const roleIds = [...new Set(input.team.map((m) => m.deliveryRoleId))];
  const roleRows = roleIds.length
    ? await db
        .select({ id: deliveryRoles.id, name: deliveryRoles.name })
        .from(deliveryRoles)
        .where(inArray(deliveryRoles.id, roleIds))
    : [];
  const roleNames = new Map(roleRows.map((r) => [r.id, r.name]));

  const resolved = await resolveComponents(input.team, asOf, db);

  const resources: CostedResource[] = input.team.map((member) => {
    const amounts = {} as Record<CostComponent, number>;
    const resolvedFrom = {} as CostedResource['resolvedFrom'];

    for (const component of COMPONENTS) {
      const override = member.overrides?.[component];
      if (override !== undefined && override !== null) {
        amounts[component] = override;
        resolvedFrom[component] = { scope: 'default', overridden: true };
        continue;
      }

      const hit = resolved.get(`${member.deliveryRoleId}|${member.userId ?? ''}|${component}`);
      if (!hit) {
        amounts[component] = 0;
        resolvedFrom[component] = { scope: 'default', overridden: false };
        warnings.push(
          `No ${component} rate effective on ${asOf} for role ${
            roleNames.get(member.deliveryRoleId) ?? member.deliveryRoleId
          }. Treated as zero.`
        );
        continue;
      }

      amounts[component] = hit.amount;
      resolvedFrom[component] = { scope: hit.scope, overridden: false };
    }

    const loadedWeekly = money(amounts.base + amounts.seat + amounts.support);

    return {
      deliveryRoleId: member.deliveryRoleId,
      deliveryRoleName: roleNames.get(member.deliveryRoleId) ?? 'Unknown role',
      userId: member.userId ?? null,
      weeks: member.weeks,
      base: money(amounts.base),
      seat: money(amounts.seat),
      support: money(amounts.support),
      loadedWeekly,
      total: money(loadedWeekly * member.weeks),
      resolvedFrom,
    };
  });

  const totalWeeks = resources.reduce((sum, r) => sum + r.weeks, 0);
  const labourSubtotal = money(resources.reduce((sum, r) => sum + r.total, 0));

  const nonLabour = input.nonLabour ?? [];
  const nonLabourPassThrough = money(
    nonLabour.filter((l) => l.passThrough).reduce((s, l) => s + l.amount, 0)
  );
  const nonLabourMarkedUp = money(
    nonLabour.filter((l) => !l.passThrough).reduce((s, l) => s + l.amount, 0)
  );
  const nonLabourTotal = money(nonLabourPassThrough + nonLabourMarkedUp);

  const customTotal = money(
    (input.customLines ?? []).reduce(
      (sum, line) =>
        sum + (line.basis === 'per_resource_week' ? line.amount * totalWeeks : line.amount),
      0
    )
  );

  const subtotalBeforeGnr = money(labourSubtotal + nonLabourTotal + customTotal);

  const gnrPolicy = await resolveGnr(input, asOf, db);
  const basisAmount =
    gnrPolicy.appliesTo === 'labour_only' ? labourSubtotal : subtotalBeforeGnr;
  const gnrAmount = money((basisAmount * gnrPolicy.ratePercent) / 100);

  if (!gnrPolicy.policyId && !gnrPolicy.isOverride) {
    warnings.push(`No GNR policy effective on ${asOf}. Applied at 0%.`);
  }

  return {
    currency,
    asOf,
    resources,
    totalWeeks,
    labourSubtotal,
    nonLabourPassThrough,
    nonLabourMarkedUp,
    nonLabourTotal,
    customTotal,
    subtotalBeforeGnr,
    gnr: { ...gnrPolicy, basisAmount, gnrAmount },
    totalDeliveryCost: money(subtotalBeforeGnr + gnrAmount),
    warnings,
  };
}

export interface MarginResult {
  price: number;
  totalDeliveryCost: number;
  marginAmount: number;
  marginPercent: number;
  /** Suggested price at the target margin. Guidance only — FR-P4-28. */
  suggestedPrice: number | null;
  clearsTarget: boolean | null;
}

/**
 * Margin is advisory (FR-P4-28): cost sets the floor, the market sets the price.
 * Margin here is on price — (price - cost) / price — the consulting convention.
 */
export function computeMargin(
  totalDeliveryCost: number,
  price: number,
  targetMarginPercent?: number | null
): MarginResult {
  const marginAmount = money(price - totalDeliveryCost);
  const marginPercent = price > 0 ? money((marginAmount / price) * 100) : 0;

  const hasTarget = targetMarginPercent !== undefined && targetMarginPercent !== null;
  const suggestedPrice =
    hasTarget && targetMarginPercent < 100
      ? money(totalDeliveryCost / (1 - targetMarginPercent / 100))
      : null;

  return {
    price: money(price),
    totalDeliveryCost: money(totalDeliveryCost),
    marginAmount,
    marginPercent,
    suggestedPrice,
    clearsTarget: hasTarget ? marginPercent >= targetMarginPercent : null,
  };
}

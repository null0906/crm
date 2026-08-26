import { and, asc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { db as defaultDb } from '@/server/db';
import {
  deliveryRoles,
  gnrPolicies,
  marginTargets,
  resourceCostComponents,
} from '@/server/db/schema';
import type { CostComponent, CostScope, GnrBasis } from '@/lib/types';

type DbClient = typeof defaultDb;

const COMPONENTS: CostComponent[] = ['base', 'seat'];

/** Most-specific-wins. A higher number beats a lower one. */
const SCOPE_RANK: Record<CostScope, number> = { default: 0, role: 1, employee: 2 };

export interface TeamMemberInput {
  deliveryRoleId: string;
  /**
   * Optional. When given, the engine costs this named person (FR-P4-18) — and
   * only then can a seat cost resolve, because seat belongs to a person.
   */
  userId?: string | null;
  hours: number;
  /** How many people in this role. Defaults to 1 so a line is one person. */
  resourceCount?: number;
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
  /** 'per_resource_hour' multiplies by total team hours; 'engagement' is flat. */
  basis: 'per_resource_hour' | 'engagement';
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
  hours: number;
  resourceCount: number;
  base: number;
  seat: number;
  loadedHourly: number;
  total: number;
  /** Which scope each component resolved from, so the number is explainable. */
  resolvedFrom: Record<CostComponent, { scope: CostScope; overridden: boolean }>;
}

export interface CostBreakdown {
  currency: string;
  asOf: string;
  resources: CostedResource[];
  totalHours: number;
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
      amountPerHour: resourceCostComponents.amountPerHour,
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
            amount: Number(row.amountPerHour ?? 0),
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
 *   per resource, per hour: base + seat = loaded hourly cost
 *   engagement: Σ(loaded hourly × hours × headcount) + non-labour, × (1 + GNR%)
 *
 * Support is no longer a component here. It arrives as a cost line seeded onto
 * the estimate, so an estimator can see the figure rather than inherit it.
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
        const roleName = roleNames.get(member.deliveryRoleId) ?? member.deliveryRoleId;
        // Seat gets its own wording. "No seat rate for Security Analyst" would
        // send someone to the role rates looking for a field that no longer
        // exists there, when what is missing is a rate on a person.
        warnings.push(
          component === 'seat'
            ? member.userId
              ? `No seat cost is set for the person on the ${roleName} line. Set it against them in Delivery Roles.`
              : `${roleName} is costed blended, so no seat cost applies. Name the person to include it.`
            : `No ${component} rate effective on ${asOf} for role ${roleName}. Treated as zero.`
        );
        continue;
      }

      amounts[component] = hit.amount;
      resolvedFrom[component] = { scope: hit.scope, overridden: false };
    }

    const loadedHourly = money(amounts.base + amounts.seat);
    const resourceCount = member.resourceCount ?? 1;

    return {
      deliveryRoleId: member.deliveryRoleId,
      deliveryRoleName: roleNames.get(member.deliveryRoleId) ?? 'Unknown role',
      userId: member.userId ?? null,
      hours: member.hours,
      resourceCount,
      base: money(amounts.base),
      seat: money(amounts.seat),
      loadedHourly,
      total: money(loadedHourly * member.hours * resourceCount),
      resolvedFrom,
    };
  });

  // Resource-hours: two analysts for 200 hours each is 400, not 200. This is
  // what a per-resource-hour line multiplies against, support included.
  const totalHours = resources.reduce((sum, r) => sum + r.hours * r.resourceCount, 0);
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
        sum + (line.basis === 'per_resource_hour' ? line.amount * totalHours : line.amount),
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
    totalHours,
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

export interface ResolvedMarginTarget {
  targetMarginPercent: number;
  floorMarginPercent: number | null;
  /** Where the target came from, so the builder can say so. */
  source: 'service_line' | 'company_default';
}

/**
 * Resolves the target margin for a service line, falling back to the
 * company-wide default stored under the '*' sentinel (FR-P4-28).
 *
 * Returns null when neither exists — no target has been configured, which the
 * builder should say plainly rather than implying a target of zero.
 */
export async function resolveMarginTarget(
  serviceLine: string | null | undefined,
  asOf: string,
  db: DbClient = defaultDb
): Promise<ResolvedMarginTarget | null> {
  const rows = await db
    .select()
    .from(marginTargets)
    .where(
      and(
        lte(marginTargets.effectiveFrom, asOf),
        or(isNull(marginTargets.effectiveTo), sql`${marginTargets.effectiveTo} >= ${asOf}`)
      )
    );

  const pick =
    (serviceLine ? rows.find((r) => r.serviceLine === serviceLine) : undefined) ??
    rows.find((r) => r.serviceLine === '*');
  if (!pick) return null;

  return {
    targetMarginPercent: Number(pick.targetMarginPercent),
    floorMarginPercent: pick.floorMarginPercent === null ? null : Number(pick.floorMarginPercent),
    source: pick.serviceLine === '*' ? 'company_default' : 'service_line',
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
  /**
   * True when the margin has fallen below the configured floor. A warning, not
   * a gate: approval is not blocked, because blocking would need an approval
   * trail and there isn't one (FR-P4-32 is only partly met).
   */
  belowFloor: boolean | null;
  floorMarginPercent: number | null;
}

/**
 * Margin is advisory (FR-P4-28): cost sets the floor, the market sets the price.
 * Margin here is on price — (price - cost) / price — the consulting convention.
 */
export function computeMargin(
  totalDeliveryCost: number,
  price: number,
  targetMarginPercent?: number | null,
  floorMarginPercent?: number | null
): MarginResult {
  const marginAmount = money(price - totalDeliveryCost);
  const marginPercent = price > 0 ? money((marginAmount / price) * 100) : 0;

  const hasTarget = targetMarginPercent !== undefined && targetMarginPercent !== null;
  const hasFloor = floorMarginPercent !== undefined && floorMarginPercent !== null;
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
    belowFloor: hasFloor ? marginPercent < floorMarginPercent : null,
    floorMarginPercent: hasFloor ? floorMarginPercent : null,
  };
}

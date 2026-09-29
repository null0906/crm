import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { protectedProcedure, router } from '../router';
import { db } from '@/server/db';
import { estimates } from '@/server/db/schema';

/**
 * Delivery availability, read from the Employee Ops platform.
 *
 * `eops.v_person_availability` and `eops.v_role_availability` are read-only
 * views owned by another application that shares this database. We hold SELECT
 * on exactly those two views and nothing else — never a table.
 *
 * Deliberately NOT modelled as drizzle objects. `pgSchema` is used nowhere in
 * this repo, `drizzle.config.ts` is pinned to `schemaFilter: ['public']`, and
 * putting another application's relations into our schema barrel would place
 * them inside our migration tooling's field of view — precisely the failure the
 * role separation exists to prevent. Raw SQL, like `deals_with_value`.
 *
 * Deliberately `protectedProcedure`, not `financialProcedure`: availability is
 * hours and headcount, never money. `costModel.listRoles` sets the same
 * precedent for a non-money estimate input.
 */

type QueryResultLike<T = Record<string, unknown>> = { rows?: T[] };
function asRows<T>(result: unknown): T[] {
  return ((result as QueryResultLike<T>)?.rows ?? []) as T[];
}

/**
 * The views may not exist yet, and the grant may not have been made.
 *
 * `42P01` undefined_table, `42501` insufficient_privilege, `3F000` invalid
 * schema. Anything else is a real fault and must stay loud — a silent empty
 * result would read as "nobody is free", which is a lie the estimator would act
 * on.
 */
const ABSENT: Record<string, 'not_deployed' | 'not_granted'> = {
  '42P01': 'not_deployed',
  '3F000': 'not_deployed',
  '42501': 'not_granted',
};

function absenceReason(err: unknown): 'not_deployed' | 'not_granted' | null {
  const code =
    (err as { code?: string }).code ?? (err as { cause?: { code?: string } }).cause?.code;
  return code ? (ABSENT[code] ?? null) : null;
}

/** Weeks of lookahead. Clamped: the views only cover a bounded window. */
const DEFAULT_WEEKS = 8;
const MAX_WEEKS = 26;

interface PersonRow {
  crm_user_id: string;
  display_name: string;
  delivery_role_slug: string | null;
  free_hours: string;
  over_allocated: boolean;
  weeks_covered: number;
}

interface RoleRow {
  delivery_role_slug: string;
  people_count: number;
  free_hours: string;
}

export const availabilityRouter = router({
  /**
   * Availability for the window an estimate actually covers.
   *
   * One round trip for the whole roster rather than one per team line —
   * `costModel.roleUsage` makes the same call, for the same reason.
   */
  forEstimate: protectedProcedure
    .input(z.object({ estimateId: z.string().uuid() }))
    .query(async ({ input }) => {
      if (process.env.EOPS_AVAILABILITY_DISABLED === '1') {
        return { status: 'unavailable' as const, reason: 'disabled' as const };
      }

      const [estimate] = await db
        .select({ engagementWeeks: estimates.engagementWeeks })
        .from(estimates)
        .where(eq(estimates.id, input.estimateId))
        .limit(1);

      // decimal(6,2) arrives as a string; nobody may have decided yet.
      const declared = estimate?.engagementWeeks ? Number(estimate.engagementWeeks) : NaN;
      const weeks = Number.isFinite(declared)
        ? Math.min(Math.max(Math.ceil(declared), 1), MAX_WEEKS)
        : DEFAULT_WEEKS;

      try {
        // minutes / 60.0 in SQL, per the contract: the views are integer minutes
        // and `estimate_team_lines.hours` is numeric, which arrives as a string.
        // Converting here keeps the two comparable without parsing in JS.
        const peopleResult = await db.execute(sql`
          SELECT crm_user_id,
                 display_name,
                 delivery_role_slug,
                 (SUM(free_minutes) / 60.0)::text AS free_hours,
                 bool_or(is_over_allocated)       AS over_allocated,
                 COUNT(*)::int                    AS weeks_covered
          FROM eops.v_person_availability
          WHERE week_start >= date_trunc('week', CURRENT_DATE)::date
            AND week_start <  (date_trunc('week', CURRENT_DATE) + make_interval(weeks => ${weeks}))::date
          GROUP BY crm_user_id, display_name, delivery_role_slug
        `);

        const rolesResult = await db.execute(sql`
          SELECT delivery_role_slug,
                 MAX(people_count)::int           AS people_count,
                 (SUM(free_minutes) / 60.0)::text AS free_hours
          FROM eops.v_role_availability
          WHERE week_start >= date_trunc('week', CURRENT_DATE)::date
            AND week_start <  (date_trunc('week', CURRENT_DATE) + make_interval(weeks => ${weeks}))::date
          GROUP BY delivery_role_slug
        `);

        return {
          status: 'ok' as const,
          windowWeeks: weeks,
          people: asRows<PersonRow>(peopleResult).map((r) => ({
            userId: r.crm_user_id,
            displayName: r.display_name,
            deliveryRoleSlug: r.delivery_role_slug,
            freeHours: Number(r.free_hours),
            overAllocated: r.over_allocated,
            weeksCovered: r.weeks_covered,
          })),
          roles: asRows<RoleRow>(rolesResult).map((r) => ({
            slug: r.delivery_role_slug,
            peopleCount: r.people_count,
            freeHours: Number(r.free_hours),
          })),
        };
      } catch (err) {
        const reason = absenceReason(err);
        if (reason) return { status: 'unavailable' as const, reason };
        throw err;
      }
    }),
});

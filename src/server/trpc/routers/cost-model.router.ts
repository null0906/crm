import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, asc, count, eq, isNull, or, sql } from 'drizzle-orm';
import { financialProcedure, protectedProcedure, router } from '../router';
import { requirePermission } from '../middleware';
import { db } from '@/server/db';
import {
  deliveryRoles,
  effortBaselineLines,
  estimateTeamLines,
  gnrPolicies,
  marginTargets,
  resourceCostComponents,
  supportCostPolicies,
  userDeliveryRoles,
  users,
} from '@/server/db/schema';
import { auditFinancialRead } from '@/server/lib/financial-access';
import { writeAuditLog } from '@/server/services/audit.service';
import {
  computeCost,
  computeMargin,
  resolveMarginTarget,
} from '@/server/services/cost-engine.service';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

const teamMember = z.object({
  deliveryRoleId: z.string().uuid(),
  userId: z.string().uuid().nullish(),
  hours: z.number().positive().max(20800),
  resourceCount: z.number().int().positive().max(200).default(1),
  overrides: z
    .object({
      base: z.number().nonnegative().optional(),
      seat: z.number().nonnegative().optional(),
      support: z.number().nonnegative().optional(),
    })
    .optional(),
});

const costInput = z.object({
  team: z.array(teamMember).min(1, 'An estimate needs at least one resource.'),
  nonLabour: z
    .array(
      z.object({
        label: z.string().trim().min(1),
        amount: z.number().nonnegative(),
        passThrough: z.boolean().default(false),
      })
    )
    .optional(),
  customLines: z
    .array(
      z.object({
        label: z.string().trim().min(1),
        amount: z.number(),
        basis: z.enum(['per_resource_hour', 'engagement']),
        passThrough: z.boolean().optional(),
      })
    )
    .optional(),
  asOf: isoDate.optional(),
  gnrPolicyId: z.string().uuid().nullish(),
  gnrRatePercentOverride: z.number().min(0).max(100).nullish(),
  currency: z.string().length(3).optional(),
});

export const costModelRouter = router({
  // ---------------------------------------------------------------- roles --
  // Delivery roles carry no money, so they are readable by any authenticated
  // user — the estimate builder needs them to describe a team shape.
  listRoles: protectedProcedure
    .input(z.object({ includeInactive: z.boolean().default(false) }).optional())
    .query(async ({ input }) => {
      const rows = await db
        .select()
        .from(deliveryRoles)
        .where(input?.includeInactive ? sql`true` : eq(deliveryRoles.isActive, true))
        .orderBy(asc(deliveryRoles.position), asc(deliveryRoles.name));
      return rows;
    }),

  createRole: financialProcedure
    .input(
      z.object({
        name: z.string().trim().min(2).max(100),
        slug: z
          .string()
          .trim()
          .min(2)
          .max(100)
          .regex(/^[a-z0-9_]+$/, 'Lowercase letters, digits and underscores only'),
        description: z.string().trim().nullish(),
        position: z.number().int().min(0).default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [created] = await db
        .insert(deliveryRoles)
        .values({ ...input, createdBy: ctx.user.id })
        .returning();

      await writeAuditLog({
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        action: 'create',
        entityType: 'delivery_role',
        entityId: created!.id,
        entityName: created!.name,
      });
      return created;
    }),

  /**
   * Rename, describe, reposition or retire a role.
   *
   * The slug is deliberately not editable: it is the stable identifier other
   * lookups key on, so renaming it would silently break them. `isActive: false`
   * is how a role in use gets retired — it disappears from every picker while
   * the estimates and baselines that already name it keep resolving.
   */
  updateRole: financialProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().trim().min(2).max(100).optional(),
        description: z.string().trim().nullish(),
        position: z.number().int().min(0).optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input;
      const patch = Object.fromEntries(
        Object.entries(fields).filter(([, v]) => v !== undefined)
      );
      if (Object.keys(patch).length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nothing to update.' });
      }

      const [updated] = await db
        .update(deliveryRoles)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(deliveryRoles.id, id))
        .returning();
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Delivery role not found.' });

      await writeAuditLog({
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        action: 'update',
        entityType: 'delivery_role',
        entityId: updated.id,
        entityName: updated.name,
        metadata: { ...patch, financialWrite: true },
      });
      return updated;
    }),

  /**
   * Positions are rewritten wholesale rather than swapped in pairs: existing
   * rows disagree about the column (roles created before the tab passed a
   * position all sit at 0), so a swap has nothing meaningful to swap. Sending
   * the whole ordering normalises it on the way through.
   */
  reorderRoles: financialProcedure
    .input(
      z
        .array(z.object({ id: z.string().uuid(), position: z.number().int().min(0) }))
        .min(1)
        .max(200)
    )
    .mutation(async ({ ctx, input }) => {
      await db.transaction(async (tx) => {
        for (const row of input) {
          await tx
            .update(deliveryRoles)
            .set({ position: row.position, updatedAt: new Date() })
            .where(eq(deliveryRoles.id, row.id));
        }
      });

      await writeAuditLog({
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        action: 'update',
        entityType: 'delivery_role',
        metadata: { reordered: true, count: input.length },
      });
      return { count: input.length };
    }),

  /**
   * What still points at each role, so the tab can offer a real delete only
   * where one is safe and fall back to deactivation everywhere else. Batched
   * for every role at once — a per-row query would be N round trips to render
   * one column.
   *
   * The `rates` count is now entirely historical: no role-scoped rate can be
   * created any more. It is deliberately still counted, because
   * `delivery_role_id` cascades on delete — removing a role would take its
   * closed base rates with it and break the reproduction of every estimate
   * dated before pricing moved to people. The guard stopped protecting live
   * pricing and started protecting the archive.
   */
  roleUsage: financialProcedure.query(async () => {
    const [staff, baselineLines, estimateLines, rates] = await Promise.all([
      db
        .select({ id: userDeliveryRoles.deliveryRoleId, n: count() })
        .from(userDeliveryRoles)
        .groupBy(userDeliveryRoles.deliveryRoleId),
      db
        .select({ id: effortBaselineLines.deliveryRoleId, n: count() })
        .from(effortBaselineLines)
        .groupBy(effortBaselineLines.deliveryRoleId),
      db
        .select({ id: estimateTeamLines.deliveryRoleId, n: count() })
        .from(estimateTeamLines)
        .groupBy(estimateTeamLines.deliveryRoleId),
      db
        .select({ id: resourceCostComponents.deliveryRoleId, n: count() })
        .from(resourceCostComponents)
        .where(eq(resourceCostComponents.scope, 'role'))
        .groupBy(resourceCostComponents.deliveryRoleId),
    ]);

    const roles = await db.select({ id: deliveryRoles.id }).from(deliveryRoles);
    const lookup = (rows: { id: string | null; n: number }[], roleId: string) =>
      Number(rows.find((r) => r.id === roleId)?.n ?? 0);

    return roles.map((r) => ({
      deliveryRoleId: r.id,
      staff: lookup(staff, r.id),
      baselineLines: lookup(baselineLines, r.id),
      estimateLines: lookup(estimateLines, r.id),
      rates: lookup(rates, r.id),
    }));
  }),

  /**
   * A real delete, and only where nothing references the role.
   *
   * Role-scoped rates cascade away with it. That is safe precisely because the
   * guard below proves no estimate and no baseline can still be resolving
   * against them — otherwise retiring the role, not deleting it, is the answer.
   */
  deleteRole: financialProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [role] = await db
        .select()
        .from(deliveryRoles)
        .where(eq(deliveryRoles.id, input.id))
        .limit(1);
      if (!role) throw new TRPCError({ code: 'NOT_FOUND', message: 'Delivery role not found.' });

      // Recounted here rather than trusted from the client: the tab's usage
      // snapshot can be minutes old by the time someone confirms the dialog.
      const [[staff], [baselineLines], [estimateLines], [rates]] = await Promise.all([
        db
          .select({ n: count() })
          .from(userDeliveryRoles)
          .where(eq(userDeliveryRoles.deliveryRoleId, input.id)),
        db
          .select({ n: count() })
          .from(effortBaselineLines)
          .where(eq(effortBaselineLines.deliveryRoleId, input.id)),
        db
          .select({ n: count() })
          .from(estimateTeamLines)
          .where(eq(estimateTeamLines.deliveryRoleId, input.id)),
        db
          .select({ n: count() })
          .from(resourceCostComponents)
          .where(
            and(
              eq(resourceCostComponents.scope, 'role'),
              eq(resourceCostComponents.deliveryRoleId, input.id)
            )
          ),
      ]);

      const blockers: string[] = [];
      const people = Number(staff?.n ?? 0);
      const baselines = Number(baselineLines?.n ?? 0);
      const estimates = Number(estimateLines?.n ?? 0);
      if (people > 0) blockers.push(`${people} ${people === 1 ? 'person is' : 'people are'} assigned to it`);
      if (baselines > 0) blockers.push(`it appears on ${baselines} effort baseline ${baselines === 1 ? 'line' : 'lines'}`);
      if (estimates > 0) blockers.push(`it appears on ${estimates} estimate ${estimates === 1 ? 'line' : 'lines'}`);

      if (blockers.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot delete ${role.name} — ${blockers.join(', and ')}. Deactivate it instead to hide it from new work.`,
        });
      }

      try {
        await db.delete(deliveryRoles).where(eq(deliveryRoles.id, input.id));
      } catch (err) {
        // Something referenced the role between the count and the delete.
        // Postgres caught it; report it the same way rather than as a 500.
        const code = (err as { cause?: { code?: string }; code?: string }).code
          ?? (err as { cause?: { code?: string } }).cause?.code;
        if (code === '23503') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Cannot delete ${role.name} — something started using it just now. Reload and try again, or deactivate it instead.`,
          });
        }
        throw err;
      }

      await writeAuditLog({
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        action: 'delete',
        entityType: 'delivery_role',
        entityId: role.id,
        entityName: role.name,
        metadata: { ratesRemoved: Number(rates?.n ?? 0), financialWrite: true },
      });
      return { success: true };
    }),

  /**
   * Who does what on an engagement.
   *
   * Gated on user management rather than financial access: a delivery role is
   * an org fact, not a cost one, and it is set from the Users page alongside
   * the platform role. What a role or a person *costs* stays behind
   * `financialProcedure` — nothing salary-derived is reachable from here.
   */
  assignRoleToUser: protectedProcedure
    .use(requirePermission('users', 'manage'))
    .input(
      z.object({
        userId: z.string().uuid(),
        /** Null takes the role away rather than assigning one. */
        deliveryRoleId: z.string().uuid().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const actor = ctx.user!;

      if (input.deliveryRoleId === null) {
        await db.delete(userDeliveryRoles).where(eq(userDeliveryRoles.userId, input.userId));
        await writeAuditLog({
          userId: actor.id,
          userEmail: actor.email,
          action: 'assign',
          entityType: 'user_delivery_role',
          entityId: input.userId,
          metadata: { deliveryRoleId: null, removed: true },
        });
        return null;
      }

      const [row] = await db
        .insert(userDeliveryRoles)
        .values({
          userId: input.userId,
          deliveryRoleId: input.deliveryRoleId,
          assignedBy: actor.id,
        })
        .onConflictDoUpdate({
          target: userDeliveryRoles.userId,
          set: { deliveryRoleId: input.deliveryRoleId, assignedBy: actor.id, updatedAt: new Date() },
        })
        .returning();

      await writeAuditLog({
        userId: actor.id,
        userEmail: actor.email,
        action: 'assign',
        entityType: 'user_delivery_role',
        entityId: input.userId,
        metadata: { deliveryRoleId: input.deliveryRoleId },
      });
      return row;
    }),

  listStaffWithRoles: financialProcedure.query(async () => {
    return db
      .select({
        userId: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        deliveryRoleId: userDeliveryRoles.deliveryRoleId,
        deliveryRoleName: deliveryRoles.name,
      })
      .from(users)
      .leftJoin(userDeliveryRoles, eq(userDeliveryRoles.userId, users.id))
      .leftJoin(deliveryRoles, eq(deliveryRoles.id, userDeliveryRoles.deliveryRoleId))
      .where(eq(users.status, 'active'))
      .orderBy(asc(users.firstName));
  }),

  // ------------------------------------------------------ cost components --
  listComponents: financialProcedure
    .input(z.object({ asOf: isoDate.optional(), currentOnly: z.boolean().default(true) }).optional())
    .query(async ({ ctx, input }) => {
      const asOf = input?.asOf ?? new Date().toISOString().slice(0, 10);

      const rows = await db
        .select({
          id: resourceCostComponents.id,
          scope: resourceCostComponents.scope,
          deliveryRoleId: resourceCostComponents.deliveryRoleId,
          deliveryRoleName: deliveryRoles.name,
          userId: resourceCostComponents.userId,
          component: resourceCostComponents.component,
          amountPerHour: resourceCostComponents.amountPerHour,
          currency: resourceCostComponents.currency,
          effectiveFrom: resourceCostComponents.effectiveFrom,
          effectiveTo: resourceCostComponents.effectiveTo,
          notes: resourceCostComponents.notes,
        })
        .from(resourceCostComponents)
        .leftJoin(deliveryRoles, eq(deliveryRoles.id, resourceCostComponents.deliveryRoleId))
        .where(
          input?.currentOnly === false
            ? sql`true`
            : and(
                sql`${resourceCostComponents.effectiveFrom} <= ${asOf}`,
                or(
                  isNull(resourceCostComponents.effectiveTo),
                  sql`${resourceCostComponents.effectiveTo} >= ${asOf}`
                )
              )
        )
        .orderBy(asc(resourceCostComponents.component), asc(resourceCostComponents.scope));

      // NFR-SEC-07: reads of individual cost rates are audited.
      auditFinancialRead(ctx.user, 'resource_cost_component', { asOf, rows: rows.length });
      return rows;
    }),

  setComponent: financialProcedure
    .input(
      z
        .object({
          scope: z.enum(['default', 'role', 'employee']),
          deliveryRoleId: z.string().uuid().nullish(),
          userId: z.string().uuid().nullish(),
          component: z.enum(['base', 'seat']),
          amountPerHour: z.number().nonnegative(),
          currency: z.string().length(3).default('INR'),
          effectiveFrom: isoDate,
          notes: z.string().trim().nullish(),
        })
        .refine((v) => v.scope !== 'role' || !!v.deliveryRoleId, {
          message: 'A role-scoped rate must name a delivery role.',
          path: ['deliveryRoleId'],
        })
        .refine((v) => v.scope !== 'employee' || !!v.userId, {
          message: 'An employee-scoped rate must name a user.',
          path: ['userId'],
        })
        .refine((v) => v.scope !== 'default' || (!v.deliveryRoleId && !v.userId), {
          message: 'A default rate applies company-wide and must not name a role or user.',
          path: ['scope'],
        })
        // Mirrors cost_components_seat_is_employee_check. Seat is the cost of
        // employing a particular person, so a role-wide seat rate is a category
        // error rather than a permissive default.
        .refine((v) => v.component !== 'seat' || v.scope === 'employee', {
          message: 'Seat cost belongs to a person. Set it against an employee, not a role.',
          path: ['component'],
        })
        // Mirrors cost_components_base_is_employee_check. A role rate is an
        // average of what several people are paid, which is not a cost anyone
        // actually incurs; pricing an engagement on one is only accidentally
        // right about whoever ends up on it.
        .refine((v) => v.component !== 'base' || v.scope === 'employee', {
          message:
            'Cost is set per person. Set this against the individual in Settings → Cost Model → Cost Rates.',
          path: ['component'],
        })
    )
    .mutation(async ({ ctx, input }) => {
      // Effective dating is append-only (NFR-REP-02): close the standing row
      // rather than editing it, so historic estimates still reproduce.
      return db.transaction(async (tx) => {
        const scopeMatch = and(
          eq(resourceCostComponents.component, input.component),
          eq(resourceCostComponents.scope, input.scope),
          input.deliveryRoleId
            ? eq(resourceCostComponents.deliveryRoleId, input.deliveryRoleId)
            : isNull(resourceCostComponents.deliveryRoleId),
          input.userId
            ? eq(resourceCostComponents.userId, input.userId)
            : isNull(resourceCostComponents.userId),
          isNull(resourceCostComponents.effectiveTo)
        );

        await tx
          .update(resourceCostComponents)
          .set({
            effectiveTo: sql`(${input.effectiveFrom}::date - INTERVAL '1 day')::date`,
            updatedAt: new Date(),
          })
          .where(scopeMatch);

        const [created] = await tx
          .insert(resourceCostComponents)
          .values({
            scope: input.scope,
            deliveryRoleId: input.deliveryRoleId ?? null,
            userId: input.userId ?? null,
            component: input.component,
            amountPerHour: input.amountPerHour.toString(),
            currency: input.currency,
            effectiveFrom: input.effectiveFrom,
            notes: input.notes ?? null,
            createdBy: ctx.user.id,
          })
          .returning();

        await writeAuditLog({
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          action: 'create',
          entityType: 'resource_cost_component',
          entityId: created!.id,
          entityName: `${input.scope}/${input.component}`,
          metadata: { effectiveFrom: input.effectiveFrom, financialWrite: true },
        });

        return created;
      });
    }),

  // --------------------------------------------------------- support ------
  /** The overhead default seeded onto each new estimate as a cost line. */
  getSupportPolicy: financialProcedure
    .input(z.object({ asOf: isoDate.optional() }).optional())
    .query(async ({ input }) => {
      const asOf = input?.asOf ?? new Date().toISOString().slice(0, 10);
      const [policy] = await db
        .select()
        .from(supportCostPolicies)
        .where(
          and(
            sql`${supportCostPolicies.effectiveFrom} <= ${asOf}`,
            or(
              isNull(supportCostPolicies.effectiveTo),
              sql`${supportCostPolicies.effectiveTo} >= ${asOf}`
            )
          )
        )
        .orderBy(
          sql`${supportCostPolicies.effectiveFrom} DESC`,
          sql`${supportCostPolicies.version} DESC`
        )
        .limit(1);
      return policy ?? null;
    }),

  /** A new amount is a new version, so estimates already built are unaffected. */
  setSupportPolicy: financialProcedure
    .input(
      z.object({
        name: z.string().trim().min(2).max(100).default('Standard support'),
        label: z.string().trim().min(2).max(150).default('Support & overhead'),
        amount: z.number().nonnegative(),
        basis: z.enum(['engagement', 'per_resource_hour']).default('engagement'),
        effectiveFrom: isoDate,
        notes: z.string().trim().nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [{ maxVersion } = { maxVersion: 0 }] = await db
        .select({ maxVersion: sql<number>`COALESCE(MAX(${supportCostPolicies.version}), 0)::int` })
        .from(supportCostPolicies)
        .where(eq(supportCostPolicies.name, input.name));

      const [created] = await db
        .insert(supportCostPolicies)
        .values({
          name: input.name,
          version: Number(maxVersion) + 1,
          label: input.label,
          amount: input.amount.toString(),
          basis: input.basis,
          effectiveFrom: input.effectiveFrom,
          notes: input.notes ?? null,
          createdBy: ctx.user.id,
        })
        .returning();

      await writeAuditLog({
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        action: 'update',
        entityType: 'support_cost_policy',
        entityId: created!.id,
        entityName: `${created!.name} v${created!.version}`,
        metadata: { amount: input.amount, basis: input.basis, financialWrite: true },
      });
      return created;
    }),

  // ------------------------------------------------------------- GNR ------
  listGnrPolicies: financialProcedure.query(async ({ ctx }) => {
    auditFinancialRead(ctx.user, 'gnr_policy');
    return db
      .select()
      .from(gnrPolicies)
      .orderBy(sql`${gnrPolicies.effectiveFrom} DESC`, sql`${gnrPolicies.version} DESC`);
  }),

  createGnrPolicy: financialProcedure
    .input(
      z.object({
        name: z.string().trim().min(2).max(100),
        ratePercent: z.number().min(0).max(100),
        appliesTo: z.enum(['total', 'labour_only']).default('total'),
        effectiveFrom: isoDate,
        notes: z.string().trim().nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [{ maxVersion } = { maxVersion: 0 }] = await db
        .select({ maxVersion: sql<number>`COALESCE(MAX(${gnrPolicies.version}), 0)::int` })
        .from(gnrPolicies)
        .where(eq(gnrPolicies.name, input.name));

      const [created] = await db
        .insert(gnrPolicies)
        .values({
          name: input.name,
          version: Number(maxVersion) + 1,
          ratePercent: input.ratePercent.toString(),
          appliesTo: input.appliesTo,
          effectiveFrom: input.effectiveFrom,
          notes: input.notes ?? null,
          createdBy: ctx.user.id,
        })
        .returning();

      await writeAuditLog({
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        action: 'create',
        entityType: 'gnr_policy',
        entityId: created!.id,
        entityName: `${created!.name} v${created!.version}`,
        metadata: { ratePercent: input.ratePercent, financialWrite: true },
      });
      return created;
    }),

  // ---------------------------------------------------------- estimating --
  /** Full cost breakdown. Financial access required — no redacted variant. */
  estimateCost: financialProcedure.input(costInput).query(async ({ ctx, input }) => {
    const breakdown = await computeCost(input);
    auditFinancialRead(ctx.user, 'cost_estimate', {
      resources: input.team.length,
      totalHours: breakdown.totalHours,
    });
    return breakdown;
  }),

  /**
   * Price a team shape and report margin against it.
   * Margin is guidance, not the price (FR-P4-28).
   */
  priceEngagement: financialProcedure
    .input(
      costInput.extend({
        price: z.number().nonnegative(),
        targetMarginPercent: z.number().min(0).max(100).nullish(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { price, targetMarginPercent, ...costArgs } = input;
      const breakdown = await computeCost(costArgs);
      const margin = computeMargin(breakdown.totalDeliveryCost, price, targetMarginPercent);

      auditFinancialRead(ctx.user, 'cost_estimate', { priced: true });
      return { breakdown, margin };
    }),

  // ---------------------------------------------------- margin targets ---
  // A target margin is aspirational and reveals no cost, so resolving one is
  // open. The actual margin on an estimate is a different matter: combined with
  // a visible price it gives you the cost, and is redacted.
  resolveMarginTarget: protectedProcedure
    .input(z.object({ serviceLine: z.string().trim().max(50).nullish(), asOf: isoDate.optional() }))
    .query(async ({ input }) =>
      resolveMarginTarget(
        input.serviceLine ?? null,
        input.asOf ?? new Date().toISOString().slice(0, 10)
      )
    ),

  listMarginTargets: financialProcedure
    .input(z.object({ currentOnly: z.boolean().default(true) }).optional())
    .query(async ({ input }) => {
      const asOf = new Date().toISOString().slice(0, 10);
      return db
        .select()
        .from(marginTargets)
        .where(
          input?.currentOnly === false
            ? sql`true`
            : and(
                sql`${marginTargets.effectiveFrom} <= ${asOf}`,
                or(isNull(marginTargets.effectiveTo), sql`${marginTargets.effectiveTo} >= ${asOf}`)
              )
        )
        .orderBy(asc(marginTargets.serviceLine), asc(marginTargets.effectiveFrom));
    }),

  /**
   * Append-only, like cost rates: a new target closes the standing row rather
   * than editing it, so an estimate priced last quarter still explains itself.
   */
  setMarginTarget: financialProcedure
    .input(
      z
        .object({
          // '*' is the company-wide default.
          serviceLine: z.string().trim().max(50).default('*'),
          segment: z.string().trim().max(50).default('standard'),
          targetMarginPercent: z.number().min(0).max(100),
          floorMarginPercent: z.number().min(0).max(100).nullish(),
          effectiveFrom: isoDate,
          notes: z.string().trim().nullish(),
        })
        .refine(
          (v) => v.floorMarginPercent == null || v.floorMarginPercent <= v.targetMarginPercent,
          {
            message: 'The floor cannot be above the target, or every compliant price would warn.',
            path: ['floorMarginPercent'],
          }
        )
    )
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        await tx
          .update(marginTargets)
          .set({
            effectiveTo: sql`(${input.effectiveFrom}::date - INTERVAL '1 day')::date`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(marginTargets.serviceLine, input.serviceLine),
              eq(marginTargets.segment, input.segment),
              isNull(marginTargets.effectiveTo)
            )
          );

        const [created] = await tx
          .insert(marginTargets)
          .values({
            serviceLine: input.serviceLine,
            segment: input.segment,
            targetMarginPercent: input.targetMarginPercent.toString(),
            floorMarginPercent: input.floorMarginPercent?.toString() ?? null,
            effectiveFrom: input.effectiveFrom,
            notes: input.notes ?? null,
            createdBy: ctx.user.id,
          })
          .returning();

        await writeAuditLog({
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          action: 'update',
          entityType: 'margin_target',
          entityId: created!.id,
          entityName: input.serviceLine,
          metadata: {
            targetMarginPercent: input.targetMarginPercent,
            floorMarginPercent: input.floorMarginPercent ?? null,
            financialWrite: true,
          },
        });
        return created;
      });
    }),

  /**
   * Removing a target is closing it, not deleting it — an estimate priced
   * against it last quarter still has to explain itself.
   *
   * The close date is yesterday so the target stops applying immediately, but
   * never earlier than the day it started: the table's date-range check would
   * reject that. A target set today can therefore only be closed as of today
   * and stays in force until tomorrow, which the confirm dialog says out loud.
   */
  closeMarginTarget: financialProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await db
        .select()
        .from(marginTargets)
        .where(eq(marginTargets.id, input.id))
        .limit(1);
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Margin target not found.' });
      if (existing.effectiveTo !== null) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'That target is already closed.' });
      }

      const [closed] = await db
        .update(marginTargets)
        .set({
          effectiveTo: sql`GREATEST(${marginTargets.effectiveFrom}, (CURRENT_DATE - INTERVAL '1 day')::date)`,
          updatedAt: new Date(),
        })
        .where(eq(marginTargets.id, input.id))
        .returning();

      await writeAuditLog({
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        action: 'update',
        entityType: 'margin_target',
        entityId: input.id,
        entityName: existing.serviceLine,
        metadata: {
          closed: true,
          effectiveTo: closed?.effectiveTo ?? null,
          financialWrite: true,
        },
      });
      return closed;
    }),

  // -------------------------------------------------------- entitlement ---
  /**
   * Granting financial access is itself a privileged act, restricted to super
   * admins so an entitled user cannot widen the circle.
   */
  setFinancialAccess: protectedProcedure
    .input(z.object({ userId: z.string().uuid(), hasFinancialAccess: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role.slug !== 'super_admin') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only a super admin can grant or revoke financial access.',
        });
      }

      const [target] = await db
        .select({ id: users.id, email: users.email, had: users.hasFinancialAccess })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);
      if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' });

      await db
        .update(users)
        .set({ hasFinancialAccess: input.hasFinancialAccess, updatedAt: new Date() })
        .where(eq(users.id, input.userId));

      await writeAuditLog({
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        action: 'permission_change',
        entityType: 'user',
        entityId: input.userId,
        entityName: target.email,
        changes: {
          hasFinancialAccess: { old: target.had, new: input.hasFinancialAccess },
        },
      });

      return { userId: input.userId, hasFinancialAccess: input.hasFinancialAccess };
    }),
});

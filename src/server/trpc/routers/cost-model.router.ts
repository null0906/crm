import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';
import { financialProcedure, protectedProcedure, router } from '../router';
import { db } from '@/server/db';
import {
  deliveryRoles,
  gnrPolicies,
  marginTargets,
  resourceCostComponents,
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
  weeks: z.number().positive().max(520),
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
        basis: z.enum(['per_resource_week', 'engagement']),
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

  assignRoleToUser: financialProcedure
    .input(z.object({ userId: z.string().uuid(), deliveryRoleId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .insert(userDeliveryRoles)
        .values({ ...input, assignedBy: ctx.user.id })
        .onConflictDoUpdate({
          target: userDeliveryRoles.userId,
          set: { deliveryRoleId: input.deliveryRoleId, assignedBy: ctx.user.id, updatedAt: new Date() },
        })
        .returning();

      await writeAuditLog({
        userId: ctx.user.id,
        userEmail: ctx.user.email,
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
          amountPerWeek: resourceCostComponents.amountPerWeek,
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
          component: z.enum(['base', 'seat', 'support']),
          amountPerWeek: z.number().nonnegative(),
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
            amountPerWeek: input.amountPerWeek.toString(),
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
      totalWeeks: breakdown.totalWeeks,
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

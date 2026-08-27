import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { desc, eq } from 'drizzle-orm';
import { financialProcedure, protectedProcedure, router } from '../router';
import { db } from '@/server/db';
import { estimates } from '@/server/db/schema';
import { auditFinancialRead, canSeeFinancials, redactFinancials } from '@/server/lib/financial-access';
import { writeAuditLog } from '@/server/services/audit.service';
import {
  applyDriverAnswers,
  approveEstimate,
  compareEstimates,
  createEstimate,
  deleteDraft,
  duplicateEstimate,
  EstimateFrozenError,
  getEstimateDetail,
  recalculate,
  replaceCostLines,
  replaceTeamLines,
  saveCommercials,
} from '@/server/services/estimate.service';

/**
 * Estimates (FR-P4-41 basis, FR-P4-47 freeze).
 *
 * Everything that returns cost is gated on the financial entitlement. The one
 * exception is `listForDeal`, so a deal owner can see that an estimate exists
 * and what state it is in without seeing what it cost — the figures are nulled
 * through the shared redaction helper rather than by hand.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

/** Maps the service-layer freeze error onto a tRPC code the UI can act on. */
function rethrow(error: unknown): never {
  if (error instanceof EstimateFrozenError) {
    throw new TRPCError({ code: 'CONFLICT', message: error.message });
  }
  throw error;
}

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    return rethrow(error);
  }
}

export const estimatesRouter = router({
  /**
   * Deliberately not gated. Returns state, not money — cost, price and margin
   * are nulled for callers without the entitlement.
   */
  listForDeal: protectedProcedure
    .input(z.object({ dealId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await db
        .select({
          id: estimates.id,
          title: estimates.title,
          status: estimates.status,
          serviceLine: estimates.serviceLine,
          currency: estimates.currency,
          asOfDate: estimates.asOfDate,
          totalDeliveryCost: estimates.totalDeliveryCost,
          price: estimates.price,
          marginPercent: estimates.marginPercent,
          approvedAt: estimates.approvedAt,
          createdAt: estimates.createdAt,
        })
        .from(estimates)
        .where(eq(estimates.dealId, input.dealId))
        .orderBy(desc(estimates.createdAt));

      const visible = rows.map((r) => ({
        ...r,
        totalDeliveryCost: r.totalDeliveryCost === null ? null : Number(r.totalDeliveryCost),
        price: r.price === null ? null : Number(r.price),
        marginPercent: r.marginPercent === null ? null : Number(r.marginPercent),
      }));

      return {
        estimates: redactFinancials(ctx.user, visible),
        canSeeFinancials: canSeeFinancials(ctx.user),
      };
    }),

  list: financialProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }).optional())
    .query(async ({ input }) => {
      return db
        .select()
        .from(estimates)
        .orderBy(desc(estimates.createdAt))
        .limit(input?.limit ?? 50);
    }),

  getById: financialProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const detail = await getEstimateDetail(input.id);
      if (!detail) throw new TRPCError({ code: 'NOT_FOUND', message: 'Estimate not found.' });
      const { breakdown, margin } = await recalculate(input.id);

      auditFinancialRead(ctx.user, 'estimate', { estimateId: input.id });
      return { ...detail, breakdown, margin };
    }),

  create: financialProcedure
    .input(
      z.object({
        dealId: z.string().uuid().nullish(),
        companyId: z.string().uuid().nullish(),
        title: z.string().trim().min(2).max(200),
        serviceLine: z.string().trim().max(50).nullish(),
        baselineId: z.string().uuid().nullish(),
        asOfDate: isoDate.optional(),
        currency: z.string().length(3).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await createEstimate({ ...input, createdBy: ctx.user.id });
      await writeAuditLog({
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        action: 'create',
        entityType: 'estimate',
        entityId: result.id,
        entityName: input.title,
      });
      return result;
    }),

  updateTeam: financialProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        lines: z.array(
          z.object({
            deliveryRoleId: z.string().uuid(),
            userId: z.string().uuid().nullish(),
            deliveryStage: z.string().trim().max(40).nullish(),
            resourceCount: z.number().int().positive().max(200),
            hours: z.number().positive().max(20800),
            overrideBase: z.number().nonnegative().nullish(),
            overrideSeat: z.number().nonnegative().nullish(),
          })
        ),
      })
    )
    .mutation(async ({ input }) =>
      run(async () => {
        await replaceTeamLines(input.id, input.lines);
        return { id: input.id };
      })
    ),

  updateCostLines: financialProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        lines: z.array(
          z.object({
            kind: z.enum(['non_labour', 'custom']),
            label: z.string().trim().min(1).max(150),
            amount: z.number(),
            basis: z.enum(['engagement', 'per_resource_hour']).default('engagement'),
            passThrough: z.boolean().default(false),
          })
        ),
      })
    )
    .mutation(async ({ input }) =>
      run(async () => {
        await replaceCostLines(input.id, input.lines);
        return { id: input.id };
      })
    ),

  updateDrivers: financialProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        answers: z.array(
          z.object({
            driverId: z.string().uuid(),
            optionId: z.string().uuid().nullish(),
            numericValue: z.number().min(0).max(1_000_000).nullish(),
            source: z.string().trim().max(60).nullish(),
            answerConfidence: z.enum(['low', 'medium', 'high']).nullish(),
          })
        ),
      })
    )
    .mutation(async ({ input }) => run(() => applyDriverAnswers(input.id, input.answers))),

  save: financialProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().trim().min(2).max(200).optional(),
        price: z.number().nonnegative().nullish(),
        targetMarginPercent: z.number().min(0).max(100).nullish(),
        asOfDate: isoDate.optional(),
        gnrPolicyId: z.string().uuid().nullish(),
        /** null clears the override and falls back to the effective policy. */
        gnrRateOverride: z.number().min(0).max(100).nullish(),
        gnrExcluded: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) =>
      run(async () => {
        const { id, ...rest } = input;
        await saveCommercials(id, rest);
        return { id };
      })
    ),

  /** Freezes the estimate. Irreversible — duplicate to explore alternatives. */
  approve: financialProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) =>
      run(async () => {
        const breakdown = await approveEstimate(input.id, ctx.user.id);
        await writeAuditLog({
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          action: 'update',
          entityType: 'estimate',
          entityId: input.id,
          metadata: { approved: true, totalDeliveryCost: breakdown.totalDeliveryCost },
        });
        return breakdown;
      })
    ),

  duplicate: financialProcedure
    .input(z.object({ id: z.string().uuid(), title: z.string().trim().min(2).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const id = await duplicateEstimate(input.id, ctx.user.id, input.title);
      return { id };
    }),

  compare: financialProcedure
    .input(z.object({ ids: z.array(z.string().uuid()).min(2).max(5) }))
    .query(async ({ input }) => compareEstimates(input.ids)),

  delete: financialProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) =>
      run(async () => {
        await deleteDraft(input.id);
        await writeAuditLog({
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          action: 'delete',
          entityType: 'estimate',
          entityId: input.id,
        });
        return { id: input.id };
      })
    ),
});

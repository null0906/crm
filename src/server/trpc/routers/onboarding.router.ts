import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { protectedProcedure, router } from '../router';
import * as service from '@/server/services/onboarding.service';

const stage = z.enum(['documents_pending','documents_sent','documents_signed','payment_pending','payment_received','kickoff_scheduled','completed','cancelled']);
const documentStatus = z.enum(['not_required','pending','sent','signed']);
const admin = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role.slug !== 'super_admin') throw new TRPCError({ code: 'FORBIDDEN', message: 'Onboarding is restricted to super admins.' });
  return next({ ctx });
});

export const onboardingRouter = router({
  list: admin.query(() => service.listOnboardings()),
  eligibleManualDeals: admin.query(() => service.listEligibleManualDeals()),
  createManual: admin.input(z.object({
    dealId: z.string().uuid(),
    reason: z.string().trim().min(3, 'Please explain why this prospect should enter onboarding.'),
  })).mutation(({ ctx, input }) => service.createManualOnboarding(input.dealId, ctx.user.id, input.reason)),
  getById: admin.input(z.object({ id: z.string().uuid() })).query(({ input }) => service.getOnboarding(input.id)),
  update: admin.input(z.object({ id: z.string().uuid(), data: z.object({
    engagementAmount: z.number().nullable().optional(), engagementCurrency: z.string().max(3).optional(),
    amountVarianceReason: z.string().nullable().optional(), paymentTerms: z.string().nullable().optional(),
    paymentTermsNotes: z.string().nullable().optional(), poNumber: z.string().nullable().optional(),
    poReceivedAt: z.string().nullable().optional(), firstPaymentAmount: z.number().nullable().optional(),
    firstPaymentReceivedAt: z.string().nullable().optional(), kickoffScheduledAt: z.string().datetime().nullable().optional(),
    kickoffMeetingLink: z.string().nullable().optional(), kickoffNotes: z.string().nullable().optional(),
    deliveryTeamAssigned: z.array(z.string().uuid()).optional(), notes: z.string().nullable().optional(),
    msaStatus: documentStatus.optional(), ndaStatus: documentStatus.optional(), sowStatus: documentStatus.optional(),
  }) })).mutation(({ ctx, input }) => service.updateOnboarding(input.id, {
    ...input.data,
    engagementAmount: input.data.engagementAmount?.toString(),
    firstPaymentAmount: input.data.firstPaymentAmount?.toString(),
    kickoffScheduledAt: input.data.kickoffScheduledAt === null
      ? null
      : input.data.kickoffScheduledAt
        ? new Date(input.data.kickoffScheduledAt)
        : undefined,
  }, ctx.user.id)),
  moveStage: admin.input(z.object({ id: z.string().uuid(), stage, notes: z.string().optional() }))
    .mutation(({ ctx, input }) => service.moveOnboardingStage(input.id, input.stage, ctx.user.id, input.notes)),
});

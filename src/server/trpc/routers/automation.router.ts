import { z } from 'zod';
import { router, protectedProcedure } from '../router';
import { requirePermission } from '../middleware';
import { getAutomationSettings, updateAutomationSettings, ALLOWED_LEAD_INACTIVITY_PIPELINES } from '@/server/services/automation-settings.service';
import { sendDealInactivityReminders } from '@/server/services/deal-inactivity.service';

export const automationRouter = router({
  getLeadInactivity: protectedProcedure
    .use(requirePermission('digests', 'manage'))
    .query(async () => {
      return getAutomationSettings();
    }),

  updateLeadInactivity: protectedProcedure
    .use(requirePermission('digests', 'manage'))
    .input(z.object({
      leadInactivityEnabled: z.boolean(),
      leadInactivityDays: z.number().int().min(1).max(30),
      leadInactivityCooldownHours: z.number().int().min(1).max(168),
      leadInactivityPipelines: z.array(z.enum(ALLOWED_LEAD_INACTIVITY_PIPELINES)).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      return updateAutomationSettings(ctx.user!.id, input);
    }),

  runLeadInactivityNow: protectedProcedure
    .use(requirePermission('digests', 'manage'))
    .mutation(async () => {
      return sendDealInactivityReminders();
    }),
});

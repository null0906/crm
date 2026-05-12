import { z } from 'zod';
import { router, protectedProcedure } from '../router';
import { requirePermission } from '../middleware';
import { getAutomationSettings, updateAutomationSettings, ALLOWED_LEAD_INACTIVITY_PIPELINES } from '@/server/services/automation-settings.service';
import { sendDealInactivityReminders } from '@/server/services/deal-inactivity.service';
import {
  automationDefinitions,
  listAutomationConfigs,
  runAutomationNow,
  updateAutomationEnabled,
  type AutomationKey,
} from '@/server/services/automation.service';

const automationKeySchema = z.enum(
  automationDefinitions.map((automation) => automation.key) as [AutomationKey, ...AutomationKey[]]
);

export const automationRouter = router({
  list: protectedProcedure
    .use(requirePermission('digests', 'manage'))
    .query(async ({ ctx }) => {
      return listAutomationConfigs(ctx.db);
    }),

  setEnabled: protectedProcedure
    .use(requirePermission('digests', 'manage'))
    .input(z.object({
      key: automationKeySchema,
      isEnabled: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      return updateAutomationEnabled(input.key, input.isEnabled, ctx.db);
    }),

  runNow: protectedProcedure
    .use(requirePermission('digests', 'manage'))
    .input(z.object({ key: automationKeySchema }))
    .mutation(async ({ ctx, input }) => {
      return runAutomationNow(input.key, ctx.db);
    }),

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

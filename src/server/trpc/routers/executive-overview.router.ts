import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../router';
import { requireExecutiveAccess, getExecutiveSummary, getExecutiveMemberDetail } from '@/server/services/executive-overview.service';

export const executiveOverviewRouter = router({
  summary: protectedProcedure.query(async ({ ctx }) => {
    requireExecutiveAccess(ctx.user?.role.slug);
    return getExecutiveSummary();
  }),

  memberDetail: protectedProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      requireExecutiveAccess(ctx.user?.role.slug);

      const detail = await getExecutiveMemberDetail(input.userId);
      if (!detail) throw new TRPCError({ code: 'NOT_FOUND', message: 'Team member not found.' });
      return detail;
    }),
});

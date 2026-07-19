import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../router';
import { requirePermission } from '../middleware';
import { apiTokenService } from '@/server/services/api-token.service';

// External API token management is admin-only — reuses the same permission gate the
// Telegram/WhatsApp/Teams bot-integration settings pages already use.
const requireApiTokenManage = requirePermission('users', 'manage');

export const apiTokensRouter = router({
  list: protectedProcedure
    .use(requireApiTokenManage)
    .query(() => apiTokenService.listTokens()),

  /** Returns the plaintext token exactly once — the caller must display and discard it. */
  create: protectedProcedure
    .use(requireApiTokenManage)
    .input(z.object({ label: z.string().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await apiTokenService.createToken(input.label, ctx.user!);
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : 'Could not create token.',
        });
      }
    }),

  revoke: protectedProcedure
    .use(requireApiTokenManage)
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await apiTokenService.revokeToken(input.id, ctx.user!);
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : 'Could not revoke token.',
        });
      }
    }),
});

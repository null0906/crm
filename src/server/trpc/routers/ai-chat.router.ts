import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { and, count, desc, eq, isNull, lt } from 'drizzle-orm';
import { router, protectedProcedure } from '../router';
import { activities, aiChatMessages, aiChatSessions, contacts, deals } from '@/server/db/schema';
import * as aiChatService from '@/server/services/ai-chat.service';

const staticSuggestions = [
  "How many open deals do we have and what's the total pipeline value?",
  "Which leads haven't been contacted in over 2 weeks?",
  "Show me Aditi's activity this week",
  "What's our win rate this quarter?",
  'Which stage has the most stuck deals?',
  'How many leads came from each event?',
];

function friendlyChatError(error: unknown): TRPCError {
  console.error('[AI Chat Router] Request failed:', error);
  return new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'I had trouble processing that query. Try rephrasing, or contact your admin.',
  });
}

export const aiChatRouter = router({
  getOrCreateSession: protectedProcedure.query(async ({ ctx }) => {
    const [existing] = await ctx.db
      .select()
      .from(aiChatSessions)
      .where(eq(aiChatSessions.userId, ctx.user.id))
      .orderBy(desc(aiChatSessions.lastMessageAt))
      .limit(1);

    if (existing) {
      return existing;
    }

    const [created] = await ctx.db
      .insert(aiChatSessions)
      .values({ userId: ctx.user.id })
      .returning();

    return created!;
  }),

  getMessages: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [session] = await ctx.db
        .select({ id: aiChatSessions.id })
        .from(aiChatSessions)
        .where(and(eq(aiChatSessions.id, input.sessionId), eq(aiChatSessions.userId, ctx.user.id)))
        .limit(1);

      if (!session) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Chat session not found' });
      }

      return ctx.db
        .select()
        .from(aiChatMessages)
        .where(eq(aiChatMessages.sessionId, input.sessionId))
        .orderBy(aiChatMessages.createdAt);
    }),

  sendMessage: protectedProcedure
    .input(z.object({
      sessionId: z.string().uuid(),
      message: z.string().min(1).max(2000),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await aiChatService.handleMessage(
          input.sessionId,
          ctx.user.id,
          input.message,
          ctx.db
        );
      } catch (error) {
        throw friendlyChatError(error);
      }
    }),

  newSession: protectedProcedure.mutation(async ({ ctx }) => {
    const [created] = await ctx.db
      .insert(aiChatSessions)
      .values({ userId: ctx.user.id })
      .returning();

    return created!;
  }),

  getSuggestions: protectedProcedure.query(async ({ ctx }) => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const [openDeals] = await ctx.db
      .select({ value: count() })
      .from(deals)
      .where(and(isNull(deals.deletedAt), eq(deals.status, 'open')));

    const [newLeads] = await ctx.db
      .select({ value: count() })
      .from(contacts)
      .where(and(
        isNull(contacts.deletedAt),
        eq(contacts.status, 'new'),
        lt(contacts.createdAt, fortyEightHoursAgo)
      ));

    const [recentActivities] = await ctx.db
      .select({ value: count() })
      .from(activities)
      .where(and(isNull(activities.deletedAt), lt(activities.occurredAt, twoWeeksAgo)));

    const dynamicSuggestions = [
      `Summarize our ${openDeals?.value ?? 0} open deals by owner and stage`,
      `Which of the ${newLeads?.value ?? 0} new leads older than 48 hours need first contact?`,
    ];

    if ((recentActivities?.value ?? 0) > 0) {
      dynamicSuggestions[1] = 'Which records have gone quiet recently and need follow-up?';
    }

    return [...staticSuggestions, ...dynamicSuggestions];
  }),
});

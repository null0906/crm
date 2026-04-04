import { z } from 'zod';
import { router, protectedProcedure } from '../router';
import { db } from '@/server/db';
import { savedViews } from '@/server/db/schema';
import { eq, and, or, desc } from 'drizzle-orm';
import type { EntityType, SavedViewVisibility } from '@/lib/types';

const savedViewInput = z.object({
  name: z.string().min(1).max(100),
  entityType: z.enum(['contact', 'company', 'deal', 'activity']),
  filters: z.record(z.string(), z.unknown()).default({}),
  columns: z.array(z.string()).optional(),
  sortConfig: z.object({ field: z.string(), direction: z.enum(['asc', 'desc']) }).optional(),
  groupBy: z.string().optional(),
  visibility: z.enum(['private', 'team', 'everyone']).default('private'),
  isPinned: z.boolean().default(false),
});

export const savedViewRouter = router({
  list: protectedProcedure
    .input(z.object({
      entityType: z.enum(['contact', 'company', 'deal', 'activity']).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user!.id;

      const rows = await db
        .select()
        .from(savedViews)
        .where(
          and(
            input.entityType ? eq(savedViews.entityType, input.entityType as EntityType) : undefined,
            or(
              eq(savedViews.createdBy, userId),
              eq(savedViews.visibility, 'everyone' as SavedViewVisibility),
            )
          )
        )
        .orderBy(desc(savedViews.isPinned), desc(savedViews.createdAt));

      return rows;
    }),

  create: protectedProcedure
    .input(savedViewInput)
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .insert(savedViews)
        .values({
          name: input.name,
          entityType: input.entityType as EntityType,
          filters: input.filters,
          columns: input.columns ?? null,
          sortConfig: input.sortConfig ?? null,
          groupBy: input.groupBy ?? null,
          visibility: input.visibility as SavedViewVisibility,
          isPinned: input.isPinned,
          createdBy: ctx.user!.id,
        })
        .returning();
      return row!;
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), data: savedViewInput.partial() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .update(savedViews)
        .set({
          ...input.data,
          entityType: input.data.entityType as EntityType | undefined,
          visibility: input.data.visibility as SavedViewVisibility | undefined,
          updatedAt: new Date(),
        })
        .where(and(eq(savedViews.id, input.id), eq(savedViews.createdBy, ctx.user!.id)))
        .returning();
      return row!;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(savedViews)
        .where(and(eq(savedViews.id, input.id), eq(savedViews.createdBy, ctx.user!.id)));
      return { success: true };
    }),
});

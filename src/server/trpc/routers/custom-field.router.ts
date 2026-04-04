import { z } from 'zod';
import { router, protectedProcedure } from '../router';
import { requirePermission } from '../middleware';
import { db } from '@/server/db';
import { customFieldDefinitions } from '@/server/db/schema';
import { eq, asc } from 'drizzle-orm';
import { customFieldDefinitionSchema } from '@/server/lib/validators';
import { writeAuditLog } from '@/server/services/audit.service';

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export const customFieldRouter = router({
  list: protectedProcedure
    .input(z.object({ entityType: z.enum(['contact', 'company', 'deal']).optional() }))
    .query(async ({ input }) => {
      let query = db.select().from(customFieldDefinitions).$dynamic();
      if (input.entityType) {
        query = query.where(eq(customFieldDefinitions.entityType, input.entityType));
      }
      return query.orderBy(asc(customFieldDefinitions.position));
    }),

  create: protectedProcedure
    .use(requirePermission('settings', 'custom_fields'))
    .input(customFieldDefinitionSchema)
    .mutation(async ({ ctx, input }) => {
      const slug = toSlug(input.name);
      const [field] = await db
        .insert(customFieldDefinitions)
        .values({ ...input, slug, createdBy: ctx.user!.id })
        .returning();

      await writeAuditLog({
        userId: ctx.user!.id,
        userEmail: ctx.user!.email,
        action: 'create',
        entityType: 'custom_field',
        entityId: field!.id,
        entityName: field!.name,
      });

      return field;
    }),

  update: protectedProcedure
    .use(requirePermission('settings', 'custom_fields'))
    .input(z.object({
      id: z.string().uuid(),
      data: customFieldDefinitionSchema.partial(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await db
        .update(customFieldDefinitions)
        .set({ ...input.data, updatedAt: new Date() })
        .where(eq(customFieldDefinitions.id, input.id))
        .returning();

      await writeAuditLog({
        userId: ctx.user!.id,
        userEmail: ctx.user!.email,
        action: 'update',
        entityType: 'custom_field',
        entityId: input.id,
        entityName: updated?.name,
      });

      return updated;
    }),

  delete: protectedProcedure
    .use(requirePermission('settings', 'custom_fields'))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [field] = await db
        .select()
        .from(customFieldDefinitions)
        .where(eq(customFieldDefinitions.id, input.id))
        .limit(1);

      await db.delete(customFieldDefinitions).where(eq(customFieldDefinitions.id, input.id));

      await writeAuditLog({
        userId: ctx.user!.id,
        userEmail: ctx.user!.email,
        action: 'delete',
        entityType: 'custom_field',
        entityId: input.id,
        entityName: field?.name,
      });

      return { success: true };
    }),

  reorder: protectedProcedure
    .use(requirePermission('settings', 'custom_fields'))
    .input(z.array(z.object({ id: z.string().uuid(), position: z.number().int() })))
    .mutation(async ({ input }) => {
      for (const { id, position } of input) {
        await db
          .update(customFieldDefinitions)
          .set({ position })
          .where(eq(customFieldDefinitions.id, id));
      }
      return { success: true };
    }),
});

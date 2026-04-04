import { z } from 'zod';
import { router, protectedProcedure } from '../router';
import { db } from '@/server/db';
import { tags, tagCategories } from '@/server/db/schema';
import { eq, asc, ilike, or } from 'drizzle-orm';
import { tagCreateSchema } from '@/server/lib/validators';
import { writeAuditLog } from '@/server/services/audit.service';

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export const tagRouter = router({
  list: protectedProcedure
    .input(z.object({ search: z.string().optional(), categoryId: z.string().uuid().optional() }))
    .query(async ({ input }) => {
      let query = db.select().from(tags).$dynamic();
      if (input.search) {
        query = query.where(ilike(tags.name, `%${input.search}%`));
      }
      if (input.categoryId) {
        query = query.where(eq(tags.categoryId, input.categoryId));
      }
      return query.orderBy(asc(tags.name));
    }),

  listCategories: protectedProcedure
    .query(async () => {
      return db.select().from(tagCategories).orderBy(asc(tagCategories.name));
    }),

  create: protectedProcedure
    .input(tagCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const slug = toSlug(input.name);
      const [tag] = await db
        .insert(tags)
        .values({ ...input, slug, createdBy: ctx.user.id })
        .returning();

      await writeAuditLog({
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        action: 'create',
        entityType: 'tag',
        entityId: tag!.id,
        entityName: tag!.name,
      });

      return tag;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(100).optional(),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      categoryId: z.string().uuid().optional().nullable(),
      description: z.string().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const [updated] = await db
        .update(tags)
        .set(data)
        .where(eq(tags.id, id))
        .returning();

      await writeAuditLog({
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        action: 'update',
        entityType: 'tag',
        entityId: id,
        entityName: updated?.name,
      });

      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [tag] = await db.select().from(tags).where(eq(tags.id, input.id)).limit(1);
      await db.delete(tags).where(eq(tags.id, input.id));

      await writeAuditLog({
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        action: 'delete',
        entityType: 'tag',
        entityId: input.id,
        entityName: tag?.name,
      });

      return { success: true };
    }),

  createCategory: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(50),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const [category] = await db.insert(tagCategories).values(input).returning();
      return category;
    }),
});

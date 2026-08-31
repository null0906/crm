import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { asc, eq } from 'drizzle-orm';
import { financialProcedure, protectedProcedure, router } from '../router';
import { db } from '@/server/db';
import { serviceLines } from '@/server/db/schema';
import { writeAuditLog } from '@/server/services/audit.service';

/**
 * What we sell (FR-P4-01 context).
 *
 * Reads are open: the label of a service line is not money, and every screen
 * that renders one needs it. Writes are gated because a service line is what
 * scoping questions, role checklists, ideal costs and margin targets all hang
 * off — adding one is a pricing decision, not a cosmetic edit.
 */

const slug = z
  .string()
  .trim()
  .min(2)
  .max(50)
  .regex(/^[a-z0-9_]+$/, 'Lowercase letters, digits and underscores only');

export const serviceLinesRouter = router({
  list: protectedProcedure
    .input(z.object({ includeInactive: z.boolean().default(false) }).optional())
    .query(async ({ input }) => {
      const rows = await db
        .select()
        .from(serviceLines)
        .orderBy(asc(serviceLines.position), asc(serviceLines.label));
      return input?.includeInactive ? rows : rows.filter((r) => r.isActive);
    }),

  /**
   * Creates or relabels a service line.
   *
   * The slug is settable on create and immutable afterwards: every other table
   * stores it as a plain string, so renaming one would orphan the estimates,
   * baselines, margin targets and driver links that reference it. Renaming is a
   * data migration, which is why only the label is editable here.
   */
  upsert: financialProcedure
    .input(
      z.object({
        slug,
        label: z.string().trim().min(2).max(100),
        position: z.number().int().min(0).default(0),
        isActive: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .insert(serviceLines)
        .values(input)
        .onConflictDoUpdate({
          target: serviceLines.slug,
          set: {
            label: input.label,
            position: input.position,
            isActive: input.isActive,
            updatedAt: new Date(),
          },
        })
        .returning();

      await writeAuditLog({
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        action: 'update',
        entityType: 'service_line',
        entityId: input.slug,
        entityName: input.label,
      });
      return row;
    }),

  /**
   * Retires a service line without deleting it. Estimates already signed store
   * the slug and must stay legible; a delete would leave them rendering a bare
   * string with no label behind it.
   */
  deactivate: financialProcedure
    .input(z.object({ slug: z.string().trim().max(50) }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .update(serviceLines)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(serviceLines.slug, input.slug))
        .returning();
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Service line not found.' });

      await writeAuditLog({
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        action: 'update',
        entityType: 'service_line',
        entityId: input.slug,
        entityName: row.label,
        metadata: { deactivated: true },
      });
      return row;
    }),
});

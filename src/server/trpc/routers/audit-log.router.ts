import { z } from 'zod';
import { router, protectedProcedure } from '../router';
import { requirePermission } from '../middleware';
import { db } from '@/server/db';
import { auditLog, users } from '@/server/db/schema';
import { eq, and, gte, lte, desc } from 'drizzle-orm';

export const auditLogRouter = router({
  list: protectedProcedure
    .use(requirePermission('audit_log', 'read'))
    .input(z.object({
      userId: z.string().uuid().optional(),
      action: z.string().optional(),
      entityType: z.string().optional(),
      fromDate: z.string().datetime().optional(),
      toDate: z.string().datetime().optional(),
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const conditions: ReturnType<typeof eq>[] = [];

      if (input.userId) conditions.push(eq(auditLog.userId, input.userId));
      if (input.action) conditions.push(eq(auditLog.action, input.action as import('@/lib/types').AuditAction));
      if (input.entityType) conditions.push(eq(auditLog.entityType, input.entityType));
      if (input.fromDate) conditions.push(gte(auditLog.createdAt, new Date(input.fromDate)));
      if (input.toDate) conditions.push(lte(auditLog.createdAt, new Date(input.toDate)));

      const rows = await db
        .select()
        .from(auditLog)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(auditLog.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return rows;
    }),
});

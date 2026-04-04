import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../router';
import { requirePermission } from '../middleware';
import { db } from '@/server/db';
import { users, roles } from '@/server/db/schema';
import { eq, asc, ne } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { writeAuditLog } from '@/server/services/audit.service';

export const userRouter = router({
  me: protectedProcedure
    .query(async ({ ctx }) => {
      const [user] = await db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          avatarUrl: users.avatarUrl,
          phone: users.phone,
          status: users.status,
          roleId: users.roleId,
          preferences: users.preferences,
          createdAt: users.createdAt,
          role: {
            id: roles.id,
            name: roles.name,
            slug: roles.slug,
            permissions: roles.permissions,
          },
        })
        .from(users)
        .innerJoin(roles, eq(users.roleId, roles.id))
        .where(eq(users.id, ctx.user!.id))
        .limit(1);

      if (!user) throw new TRPCError({ code: 'NOT_FOUND' });
      return user;
    }),

  list: protectedProcedure
    .query(async () => {
      return db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          avatarUrl: users.avatarUrl,
          status: users.status,
          roleId: users.roleId,
          role: {
            id: roles.id,
            name: roles.name,
            slug: roles.slug,
          },
          createdAt: users.createdAt,
        })
        .from(users)
        .innerJoin(roles, eq(users.roleId, roles.id))
        .where(ne(users.status, 'inactive'))
        .orderBy(asc(users.firstName));
    }),

  create: protectedProcedure
    .use(requirePermission('users', 'manage'))
    .input(z.object({
      email: z.string().email(),
      firstName: z.string().min(1).max(100),
      lastName: z.string().min(1).max(100),
      roleId: z.string().uuid(),
      password: z.string().min(8),
    }))
    .mutation(async ({ ctx, input }) => {
      const bcryptRounds = Number(process.env.BCRYPT_ROUNDS) || 12;
      const passwordHash = await bcrypt.hash(input.password, bcryptRounds);

      const [user] = await db
        .insert(users)
        .values({ ...input, passwordHash, status: 'active' })
        .returning();

      await writeAuditLog({
        userId: ctx.user!.id,
        userEmail: ctx.user!.email,
        action: 'create',
        entityType: 'user',
        entityId: user!.id,
        entityName: `${user!.firstName} ${user!.lastName}`,
      });

      return { id: user!.id, email: user!.email, firstName: user!.firstName, lastName: user!.lastName };
    }),

  update: protectedProcedure
    .use(requirePermission('users', 'manage'))
    .input(z.object({
      id: z.string().uuid(),
      firstName: z.string().min(1).max(100).optional(),
      lastName: z.string().min(1).max(100).optional(),
      roleId: z.string().uuid().optional(),
      status: z.enum(['active', 'inactive', 'suspended']).optional(),
      phone: z.string().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const [updated] = await db
        .update(users)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning();

      await writeAuditLog({
        userId: ctx.user!.id,
        userEmail: ctx.user!.email,
        action: 'update',
        entityType: 'user',
        entityId: id,
        entityName: `${updated?.firstName} ${updated?.lastName}`,
      });

      return updated;
    }),

  updatePreferences: protectedProcedure
    .input(z.object({ preferences: z.record(z.string(), z.unknown()) }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await db
        .update(users)
        .set({ preferences: input.preferences, updatedAt: new Date() })
        .where(eq(users.id, ctx.user!.id))
        .returning({ preferences: users.preferences });
      return updated;
    }),

  listRoles: protectedProcedure
    .query(async () => {
      return db.select().from(roles).orderBy(asc(roles.name));
    }),
});

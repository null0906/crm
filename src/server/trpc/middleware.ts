import { TRPCError } from '@trpc/server';
import { t } from './trpc-init';
import type { RolePermissions, PermissionLevel } from '@/lib/types';
import { hasPermission, getPermissionLevel } from '@/server/lib/permissions';
import { canSeeFinancials } from '@/server/lib/financial-access';

export const isAuthenticated = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const requirePermission = (module: keyof RolePermissions, action: string) =>
  t.middleware(({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    const perms = ctx.user.role.permissions;
    if (!hasPermission(perms, module, action)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `You don't have permission to ${action} ${String(module)}`,
      });
    }

    return next({ ctx });
  });

export const requirePermissionLevel = (
  module: keyof RolePermissions,
  action: string,
  minLevel: PermissionLevel = true
) =>
  t.middleware(({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    const level = getPermissionLevel(ctx.user.role.permissions, module, action);
    if (level === false || level === undefined || level === null) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Insufficient permissions for ${String(module)}.${action}`,
      });
    }

    return next({ ctx: { ...ctx, permissionLevel: level } });
  });

/**
 * Gates cost, margin and collections data on the per-user financial
 * entitlement (FR-X-05). Deliberately independent of the role permission
 * matrix: a user may hold `all` record visibility and still be denied cost.
 */
export const requireFinancialAccess = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  if (!canSeeFinancials(ctx.user)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Financial access is required to view cost and margin data.',
    });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

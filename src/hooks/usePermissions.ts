'use client';

import { useSession } from 'next-auth/react';
import type { RolePermissions, PermissionLevel } from '@/lib/types';
import { hasPermission, getPermissionLevel } from '@/server/lib/permissions';

export function usePermissions() {
  const { data: session } = useSession();
  const permissions = (session?.user as Record<string, unknown>)?.role as { permissions: RolePermissions } | undefined;

  const can = (module: keyof RolePermissions, action: string): boolean => {
    if (!permissions) return false;
    return hasPermission(permissions.permissions, module, action);
  };

  const level = (module: keyof RolePermissions, action: string): PermissionLevel => {
    if (!permissions) return false;
    return getPermissionLevel(permissions.permissions, module, action);
  };

  const isAdmin = (): boolean => {
    const role = (session?.user as Record<string, unknown>)?.role as { slug: string } | undefined;
    return role?.slug === 'super_admin';
  };

  return { can, level, isAdmin, session };
}

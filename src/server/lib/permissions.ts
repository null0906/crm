import type { RolePermissions, PermissionLevel } from '@/lib/types';

type PermissionModule = keyof RolePermissions;

export function hasPermission(
  permissions: RolePermissions,
  module: PermissionModule,
  action: string
): boolean {
  const modulePerms = permissions[module] as Record<string, PermissionLevel> | undefined;
  if (!modulePerms) return false;
  const perm = modulePerms[action];
  if (perm === undefined || perm === null || perm === false) return false;
  return true;
}

export function getPermissionLevel(
  permissions: RolePermissions,
  module: PermissionModule,
  action: string
): PermissionLevel {
  const modulePerms = permissions[module] as Record<string, PermissionLevel> | undefined;
  if (!modulePerms) return false;
  return modulePerms[action] ?? false;
}

export function canRead(
  permissions: RolePermissions,
  module: PermissionModule
): PermissionLevel {
  return getPermissionLevel(permissions, module, 'read');
}

export function canCreate(permissions: RolePermissions, module: PermissionModule): boolean {
  return hasPermission(permissions, module, 'create');
}

export function canUpdate(permissions: RolePermissions, module: PermissionModule): PermissionLevel {
  return getPermissionLevel(permissions, module, 'update');
}

export function canDelete(permissions: RolePermissions, module: PermissionModule): boolean {
  return hasPermission(permissions, module, 'delete');
}

export function canExport(permissions: RolePermissions, module: PermissionModule): boolean {
  return hasPermission(permissions, module, 'export');
}

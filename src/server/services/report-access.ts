import { TRPCError } from '@trpc/server';
import { hasPermission } from '@/server/lib/permissions';
import type { SessionUser } from '@/lib/types';

/**
 * Shared with reports.router.ts and the AI assistant's reporting tools so both
 * enforce the literal same rule for who can see whose report.
 */
export function canViewTeamReports(ctxUser: SessionUser) {
  const roleSlug = ctxUser.role.slug;
  return (
    hasPermission(ctxUser.role.permissions, 'reports', 'view') ||
    ['super_admin', 'admin', 'sales_manager', 'manager', 'viewer'].includes(roleSlug)
  );
}

export function assertReportAccess(ctxUser: SessionUser, targetUserId: string) {
  if (targetUserId === ctxUser.id) return;
  if (!canViewTeamReports(ctxUser)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'You can only view your own report.' });
  }
}

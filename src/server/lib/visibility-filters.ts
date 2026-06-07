import { eq, inArray, or, type SQL } from 'drizzle-orm';
import { db } from '@/server/db';
import { deals, dealTeamMembers } from '@/server/db/schema';
import type { SessionUser } from '@/lib/types';

const FULL_VISIBILITY_ROLES = new Set(['super_admin', 'sales_manager', 'viewer']);

export function canSeeAllProspects(user: Pick<SessionUser, 'role'>): boolean {
  return FULL_VISIBILITY_ROLES.has(user.role.slug);
}

export function getProspectVisibilityFilter(user: Pick<SessionUser, 'id' | 'role'>): SQL | undefined {
  if (canSeeAllProspects(user)) return undefined;
  const teamDeals = db.select({ dealId: dealTeamMembers.dealId })
    .from(dealTeamMembers)
    .where(eq(dealTeamMembers.userId, user.id));
  return or(eq(deals.ownerId, user.id), eq(deals.createdBy, user.id), inArray(deals.id, teamDeals));
}

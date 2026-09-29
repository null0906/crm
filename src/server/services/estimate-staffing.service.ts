import { eq, sql } from 'drizzle-orm';
import { db as defaultDb } from '@/server/db';
import { deliveryRoles, estimateTeamLines, estimates, users } from '@/server/db/schema';
import { createNotification } from './notification.service';

type DbClient = typeof defaultDb;

/**
 * Tells the people named on an estimate that they are on it.
 *
 * Hung on approval rather than on the team editor, for two reasons. Approval is
 * the only moment the staffing is real — `replaceTeamLines` rewrites every line
 * on a two-second autosave, so typing "120" into an hours box saves at 1, 12 and
 * 120, and the rows have no stable identity to diff against. And approval is
 * already exactly-once: `assertDraft`, the `status = 'draft'` guard in the
 * UPDATE, and the `estimate_approved_is_frozen_check` constraint between them
 * mean this cannot fire twice for one estimate, so no cooldown or
 * already-notified ledger is needed.
 *
 * `assertEveryLineIsStaffed` runs just before this in `approveEstimate`, so by
 * here every line is guaranteed to name someone.
 *
 * Carries hours, a role and a client — never cost. The recipient is not
 * required to hold the financial entitlement, and this must not start quoting
 * money without revisiting that.
 */

interface StaffedLine {
  userId: string | null;
  hours: string | null;
  resourceCount: number;
  roleName: string | null;
}

/** One person's total commitment on this estimate. */
interface PersonCommitment {
  userId: string;
  hours: number;
  roles: string[];
  /** True when some line budgets more people than the one it names. */
  shared: boolean;
}

function summarise(lines: StaffedLine[]): PersonCommitment[] {
  const byUser = new Map<string, PersonCommitment>();

  for (const line of lines) {
    if (!line.userId) continue;

    // `hours` is decimal(8,2), which node-postgres returns as a string, and is
    // nullable while nobody has decided how long the role is needed for.
    const hours = line.hours === null ? 0 : Number(line.hours);
    if (!Number.isFinite(hours)) continue;

    const existing = byUser.get(line.userId);
    const entry = existing ?? { userId: line.userId, hours: 0, roles: [], shared: false };

    // Deliberately NOT hours * resourceCount. The cost engine multiplies the two
    // (cost-engine.service.ts), which means `hours` is already the figure for one
    // person; resourceCount is how many of them the line budgets for. Quoting the
    // product would tell someone they personally owe the whole team's hours.
    entry.hours += hours;
    if (line.resourceCount > 1) entry.shared = true;
    if (line.roleName && !entry.roles.includes(line.roleName)) entry.roles.push(line.roleName);

    if (!existing) byUser.set(line.userId, entry);
  }

  return [...byUser.values()];
}

/** "12", "12.5" — trailing zeros are noise in a sentence. */
function formatHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

function buildBody(commitment: PersonCommitment, isRevision: boolean): string {
  const roles = commitment.roles.length > 0 ? commitment.roles.join(' and ') : 'the team';
  const hours = commitment.hours > 0 ? `${formatHours(commitment.hours)} hours` : 'hours still to be decided';

  const parts = [`You are on this as ${roles}, for ${hours}.`];
  if (commitment.shared) {
    parts.push('Some of that work is budgeted for more than one person, so the hours may be shared.');
  }
  if (isRevision) {
    parts.push('This replaces an earlier version of the same estimate.');
  }
  return parts.join(' ');
}

/**
 * Notifies everyone staffed on a freshly approved estimate.
 *
 * `actorId` is skipped — they are the one who just approved it.
 *
 * Throws only on a genuine database fault; the caller is expected to swallow
 * that, because failing to notify must never undo an approval.
 */
export async function notifyStaffedUsers(
  estimateId: string,
  actorId: string,
  db: DbClient = defaultDb
): Promise<number> {
  const [context] = await db
    .select({
      title: estimates.title,
      dealId: estimates.dealId,
      supersedesId: estimates.supersedesId,
      // Two candidate companies, resolved in one pass. `estimates.company_id` is
      // set independently of the deal's at creation, so the two can disagree and
      // the estimate's own answer wins. A scalar subquery rather than a second
      // aliased join, matching deal.service.ts's partner-company lookup.
      clientName: sql<string | null>`(
        SELECT c.name FROM companies c
        WHERE c.id = COALESCE(
          ${estimates.companyId},
          (SELECT d.company_id FROM deals d WHERE d.id = ${estimates.dealId})
        )
      )`,
    })
    .from(estimates)
    .where(eq(estimates.id, estimateId))
    .limit(1);

  if (!context) return 0;

  const lines = await db
    .select({
      userId: estimateTeamLines.userId,
      hours: estimateTeamLines.hours,
      resourceCount: estimateTeamLines.resourceCount,
      roleName: deliveryRoles.name,
    })
    .from(estimateTeamLines)
    .leftJoin(deliveryRoles, eq(deliveryRoles.id, estimateTeamLines.deliveryRoleId))
    .where(eq(estimateTeamLines.estimateId, estimateId));

  const commitments = summarise(lines).filter((c) => c.userId !== actorId);
  if (commitments.length === 0) return 0;

  // Only notify people who can still log in. A deactivated user would otherwise
  // accumulate notifications nobody reads.
  const active = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.status, 'active'));
  const activeIds = new Set(active.map((u) => u.id));

  // Both company and deal are nullable with onDelete: 'set null', so an estimate
  // can genuinely have neither. Fall back to its title rather than "null".
  const subject = context.clientName ?? context.title;
  const isRevision = context.supersedesId !== null;

  // No deal means no builder route to link to; better no link than a broken one.
  const actionUrl = context.dealId
    ? `/deals/${context.dealId}/estimates/${estimateId}`
    : undefined;

  let sent = 0;
  for (const commitment of commitments) {
    if (!activeIds.has(commitment.userId)) continue;

    await createNotification(
      {
        userId: commitment.userId,
        type: 'estimate_staffed',
        title: `You are on the ${subject} proposal`,
        body: buildBody(commitment, isRevision),
        entityType: 'estimate',
        entityId: estimateId,
        metadata: {
          ...(actionUrl ? { actionUrl } : {}),
          hours: commitment.hours,
          roles: commitment.roles,
        },
      },
      db
    );
    sent += 1;
  }

  return sent;
}

/** Exported for tests — the aggregation is the part worth pinning down. */
export const __testing = { summarise, buildBody, formatHours };

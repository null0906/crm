import type { SessionUser } from '@/lib/types';
import { writeAuditLog } from '@/server/services/audit.service';

/**
 * The single gate for cost, margin and collections data.
 *
 * Decision D-1 absorbed the pricing desk into this platform, which removed the
 * architectural boundary that used to make salary-derived cost rates
 * unreachable. This module is what replaces it. Every surface that could emit
 * a cost or margin figure — tRPC, exports, digests, the metrics API, the AI
 * assistant — must pass through here rather than reimplementing the check.
 *
 * That matters because the existing deal-amount masking is already duplicated
 * across seven files, and extending that pattern to salary data is how leaks
 * happen. See FR-X-05, FR-X-06 and NFR-SEC-04 through NFR-SEC-09.
 */

/**
 * Fields that must never reach a caller without the financial entitlement.
 *
 * Margin is on this list because margin plus price gives you cost:
 * cost = price x (1 - margin). Publishing a margin percentage alongside a
 * visible price leaks the cost just as surely as printing it.
 *
 * `price` is deliberately NOT here. It is the quotable fact — the number the
 * client is told and that anyone selling needs. Cost and margin are what stay
 * behind the entitlement.
 */
export const FINANCIAL_FIELDS = [
  // per-resource cost components
  'base',
  'seat',
  'support',
  'loadedWeekly',
  'amountPerWeek',
  'costPerWeek',
  'total',
  // engagement roll-ups
  'labourSubtotal',
  'nonLabourPassThrough',
  'nonLabourMarkedUp',
  'nonLabourTotal',
  'customTotal',
  'subtotalBeforeGnr',
  'gnrAmount',
  'basisAmount',
  'totalDeliveryCost',
  // margin, which is a route back to cost
  'marginAmount',
  'marginPercent',
  'targetMarginPercent',
  'ratePercent',
] as const;

export type FinancialField = (typeof FINANCIAL_FIELDS)[number];

/**
 * Super admins are entitled implicitly; everyone else must be granted the
 * per-user permission. Role is deliberately not consulted beyond that — the
 * entitlement is granted to a person, not to a job title (FR-X-05).
 */
export function canSeeFinancials(user: Pick<SessionUser, 'hasFinancialAccess' | 'role'>): boolean {
  if (user.role?.slug === 'super_admin') return true;
  return user.hasFinancialAccess === true;
}

export class FinancialAccessError extends Error {
  readonly code = 'FINANCIAL_ACCESS_DENIED';
  constructor(what = 'this data') {
    super(`You do not have financial access to view ${what}.`);
    this.name = 'FinancialAccessError';
  }
}

export function assertFinancialAccess(
  user: Pick<SessionUser, 'hasFinancialAccess' | 'role'>,
  what?: string
): void {
  if (!canSeeFinancials(user)) throw new FinancialAccessError(what);
}

/**
 * Default-deny redaction (NFR-SEC-08).
 *
 * Nulls every known financial field rather than accepting a caller-supplied
 * allow-list, so a newly added cost field is protected the moment its name is
 * registered above — not whenever someone remembers to update a call site.
 */
export function redactFinancials<T>(
  user: Pick<SessionUser, 'hasFinancialAccess' | 'role'>,
  payload: T
): T {
  if (canSeeFinancials(user)) return payload;
  return stripFinancials(payload) as T;
}

function stripFinancials(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripFinancials);
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;

  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    out[key] = (FINANCIAL_FIELDS as readonly string[]).includes(key)
      ? null
      : stripFinancials(inner);
  }
  return out;
}

/**
 * NFR-SEC-07: every read of an individual cost rate is audited. Fire-and-forget
 * — `writeAuditLog` swallows its own failures so auditing cannot break a read.
 */
export function auditFinancialRead(
  user: Pick<SessionUser, 'id' | 'email'>,
  entityType: string,
  detail: Record<string, unknown> = {}
): void {
  void writeAuditLog({
    userId: user.id,
    userEmail: user.email,
    action: 'api_access',
    entityType,
    metadata: { financialRead: true, ...detail },
  });
}

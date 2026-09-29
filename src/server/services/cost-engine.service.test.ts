import { describe, expect, it } from 'vitest';

/**
 * Rate resolution, pinned without a database.
 *
 * `resolveComponents` needs one, so what is reproduced here is its rule: from
 * the rows that apply to a team member, the most specific scope wins. The rule
 * itself did not change when cost moved to people — what changed is that role
 * and company-default base rows were closed, so they stop being among the rows
 * that apply. These tests state both halves, because the second is easy to
 * mistake for the first and "re-open a role rate" would silently work again.
 */

type Scope = 'default' | 'role' | 'employee';
const SCOPE_RANK: Record<Scope, number> = { default: 0, role: 1, employee: 2 };

interface Row {
  scope: Scope;
  deliveryRoleId?: string | null;
  userId?: string | null;
  amount: number;
}

/** The `applies` predicate and most-specific-wins pick, verbatim in shape. */
function resolve(
  rows: Row[],
  member: { deliveryRoleId: string; userId?: string | null }
): Row | null {
  let winner: Row | null = null;
  for (const row of rows) {
    const applies =
      (row.scope === 'default' && !row.deliveryRoleId && !row.userId) ||
      (row.scope === 'role' && row.deliveryRoleId === member.deliveryRoleId) ||
      (row.scope === 'employee' && !!member.userId && row.userId === member.userId);
    if (!applies) continue;
    if (!winner || SCOPE_RANK[row.scope] >= SCOPE_RANK[winner.scope]) winner = row;
  }
  return winner;
}

const LEAD = 'role-lead';
const PRIYA = 'user-priya';

describe('rate resolution', () => {
  it("prefers a person's own rate over a role average", () => {
    const rows: Row[] = [
      { scope: 'role', deliveryRoleId: LEAD, amount: 650 },
      { scope: 'employee', userId: PRIYA, amount: 820 },
    ];
    expect(resolve(rows, { deliveryRoleId: LEAD, userId: PRIYA })?.amount).toBe(820);
  });

  it('prefers a role average over the company default', () => {
    // Only reachable for a historic estimate now, but the ordering still holds
    // and a frozen breakdown should reproduce exactly.
    const rows: Row[] = [
      { scope: 'default', amount: 500 },
      { scope: 'role', deliveryRoleId: LEAD, amount: 650 },
    ];
    expect(resolve(rows, { deliveryRoleId: LEAD, userId: null })?.amount).toBe(650);
  });

  it('does not give one person another person’s rate', () => {
    const rows: Row[] = [{ scope: 'employee', userId: 'user-someone-else', amount: 820 }];
    expect(resolve(rows, { deliveryRoleId: LEAD, userId: PRIYA })).toBeNull();
  });

  it('resolves nothing for a named person with no rate of their own', () => {
    // The new behaviour. Once the role and default rows are closed they are not
    // among the rows offered here, so there is no average to fall back to and
    // the line is reported as uncosted rather than priced at somebody else's
    // salary.
    expect(resolve([], { deliveryRoleId: LEAD, userId: PRIYA })).toBeNull();
  });

  it('resolves nothing for a line that names nobody', () => {
    const rows: Row[] = [{ scope: 'employee', userId: PRIYA, amount: 820 }];
    expect(resolve(rows, { deliveryRoleId: LEAD, userId: null })).toBeNull();
  });

  it('still resolves a closed role rate for an estimate dated before it closed', () => {
    // Migration 0033 closed these rather than deleting them precisely so this
    // keeps working. The date filter lives in the query; what matters here is
    // that a row still in scope is still chosen.
    const rows: Row[] = [{ scope: 'role', deliveryRoleId: LEAD, amount: 650 }];
    expect(resolve(rows, { deliveryRoleId: LEAD, userId: null })?.amount).toBe(650);
  });
});

/**
 * The approval guard's rule, separated from its query. An estimate may be
 * drafted with unstaffed lines — that is where the thinking happens — but not
 * frozen with them, because the frozen total would be wrong by whatever those
 * lines should have cost.
 */
function unstaffedRoles(lines: { userId: string | null; roleName: string | null }[]): string[] {
  return [...new Set(lines.filter((l) => !l.userId).map((l) => l.roleName ?? 'an unnamed role'))];
}

describe('approval staffing guard', () => {
  it('passes when every line names somebody', () => {
    expect(
      unstaffedRoles([
        { userId: PRIYA, roleName: 'Lead' },
        { userId: 'user-rahul', roleName: 'Analyst' },
      ])
    ).toEqual([]);
  });

  it('names the roles that are unstaffed', () => {
    expect(
      unstaffedRoles([
        { userId: PRIYA, roleName: 'Lead' },
        { userId: null, roleName: 'Analyst' },
      ])
    ).toEqual(['Analyst']);
  });

  it('reports a role once however many of its lines are unstaffed', () => {
    expect(
      unstaffedRoles([
        { userId: null, roleName: 'Analyst' },
        { userId: null, roleName: 'Analyst' },
      ])
    ).toEqual(['Analyst']);
  });

  it('copes with a line whose role was deleted', () => {
    expect(unstaffedRoles([{ userId: null, roleName: null }])).toEqual(['an unnamed role']);
  });
});

/**
 * The effective-date window, and the one-day slack the range check allows.
 *
 * `effective_to` is an INCLUSIVE end date, which is the detail that made
 * retiring the role rates subtle: closing a row *at* a date leaves it resolving
 * *for* that date. The same inclusivity is why superseding a rate closes the
 * previous one the day BEFORE the new one starts — and why correcting a rate
 * twice in one day needs a row closed before it began.
 */
function appliesOn(row: { from: string; to: string | null }, asOf: string): boolean {
  return row.from <= asOf && (row.to === null || row.to >= asOf);
}

describe('effective-date window', () => {
  it('includes the closing date itself', () => {
    expect(appliesOn({ from: '2026-01-01', to: '2026-08-31' }, '2026-08-31')).toBe(true);
  });

  it('stops the day after the closing date', () => {
    expect(appliesOn({ from: '2026-01-01', to: '2026-08-30' }, '2026-08-31')).toBe(false);
  });

  it('still applies to an estimate dated before it closed', () => {
    // Why migration 0033 closes rather than deletes: a June estimate keeps
    // resolving the role rate it was actually built on.
    expect(appliesOn({ from: '2026-01-01', to: '2026-08-30' }, '2026-06-01')).toBe(true);
  });

  it('never applies when closed the day before it began', () => {
    // A rate set and corrected on the same day. The range check permits this
    // window precisely so that correction is possible; resolution excludes it
    // on every date, including its own start.
    const stillborn = { from: '2026-08-31', to: '2026-08-30' };
    expect(appliesOn(stillborn, '2026-08-31')).toBe(false);
    expect(appliesOn(stillborn, '2026-08-30')).toBe(false);
    expect(appliesOn(stillborn, '2027-01-01')).toBe(false);
  });

  it('leaves an open-ended row standing', () => {
    expect(appliesOn({ from: '2026-01-01', to: null }, '2030-01-01')).toBe(true);
  });
});

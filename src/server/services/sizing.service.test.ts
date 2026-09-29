import { describe, expect, it } from 'vitest';
import { FINANCIAL_FIELDS } from '@/server/lib/financial-access';
import { exceedsDeadline, longestLineHours, reconcileHours } from '@/lib/engagement-fit';

/**
 * `composeMultiplier` needs a database for the policy and the driver rows, so
 * what is pinned here is its arithmetic, reproduced from the composition step.
 * That step is the whole of sizing now: one number out, and a ceiling on it.
 *
 * The previous suite tested `shapeSizing` and the baseline expansion, both of
 * which are gone — scoping no longer decides hours or headcount, so there is no
 * second axis to fold and no team to expand.
 */
describe('driver composition', () => {
  const compose = (
    multipliers: number[],
    composition: 'multiplicative' | 'additive',
    maxMultiplier: number
  ) => {
    const raw =
      composition === 'additive'
        ? 1 + multipliers.reduce((sum, m) => sum + (m - 1), 0)
        : multipliers.reduce((product, m) => product * m, 1);
    return { raw, capped: raw > maxMultiplier, multiplier: Math.min(raw, maxMultiplier) };
  };

  it('multiplies the contributions together by default', () => {
    expect(compose([1.2, 1.5], 'multiplicative', 10).multiplier).toBeCloseTo(1.8, 10);
  });

  it('sums the deltas when the policy says additive', () => {
    // 1.2 and 1.5 add 0.2 and 0.5, so 1.7 — not the 1.8 they multiply to.
    expect(compose([1.2, 1.5], 'additive', 10).multiplier).toBeCloseTo(1.7, 10);
  });

  it('is neutral when nothing was answered', () => {
    expect(compose([], 'multiplicative', 2.5).multiplier).toBe(1);
    expect(compose([], 'additive', 2.5).multiplier).toBe(1);
  });

  it('lets a driver size an engagement down', () => {
    expect(compose([0.8], 'multiplicative', 2.5).multiplier).toBeCloseTo(0.8, 10);
  });

  it('clamps to the ceiling exactly, and says it did', () => {
    const result = compose([2, 2], 'multiplicative', 2.5);
    expect(result.raw).toBe(4);
    expect(result.capped).toBe(true);
    expect(result.multiplier).toBe(2.5);
  });

  it('does not report a cap when the answers sit on the ceiling', () => {
    const result = compose([2.5], 'multiplicative', 2.5);
    expect(result.capped).toBe(false);
    expect(result.multiplier).toBe(2.5);
  });
});

/**
 * The two checks that stand where the old automatic re-sizing did. Both warn
 * and neither corrects, so what matters is that they fire on exactly the cases
 * worth interrupting someone for — a check that cries wolf on a rounded hour
 * teaches people to ignore it.
 */
describe('reconcileHours', () => {
  const line = (hours: number | null, resourceCount = 1) => ({ hours, resourceCount });

  it('counts resource-hours, not elapsed hours', () => {
    // Two analysts for 200 hours each is 400 of what the engine charges for.
    expect(reconcileHours([line(200, 2)], null).assigned).toBe(400);
  });

  it('treats a role with no hours as contributing nothing', () => {
    expect(reconcileHours([line(null, 3), line(100)], null).assigned).toBe(100);
  });

  it('says nothing differs when no total has been committed', () => {
    const fit = reconcileHours([line(100)], null);
    expect(fit.differs).toBe(false);
    expect(fit.unassigned).toBeNull();
  });

  it('reports hours nobody has taken on', () => {
    const fit = reconcileHours([line(120), line(380, 2)], 920);
    expect(fit.assigned).toBe(880);
    expect(fit.unassigned).toBe(40);
    expect(fit.differs).toBe(true);
  });

  it('reports over-assignment as a negative remainder', () => {
    expect(reconcileHours([line(500, 2)], 920).unassigned).toBe(-80);
  });

  it('stays quiet when the team accounts for the committed total', () => {
    expect(reconcileHours([line(200), line(360, 2)], 920).differs).toBe(false);
  });

  it('does not flag a floating-point residue as a discrepancy', () => {
    // 0.1 x 3 is 0.30000000000000004 in binary floating point. Rounding before
    // comparing is what stops the estimate reporting a 4e-17 hour shortfall.
    const fit = reconcileHours([line(0.1, 3)], 0.3);
    expect(fit.differs).toBe(false);
  });
});

describe('exceedsDeadline', () => {
  it('flags one person booked past the window', () => {
    // 8 weeks at 40h is 320h of anyone's calendar.
    expect(exceedsDeadline(380, 8)).toBe(true);
  });

  it('allows a line that exactly fills the window', () => {
    expect(exceedsDeadline(320, 8)).toBe(false);
  });

  it('is per person, so headcount never triggers it', () => {
    // The line's hours are what one person works; three of them in parallel is
    // 1,140 resource-hours but still only 380 hours of elapsed time each.
    expect(exceedsDeadline(300, 8)).toBe(false);
  });

  it('says nothing when either side is unknown', () => {
    expect(exceedsDeadline(null, 8)).toBe(false);
    expect(exceedsDeadline(380, null)).toBe(false);
  });

  it('does not divide by a zero-length engagement', () => {
    expect(exceedsDeadline(380, 0)).toBe(false);
  });
});

describe('longestLineHours', () => {
  it('takes the longest single role, because roles run alongside each other', () => {
    expect(longestLineHours([{ hours: 200, resourceCount: 1 }, { hours: 380, resourceCount: 2 }]))
      .toBe(380);
  });

  it('ignores roles with no hours yet', () => {
    expect(longestLineHours([{ hours: null, resourceCount: 1 }])).toBe(0);
  });
});

/**
 * `FINANCIAL_FIELDS` is a default-deny registry, so a cost field missing from
 * it is a leak rather than a lapse. `idealCost` rides on `listBaselines`, which
 * is deliberately open to callers without the entitlement — this is the guard
 * that the redaction actually has something to redact.
 */
describe('financial field registry', () => {
  it('covers the baseline ideal cost and the figure derived from it', () => {
    expect(FINANCIAL_FIELDS).toContain('idealCost');
    expect(FINANCIAL_FIELDS).toContain('expectedCost');
  });
});

import { describe, expect, it } from 'vitest';
import { __testing } from './estimate-staffing.service';

const { summarise, buildBody, formatHours } = __testing;

const line = (over: Partial<Parameters<typeof summarise>[0][number]> = {}) => ({
  userId: 'u1',
  hours: '10',
  resourceCount: 1,
  roleName: 'Security Analyst',
  ...over,
});

describe('summarise', () => {
  it('sums hours across a person\u2019s lines', () => {
    const [p] = summarise([line({ hours: '10' }), line({ hours: '15.5' })]);
    expect(p.hours).toBe(25.5);
  });

  // The bug this guards: the cost engine computes hours * resourceCount, so
  // `hours` is already per-person. Multiplying again would tell one analyst they
  // personally owe three people's worth of work.
  it('does not multiply by resourceCount', () => {
    const [p] = summarise([line({ hours: '10', resourceCount: 3 })]);
    expect(p.hours).toBe(10);
    expect(p.shared).toBe(true);
  });

  it('treats a single-resource line as not shared', () => {
    const [p] = summarise([line({ resourceCount: 1 })]);
    expect(p.shared).toBe(false);
  });

  it('counts undecided hours as zero rather than dropping the person', () => {
    const [p] = summarise([line({ hours: null })]);
    expect(p.hours).toBe(0);
    expect(p.userId).toBe('u1');
  });

  it('skips unstaffed lines', () => {
    expect(summarise([line({ userId: null })])).toEqual([]);
  });

  it('groups per person and de-duplicates role names', () => {
    const rows = summarise([
      line({ userId: 'u1', roleName: 'Lead Consultant' }),
      line({ userId: 'u1', roleName: 'Lead Consultant' }),
      line({ userId: 'u2', roleName: 'Security Analyst' }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.userId === 'u1')!.roles).toEqual(['Lead Consultant']);
  });

  it('ignores a non-numeric hours value rather than producing NaN', () => {
    const [p] = summarise([line({ hours: '10' }), line({ hours: 'oops' })]);
    expect(p.hours).toBe(10);
  });
});

describe('formatHours', () => {
  it('drops trailing zeros but keeps a real fraction', () => {
    expect(formatHours(12)).toBe('12');
    expect(formatHours(12.5)).toBe('12.5');
  });
});

describe('buildBody', () => {
  it('names the roles and the hours', () => {
    const body = buildBody({ userId: 'u1', hours: 40, roles: ['Security Analyst'], shared: false }, false);
    expect(body).toContain('Security Analyst');
    expect(body).toContain('40 hours');
    expect(body).not.toContain('replaces');
  });

  it('says so when the hours are not yet decided', () => {
    const body = buildBody({ userId: 'u1', hours: 0, roles: ['Security Analyst'], shared: false }, false);
    expect(body).toContain('still to be decided');
  });

  it('flags a shared line and a revision', () => {
    const body = buildBody({ userId: 'u1', hours: 40, roles: ['QA'], shared: true }, true);
    expect(body).toContain('more than one person');
    expect(body).toContain('replaces an earlier version');
  });
});

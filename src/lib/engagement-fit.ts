import { HOURS_PER_WEEK } from '@/lib/constants';

/**
 * Whether the team as assigned matches the engagement as committed.
 *
 * Both checks warn and neither blocks. The engagement hours and the deadline
 * are what was promised; the team lines are how someone proposes to deliver it.
 * When they disagree the right move depends on facts this code does not have —
 * the date may be soft, the hours may be padded, a role may be about to be
 * split — so the job here is to make the gap visible and stop.
 */

export interface AssignedLine {
  /** Null while nobody has decided how long this role is needed for. */
  hours: number | null;
  resourceCount: number;
}

export interface HoursReconciliation {
  /** Sum of hours x headcount across the team. */
  assigned: number;
  /** What the estimator committed to, or null if they have not said. */
  committed: number | null;
  /** committed - assigned. Positive means hours are still unspoken for. */
  unassigned: number | null;
  /** True when there is a committed figure and the two do not agree. */
  differs: boolean;
}

/**
 * Resource-hours, not elapsed hours: two analysts for 200 hours each is 400.
 * That is the same quantity the cost engine charges against, so the number the
 * estimator reconciles is the number they are paying for.
 */
export function reconcileHours(
  lines: AssignedLine[],
  committedHours: number | null
): HoursReconciliation {
  const assigned = lines.reduce(
    (sum, l) => sum + (l.hours ?? 0) * (l.resourceCount || 0),
    0
  );
  if (committedHours === null) {
    return { assigned, committed: null, unassigned: null, differs: false };
  }

  const unassigned = round2(committedHours - assigned);
  return {
    assigned,
    committed: committedHours,
    unassigned,
    // Rounded before comparing: hours carry two decimals, and a residue of
    // 0.004 is not a discrepancy anyone should be told about.
    differs: unassigned !== 0,
  };
}

/**
 * Can one person on this line actually finish it inside the deadline?
 *
 * A line's hours are per person, and the roles run alongside each other, so the
 * constraint is per line rather than across the team: three analysts at 380
 * hours each is 1,140 resource-hours but still only 380 hours of anybody's
 * calendar. Summing the lines would condemn every team of more than one.
 */
export function exceedsDeadline(
  lineHours: number | null,
  engagementWeeks: number | null,
  hoursPerWeek: number = HOURS_PER_WEEK
): boolean {
  if (lineHours === null || engagementWeeks === null || engagementWeeks <= 0) return false;
  return lineHours > engagementWeeks * hoursPerWeek;
}

/** The most hours any one person on the engagement is being asked for. */
export function longestLineHours(lines: AssignedLine[]): number {
  return lines.reduce((max, l) => Math.max(max, l.hours ?? 0), 0);
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

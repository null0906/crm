"use client";

import { useEffect, useState } from "react";
import { useAutosave } from "@/hooks/useAutosave";
import { SaveStatus } from "./SaveStatus";
import { AlertTriangle, Layers, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { HOURS_PER_WEEK } from "@/lib/constants";
import { exceedsDeadline, reconcileHours } from "@/lib/engagement-fit";

export interface TeamLineDraft {
  deliveryRoleId: string;
  /** Empty means costed at the role average rather than against a person. */
  userId: string;
  resourceCount: string;
  /** Empty while nobody has decided how long this role is needed for. */
  hours: string;
}

/** Blank stays blank: an unanswered field is not the number zero. */
function toHours(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Free capacity, as published by the Employee Ops platform.
 *
 * Hours, never money. `freeHours` is floored at zero on their side, so someone
 * booked 50h against a 40h week reads identically to someone exactly full —
 * which is the whole reason `overAllocated` is carried separately and must be
 * shown rather than inferred from a zero.
 */
export interface TeamAvailability {
  windowWeeks: number;
  people: { userId: string; freeHours: number; overAllocated: boolean }[];
  roles: { slug: string; peopleCount: number; freeHours: number }[];
}

/**
 * The engagement and the team: how long the client wants it, how many hours it
 * takes, and who spends them.
 *
 * This is where the judgement scoping used to make now lives. The period and
 * the total hours are typed, not derived — knowing the work is 2.3x standard
 * says nothing about how many hours anyone will commit — and the team lines
 * distribute those hours across people.
 *
 * Nothing here is enforced. The reconciliation and the deadline check report
 * the gap between what was committed and what was assigned, because closing it
 * needs facts this component does not have: whether the date is soft, whether
 * the hours were padded, whether a role is about to be split.
 *
 * Naming a person is what makes seat cost resolve — seat belongs to an
 * individual, so a line with nobody on it carries none and the engine says so.
 * Availability will eventually be surfaced in this same picker, which is why it
 * lists people rather than only echoing the role.
 */
export function TeamShapeEditor({
  lines,
  readOnly,
  onSave,
  isSaving,
  engagementWeeks,
  engagementHours,
  onSaveEngagement,
  isSavingEngagement,
  hasBaseline,
  onSeedRoles,
  isSeeding,
  isError = false,
  isErrorEngagement = false,
  availability = null,
}: {
  lines: TeamLineDraft[];
  readOnly: boolean;
  onSave: (lines: TeamLineDraft[]) => void;
  isSaving: boolean;
  engagementWeeks: number | null;
  engagementHours: number | null;
  onSaveEngagement: (input: { weeks: number | null; hours: number | null }) => void;
  isSavingEngagement: boolean;
  hasBaseline: boolean;
  onSeedRoles: () => void;
  isSeeding: boolean;
  isError?: boolean;
  isErrorEngagement?: boolean;
  /** Null while Employee Ops has not published availability, or cannot be read. */
  availability?: TeamAvailability | null;
}) {
  const { data: roles = [] } = trpc.costModel.listRoles.useQuery();
  const { data: staff = [] } = trpc.costModel.listStaffWithRoles.useQuery();
  const [draft, setDraft] = useState<TeamLineDraft[]>(lines);
  const [dirty, setDirty] = useState(false);

  // Seeding roles from the baseline appends lines server-side, so the editor has
  // to pick up the new shape rather than hold on to what was on screen -- but
  // only when the person is not mid-edit. After a save `dirty` is false and the
  // incoming copy is what was just sent, so this is a no-op; if they typed
  // during the round trip it is their keystrokes that win, and the next debounce
  // sends those instead.
  useEffect(() => {
    if (dirty) return;
    setDraft(lines);
  }, [lines, dirty]);

  // The committed figures are their own draft: they save on their own button,
  // separately from the team lines, so typing a deadline does not put the whole
  // roster into an unsaved state.
  const [weeksDraft, setWeeksDraft] = useState<string | null>(null);
  const [hoursDraft, setHoursDraft] = useState<string | null>(null);
  useEffect(() => {
    setWeeksDraft(null);
    setHoursDraft(null);
  }, [engagementWeeks, engagementHours]);

  function update(i: number, patch: Partial<TeamLineDraft>) {
    setDraft((d) => d.map((l, j) => (j === i ? { ...l, ...patch } : l)));
    setDirty(true);
  }

  const assigned = draft.map((l) => ({
    hours: toHours(l.hours),
    resourceCount: Number(l.resourceCount) || 0,
  }));

  const weeksValue = weeksDraft ?? (engagementWeeks === null ? "" : String(engagementWeeks));
  const hoursValue = hoursDraft ?? (engagementHours === null ? "" : String(engagementHours));

  // Checked against what is typed, not what is saved, so the reconciliation
  // moves as you edit rather than after a round trip.
  const committedWeeks = toHours(weeksValue);
  const fit = reconcileHours(assigned, toHours(hoursValue));
  const overdueLines = draft.filter((l) => exceedsDeadline(toHours(l.hours), committedWeeks));

  const weeksLabel = (hours: number) => (hours / HOURS_PER_WEEK).toFixed(1);
  // A blank hours field is a legitimate state, not an invalid one — a seeded
  // role sits there until somebody decides. Only a half-filled field is wrong.
  const valid = draft.every(
    (l) =>
      l.deliveryRoleId &&
      Number(l.resourceCount) > 0 &&
      (l.hours.trim() === "" || toHours(l.hours) !== null),
  );
  const blankHours = draft.filter((l) => l.hours.trim() === "").length;
  const named = draft.filter((l) => l.userId && Number(l.resourceCount) > 1);

  // Two autosaves, because they are two different writes: the committed period
  // and hours go to the estimate, the lines replace the team. Sharing one would
  // mean typing a deadline rewrote the whole roster.
  const team = useAutosave({
    value: draft,
    serialise: (d) =>
      JSON.stringify(d.map((l) => [l.deliveryRoleId, l.userId, l.resourceCount, l.hours.trim()])),
    isValid: () => valid,
    enabled: !readOnly,
    isSaving,
    isError,
    onSave: (d) => {
      setDirty(false);
      onSave(d);
    },
  });

  const engagement = useAutosave({
    value: { weeks: weeksValue, hours: hoursValue },
    serialise: (v) => `${v.weeks.trim()}|${v.hours.trim()}`,
    // A blank field is a decision nobody has made yet, which is savable. A
    // half-typed number is not.
    isValid: (v) =>
      (v.weeks.trim() === "" || toHours(v.weeks) !== null) &&
      (v.hours.trim() === "" || toHours(v.hours) !== null),
    enabled: !readOnly,
    isSaving: isSavingEngagement,
    isError: isErrorEngagement,
    onSave: (v) => onSaveEngagement({ weeks: toHours(v.weeks), hours: toHours(v.hours) }),
  });

  /**
   * People holding this delivery role first, everyone else under "Other".
   *
   * Not a hard filter. Someone may deliberately be costed against a role they
   * do not normally hold, and until delivery roles are assigned in Settings the
   * matching group is empty for every role — a strict filter would make the
   * picker look broken rather than unconfigured.
   */
  function grouped(deliveryRoleId: string) {
    return {
      matching: staff.filter((p) => p.deliveryRoleId === deliveryRoleId),
      others: staff.filter((p) => p.deliveryRoleId !== deliveryRoleId),
    };
  }

  return (
    <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_4px_rgba(16,24,40,0.04)]">
      <div className="mb-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[13px] font-medium text-slate-800">
            Engagement &amp; team
          </h2>
          {/* One pill for whichever write is in flight. They are separate
              mutations but a single panel, and two pills a few pixels apart
              would read as a fault rather than as progress. */}
          <SaveStatus status={engagement.status !== "idle" ? engagement.status : team.status} />
        </div>
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
          How long the client wants it, how many hours it takes, and who spends
          them. Cost is charged per person per hour, at {HOURS_PER_WEEK} hours a
          week. Naming someone is what brings their seat cost in — an unnamed
          line is priced at the role average. Changes save themselves.
        </p>
      </div>

      {/* ---- what was committed ---- */}
      <div className="mb-3 rounded-lg bg-slate-50/80 px-3 py-2.5">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="engagement-weeks" className="text-[11px]">
              Engagement period
            </Label>
            <div className="mt-1 flex items-center gap-1.5">
              <Input
                id="engagement-weeks"
                type="number"
                min={0}
                step="any"
                disabled={readOnly}
                value={weeksValue}
                onChange={(e) => setWeeksDraft(e.target.value)}
                className="h-8 w-20"
                placeholder="—"
              />
              <span className="text-[11px] text-slate-400">weeks</span>
            </div>
          </div>
          <div>
            <Label htmlFor="engagement-hours" className="text-[11px]">
              Total hours
            </Label>
            <div className="mt-1 flex items-center gap-1.5">
              <Input
                id="engagement-hours"
                type="number"
                min={0}
                step="any"
                disabled={readOnly}
                value={hoursValue}
                onChange={(e) => setHoursDraft(e.target.value)}
                className="h-8 w-24"
                placeholder="—"
              />
              <span className="text-[11px] text-slate-400">hours</span>
            </div>
          </div>
        </div>

        {/* Under the period rather than beside it: this is the total those two
            fields are being reconciled against, so it reads as their result
            instead of as a third input.
            
            The second figure is the PACE, not the duration. It previously showed
            the longest role's hours over 40 and called it "weeks long", which
            claimed a 16-week engagement lasted 1.6 weeks -- that number is how
            long one person would take at full time, which is effort, and the
            duration is the period committed in the field above. */}
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-slate-200/70 pt-2">
          <div>
            <span className="text-[16px] font-semibold tabular-nums text-slate-900">
              {fit.assigned}
            </span>
            <span className="ml-1.5 text-[10px] text-slate-400">assigned resource-hours</span>
          </div>
          {committedWeeks !== null && fit.assigned > 0 && (
            <div>
              <span className="text-[10px] text-slate-400">over </span>
              <span className="text-[16px] font-semibold tabular-nums text-slate-900">
                {committedWeeks}
              </span>
              <span className="ml-1.5 text-[10px] text-slate-400">
                weeks &mdash; about {(fit.assigned / committedWeeks).toFixed(1)}h of team time a
                week
              </span>
            </div>
          )}
        </div>

        {fit.differs && fit.unassigned !== null && (
          <p className="mt-2 text-[11px] leading-relaxed text-amber-700">
            {fit.unassigned > 0
              ? `${fit.unassigned}h of the ${fit.committed}h committed are not assigned to anyone yet.`
              : `The team is assigned ${Math.abs(fit.unassigned)}h more than the ${fit.committed}h committed.`}{" "}
            <span className="text-slate-400">
              Both are estimates — adjust whichever one is wrong.
            </span>
          </p>
        )}
        {!fit.differs && fit.committed !== null && (
          <p className="mt-2 text-[11px] text-slate-400">
            The team accounts for all {fit.committed}h.
          </p>
        )}
        <p className="mt-1.5 text-[10px] leading-relaxed text-slate-400">
          Nothing here is derived from the scoping multiplier — it says how big
          the work is, not how many hours you will commit to it.
        </p>
      </div>

      {overdueLines.length > 0 && committedWeeks !== null && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
          <p className="text-[11px] leading-relaxed text-amber-800">
            {overdueLines.length === 1 ? "One role is" : `${overdueLines.length} roles are`} booked
            for more hours than {committedWeeks} weeks allows one person (
            {committedWeeks * HOURS_PER_WEEK}h). This team cannot finish inside the deadline as it
            stands — split the role across more people, or move the date.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {draft.length === 0 && (
          <p className="text-[11px] text-slate-400">
            No team yet. Add a role
            {hasBaseline ? ", or seed the ones this service usually needs" : ""}.
          </p>
        )}
        {availability && availability.roles.length > 0 && (
          <p className="text-[10px] leading-relaxed text-slate-400">
            Free over the next {availability.windowWeeks} weeks:{" "}
            {availability.roles
              .map((r) => {
                const name = roles.find((x) => x.slug === r.slug)?.name ?? r.slug;
                return `${name} ${Math.round(r.freeHours)}h across ${r.peopleCount}`;
              })
              .join(" · ")}
            . A snapshot, not a booking.
          </p>
        )}
        {draft.map((line, i) => (
          <div key={i} className="flex items-center gap-2">
            <select
              disabled={readOnly}
              value={line.deliveryRoleId}
              onChange={(e) => update(i, { deliveryRoleId: e.target.value })}
              className="h-8 flex-1 rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-700 disabled:bg-slate-50"
            >
              <option value="">Role…</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <select
              disabled={readOnly}
              value={line.userId}
              onChange={(e) => update(i, { userId: e.target.value })}
              className="h-8 flex-1 rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-700 disabled:bg-slate-50"
            >
              <option value="">Choose a person…</option>
              {(() => {
                const { matching, others } = grouped(line.deliveryRoleId);
                const roleName =
                  roles.find((r) => r.id === line.deliveryRoleId)?.name ??
                  "This role";
                return (
                  <>
                    {matching.length > 0 && (
                      <optgroup label={roleName}>
                        {matching.map((p) => (
                          <option key={p.userId} value={p.userId}>
                            {p.firstName} {p.lastName}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {others.length > 0 && (
                      <optgroup label={matching.length > 0 ? "Other" : "Team"}>
                        {others.map((p) => (
                          <option key={p.userId} value={p.userId}>
                            {p.firstName} {p.lastName}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </>
                );
              })()}
            </select>
            <Input
              disabled={readOnly}
              type="number"
              min={1}
              value={line.resourceCount}
              onChange={(e) => update(i, { resourceCount: e.target.value })}
              className="h-8 w-16"
            />
            <span className="text-[11px] text-slate-400">people ×</span>
            <Input
              disabled={readOnly}
              type="number"
              min={0}
              step="any"
              value={line.hours}
              onChange={(e) => update(i, { hours: e.target.value })}
              className={
                exceedsDeadline(toHours(line.hours), committedWeeks)
                  ? "h-8 w-20 border-amber-300 bg-amber-50"
                  : "h-8 w-20"
              }
              placeholder="—"
            />
            <span className="w-10 text-[11px] text-slate-400">hours</span>
            <span
              className={
                exceedsDeadline(toHours(line.hours), committedWeeks)
                  ? "w-14 text-[10px] tabular-nums text-amber-600"
                  : "w-14 text-[10px] tabular-nums text-slate-300"
              }
              title={
                exceedsDeadline(toHours(line.hours), committedWeeks)
                  ? "More hours than one person can work in the engagement period"
                  : `Person-weeks of effort, at ${HOURS_PER_WEEK}h a week — not how long the engagement runs`
              }
            >
              {toHours(line.hours) !== null
                ? `${weeksLabel(toHours(line.hours)!)} wks`
                : "—"}
            </span>
            {availability && (() => {
              const person = line.userId
                ? availability.people.find((p) => p.userId === line.userId)
                : undefined;

              // No row is "unknown", not "no capacity": the person may not be set
              // up in Employee Ops, or the weeks may fall outside the published
              // window. Never render that as a zero.
              if (!person) {
                return (
                  <span
                    className="w-20 text-[10px] tabular-nums text-slate-300"
                    title={
                      line.userId
                        ? "No availability published for this person"
                        : "Name someone to see whether they are free"
                    }
                  >
                    —
                  </span>
                );
              }

              const need = toHours(line.hours);
              const short = need !== null && need > person.freeHours;
              const flag = person.overAllocated || short;

              return (
                <span
                  className={
                    flag
                      ? "w-20 text-[10px] tabular-nums text-amber-600"
                      : "w-20 text-[10px] tabular-nums text-slate-400"
                  }
                  title={
                    person.overAllocated
                      ? `Already booked past their contracted hours over the next ${availability.windowWeeks} weeks`
                      : short
                        ? `This line needs ${need}h but only ${Math.round(person.freeHours)}h are free over the next ${availability.windowWeeks} weeks`
                        : `Free over the next ${availability.windowWeeks} weeks. A snapshot, not a booking — nothing here reserves anyone.`
                  }
                >
                  {person.overAllocated
                    ? "overbooked"
                    : `${Math.round(person.freeHours)}h free`}
                </span>
              );
            })()}
            {!readOnly && (
              <button
                type="button"
                onClick={() => {
                  setDraft((d) => d.filter((_, j) => j !== i));
                  setDirty(true);
                }}
                className="p-1 text-slate-300 hover:text-red-500"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      {named.length > 0 && (
        <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
          {named.length === 1
            ? "One line names a person but carries more than one, so everyone on it is priced at that person's rate and seat."
            : `${named.length} lines name a person but carry more than one, so everyone on them is priced at that person's rate and seat.`}{" "}
          Split them into a line each to cost the individuals.
        </p>
      )}

      {blankHours > 0 && (
        <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
          {blankHours === 1
            ? "One role has no hours yet, so it costs nothing."
            : `${blankHours} roles have no hours yet, so they cost nothing.`}{" "}
          A seeded role sits blank until you decide how long it is needed for.
        </p>
      )}

      {!readOnly && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDraft((d) => [
                ...d,
                { deliveryRoleId: "", userId: "", resourceCount: "1", hours: "" },
              ]);
              setDirty(true);
            }}
          >
            <Plus className="mr-1 h-3 w-3" />
            Add role
          </Button>
          {hasBaseline && (
            <Button
              size="sm"
              variant="ghost"
              disabled={isSeeding}
              onClick={onSeedRoles}
              title="Adds any roles this service usually needs that are missing, with no hours"
            >
              <Layers className="mr-1 h-3 w-3" />
              {isSeeding ? "Seeding…" : "Seed roles from baseline"}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

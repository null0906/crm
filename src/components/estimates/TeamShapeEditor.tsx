"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { HOURS_PER_WEEK } from "@/lib/constants";

export interface TeamLineDraft {
  deliveryRoleId: string;
  /** Empty means costed at the role average rather than against a person. */
  userId: string;
  resourceCount: string;
  hours: string;
}

/**
 * The team shape: which roles, who is on them, for how many hours.
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
}: {
  lines: TeamLineDraft[];
  readOnly: boolean;
  onSave: (lines: TeamLineDraft[]) => void;
  isSaving: boolean;
}) {
  const { data: roles = [] } = trpc.costModel.listRoles.useQuery();
  const { data: staff = [] } = trpc.costModel.listStaffWithRoles.useQuery();
  const [draft, setDraft] = useState<TeamLineDraft[]>(lines);
  const [dirty, setDirty] = useState(false);

  // Re-sizing from the questionnaire replaces the team, so the editor has to
  // pick up the new shape rather than hold on to what was on screen.
  useEffect(() => {
    setDraft(lines);
    setDirty(false);
  }, [lines]);

  function update(i: number, patch: Partial<TeamLineDraft>) {
    setDraft((d) => d.map((l, j) => (j === i ? { ...l, ...patch } : l)));
    setDirty(true);
  }

  const totalEffort = draft.reduce(
    (sum, l) => sum + (Number(l.resourceCount) || 0) * (Number(l.hours) || 0),
    0,
  );

  /**
   * How long the engagement runs, as opposed to how much work it is.
   *
   * Roles run alongside each other, so the longest single role sets the
   * calendar. Three analysts at 416 hours each is 1,248 resource-hours of
   * effort but still only about ten weeks of elapsed time — summing the lines
   * would report a duration three times too long.
   */
  const longestLineHours = draft.reduce(
    (max, l) => Math.max(max, Number(l.hours) || 0),
    0,
  );
  const durationWeeks = longestLineHours / HOURS_PER_WEEK;
  const weeksLabel = (hours: number) => (hours / HOURS_PER_WEEK).toFixed(1);
  const valid = draft.every(
    (l) =>
      l.deliveryRoleId && Number(l.resourceCount) > 0 && Number(l.hours) > 0,
  );
  const named = draft.filter((l) => l.userId && Number(l.resourceCount) > 1);

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
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[13px] font-medium text-slate-800">
            Team &amp; hours
          </h2>
          <p className="mt-0.5 text-[11px] text-slate-400">
            Who is on it and for how long. Cost is charged per person per hour;
            the weeks are how long each role is on it, at {HOURS_PER_WEEK} hours
            a week. Naming someone is what brings their seat cost in — an
            unnamed line is priced at the role average.
          </p>
        </div>
        {/* <div className="text-right">
          <p className="text-[18px] font-semibold tabular-nums text-slate-900">
            {totalEffort}
          </p>
          <p className="text-[10px] text-slate-400">resource-hours</p>
          {durationWeeks > 0 && (
            <p className="mt-0.5 text-[11px] tabular-nums text-slate-500">
              {weeksLabel(longestLineHours)} weeks long
            </p>
          )}
        </div> */}
      </div>

      <div className="space-y-2">
        {draft.length === 0 && (
          <p className="text-[11px] text-slate-400">
            No team yet. Add a role, or answer the scoping questions to size one
            from the baseline.
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
              className="h-8 w-20"
            />
            <span className="w-10 text-[11px] text-slate-400">hours</span>
            <span
              className="w-14 text-[10px] tabular-nums text-slate-300"
              title="How long this role is on the engagement"
            >
              {Number(line.hours) > 0
                ? `${weeksLabel(Number(line.hours))} wks`
                : ""}
            </span>
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

      {!readOnly && (
        <div className="mt-3 flex items-center gap-2">
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
          {dirty && (
            <Button
              size="sm"
              disabled={!valid || isSaving}
              onClick={() => onSave(draft)}
            >
              {isSaving ? "Saving…" : "Save team"}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

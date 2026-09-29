'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useFinancialAccess } from '@/components/shared/FinancialAccessGate';
import { BaselineForm, type BaselineFormValue } from '@/components/effort-catalog/BaselineForm';

export interface ChecklistBaseline {
  id: string;
  name: string;
  version: number;
  confidence: string;
  isJudgementBased: boolean;
  lines: {
    id: string;
    deliveryRoleId: string;
    deliveryRoleName: string | null;
    resourceCount: number;
    hours: string;
  }[];
}

/**
 * Which roles a standard engagement of this service line needs.
 *
 * A checklist, not a plan. Creating an estimate copies these roles and their
 * usual headcount onto the sheet with no hours, and the button in the builder
 * adds any that are missing later. The hours stored against each role are the
 * record of what past engagements took — visible here as context, never copied
 * anywhere, because how long this engagement needs a role for is a decision
 * belonging to whoever is scoping it.
 *
 * Revising writes a new version and retires the old one, so an estimate built
 * six months ago still resolves the checklist it was actually built from.
 */
export function RoleChecklistCard({
  serviceLine,
  baseline,
}: {
  serviceLine: string;
  baseline: ChecklistBaseline | null;
}) {
  const utils = trpc.useUtils();
  const { hasAccess } = useFinancialAccess();
  const [editing, setEditing] = useState(false);

  const refresh = () => {
    setEditing(false);
    void utils.catalog.listBaselines.invalidate();
  };
  const fail = (what: string) => (e: { message: string }) =>
    toast.error(`Could not ${what}`, { description: e.message });

  const create = trpc.catalog.createBaseline.useMutation({
    onSuccess: () => { toast.success('Role checklist created'); refresh(); },
    onError: fail('create the checklist'),
  });
  const revise = trpc.catalog.reviseBaseline.useMutation({
    onSuccess: () => { toast.success('Saved as a new version'); refresh(); },
    onError: fail('revise the checklist'),
  });

  const busy = create.isPending || revise.isPending;

  function submit(value: BaselineFormValue) {
    const lines = value.lines
      .filter((l) => l.deliveryRoleId && Number(l.resourceCount) > 0 && Number(l.hours) > 0)
      .map((l) => ({
        deliveryRoleId: l.deliveryRoleId,
        resourceCount: Number(l.resourceCount),
        hours: Number(l.hours),
      }));

    if (baseline) revise.mutate({ id: baseline.id, name: value.name, lines });
    else
      create.mutate({
        serviceLine,
        segment: value.segment || 'standard',
        name: value.name,
        lines,
      });
  }

  if (editing) {
    return (
      <BaselineForm
        mode={baseline ? 'revise' : 'create'}
        initial={{
          serviceLine,
          segment: 'standard',
          name: baseline?.name ?? '',
          lines:
            baseline?.lines.map((l) => ({
              deliveryRoleId: l.deliveryRoleId,
              resourceCount: String(l.resourceCount),
              hours: String(Number(l.hours)),
            })) ?? [],
        }}
        busy={busy}
        onCancel={() => setEditing(false)}
        onSubmit={submit}
      />
    );
  }

  return (
    <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_4px_rgba(16,24,40,0.04)]">
      <div className="mb-2 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-[12px] font-medium text-slate-700">
            Role checklist
            {baseline && (
              <span className="ml-1.5 text-[11px] font-normal text-slate-400">
                v{baseline.version}
              </span>
            )}
          </h3>
          <p className="mt-0.5 max-w-xl text-[11px] leading-relaxed text-slate-400">
            The roles a standard engagement of this service needs. New estimates start with these
            on the sheet and no hours against them.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {baseline?.isJudgementBased && <Badge variant="warning">judgement-based</Badge>}
          {hasAccess && (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              {baseline ? 'Revise' : 'Add roles'}
            </Button>
          )}
        </div>
      </div>

      {!baseline && (
        <p className="text-[11px] leading-relaxed text-slate-400">
          No checklist yet, so estimates on this service line start from a blank sheet.
        </p>
      )}

      {baseline && (
        <>
          <table className="w-full">
            <tbody>
              {baseline.lines.map((l) => (
                <tr key={l.id} className="border-b border-slate-50 last:border-0">
                  <td className="py-1.5 text-[12px] text-slate-700">
                    {l.deliveryRoleName ?? 'Unknown role'}
                  </td>
                  <td className="py-1.5 text-right text-[11px] tabular-nums text-slate-500">
                    {l.resourceCount} {l.resourceCount === 1 ? 'person' : 'people'}
                  </td>
                  <td className="w-28 py-1.5 text-right text-[11px] tabular-nums text-slate-300">
                    {Number(l.hours)}h typical
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
            The hours are reference only — what these engagements have historically taken. Seeding
            an estimate copies the roles and the headcount, never the hours.
          </p>
        </>
      )}
    </section>
  );
}

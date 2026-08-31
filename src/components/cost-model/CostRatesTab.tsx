'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatCurrency } from '@/lib/formatters';
import { RateEditDialog, type CostComponent, type RateTarget } from './RateEditDialog';

interface ComponentRow {
  id: string;
  scope: 'default' | 'role' | 'employee';
  userId: string | null;
  component: CostComponent;
  amountPerHour: string;
  effectiveFrom: string;
}

/**
 * What each person costs per hour.
 *
 * This was a role-by-component matrix — "a Security Analyst costs 650" — with a
 * company default beneath it. Both are gone: a role rate is an average of what
 * several people are paid, so an estimate built on one is only accidentally
 * right about whoever actually turns up. Both components now belong to an
 * individual, and a line naming nobody is reported as uncosted rather than
 * quietly priced at the average.
 *
 * Seat lives here too, beside base. It used to sit in Delivery Roles, which
 * meant one person's cost was split across two tabs for no reason anybody
 * could act on.
 */
export function CostRatesTab() {
  const utils = trpc.useUtils();
  const { data: staff = [], isLoading: staffLoading } = trpc.costModel.listStaffWithRoles.useQuery();
  const { data: components = [], isLoading } = trpc.costModel.listComponents.useQuery();
  const [editing, setEditing] = useState<RateTarget | null>(null);

  const rows = components as unknown as ComponentRow[];

  /** Standing rate per (person, component). Only employee scope resolves now. */
  const byPerson = useMemo(() => {
    const map = new Map<string, Map<CostComponent, ComponentRow>>();
    for (const r of rows) {
      if (r.scope !== 'employee' || !r.userId) continue;
      if (!map.has(r.userId)) map.set(r.userId, new Map());
      map.get(r.userId)!.set(r.component, r);
    }
    return map;
  }, [rows]);

  // The gap that actually stops an estimate costing. A missing delivery role
  // used to matter here too, because a rate could be inherited from it; now it
  // only groups the team picker, so it gets a quiet note rather than a warning.
  const missingBase = staff.filter((p) => !byPerson.get(p.userId)?.get('base'));

  function open(person: (typeof staff)[number], component: CostComponent) {
    const current = byPerson.get(person.userId)?.get(component);
    setEditing({
      scope: 'employee',
      component,
      deliveryRoleId: null,
      userId: person.userId,
      label: `${person.firstName} ${person.lastName}`,
      currentAmount: current ? Number(current.amountPerHour) : null,
      currentSince: current?.effectiveFrom ?? null,
    });
  }

  function Cell({
    person,
    component,
  }: {
    person: (typeof staff)[number];
    component: CostComponent;
  }) {
    const current = byPerson.get(person.userId)?.get(component);
    return (
      <td className="px-4 py-2.5 text-right">
        <button
          type="button"
          onClick={() => open(person, component)}
          className="group rounded-md px-2 py-1 text-right transition-colors hover:bg-slate-50"
        >
          {current ? (
            <span className="text-[13px] tabular-nums text-slate-800">
              {formatCurrency(Number(current.amountPerHour))}
            </span>
          ) : (
            <span className="text-[12px] text-slate-300 group-hover:text-slate-500">
              {component === 'base' ? 'Not set' : '—'}
            </span>
          )}
        </button>
      </td>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[11px] leading-relaxed text-slate-400">
        What each person costs per hour: <strong className="font-medium text-slate-500">base</strong>{' '}
        is what they are paid, <strong className="font-medium text-slate-500">seat</strong> is their
        laptop, licences and desk. Both are set against the individual — an estimate line that names
        nobody carries no cost and says so, rather than falling back on a role average. Editing a
        rate closes the current one and opens a new one from a date, so historic estimates still
        reproduce.
      </p>

      {!isLoading && !staffLoading && missingBase.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
          <div>
            <p className="text-[12px] font-medium text-amber-900">
              {missingBase.length === staff.length
                ? 'No cost rates are set'
                : `${missingBase.length} ${missingBase.length === 1 ? 'person has' : 'people have'} no cost rate`}
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-amber-800">
              {missingBase.length === staff.length
                ? 'Nothing is seeded on purpose — these are your salary-derived figures and a placeholder would quietly produce wrong margins. Until they are set, every estimate costs zero and warns.'
                : `Any estimate line naming ${missingBase
                    .slice(0, 3)
                    .map((p) => p.firstName)
                    .join(', ')}${missingBase.length > 3 ? ' and others' : ''} costs zero.`}
            </p>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_4px_rgba(16,24,40,0.04)]">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Person</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">
                Base / hour
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">
                Seat / hour
              </th>
            </tr>
          </thead>
          <tbody>
            {staff.map((person) => (
              <tr key={person.userId} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2.5">
                  <p className="text-[13px] text-slate-800">
                    {person.firstName} {person.lastName}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {person.deliveryRoleName ?? (
                      <span className="text-slate-300">No delivery role</span>
                    )}
                  </p>
                </td>
                <Cell person={person} component="base" />
                <Cell person={person} component="seat" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!staffLoading && staff.length === 0 && (
        <p className="px-1 text-[12px] text-slate-400">
          No active people to cost. Add them in Settings → Users.
        </p>
      )}

      <p className="px-1 text-[10px] leading-relaxed text-slate-400">
        A person with no delivery role can still be costed — the role only decides where they appear
        in an estimate&apos;s team picker. Assign one in Delivery Roles.
      </p>

      <RateEditDialog
        target={editing}
        onClose={(changed) => {
          setEditing(null);
          if (changed) void utils.costModel.listComponents.invalidate();
        }}
      />
    </div>
  );
}

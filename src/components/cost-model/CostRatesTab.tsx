'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatCurrency } from '@/lib/formatters';
import {
  COMPONENT_LABEL,
  RateEditDialog,
  type CostComponent,
  type RateTarget,
} from './RateEditDialog';

// Base only. Seat is set against a person in Delivery Roles, and support is a
// cost line on the estimate — neither belongs in a role-by-component matrix.
const COMPONENTS: CostComponent[] = ['base'];

interface ComponentRow {
  id: string;
  scope: 'default' | 'role' | 'employee';
  deliveryRoleId: string | null;
  component: CostComponent;
  amountPerHour: string;
  effectiveFrom: string;
}

/**
 * The rate matrix: roles down, cost components across.
 *
 * A cell shows the figure the engine would actually resolve, and says when that
 * came from the company default rather than being set for the role — because
 * "38,000" meaning "inherited" and "38,000" meaning "deliberately set" are
 * different facts, and only one of them is a decision someone made.
 */
export function CostRatesTab() {
  const utils = trpc.useUtils();
  const { data: roles = [] } = trpc.costModel.listRoles.useQuery();
  const { data: components = [], isLoading } = trpc.costModel.listComponents.useQuery();
  const [editing, setEditing] = useState<RateTarget | null>(null);

  const rows = components as unknown as ComponentRow[];

  const defaults = useMemo(() => {
    const map = new Map<CostComponent, ComponentRow>();
    for (const r of rows) if (r.scope === 'default') map.set(r.component, r);
    return map;
  }, [rows]);

  const byRole = useMemo(() => {
    const map = new Map<string, Map<CostComponent, ComponentRow>>();
    for (const r of rows) {
      if (r.scope !== 'role' || !r.deliveryRoleId) continue;
      if (!map.has(r.deliveryRoleId)) map.set(r.deliveryRoleId, new Map());
      map.get(r.deliveryRoleId)!.set(r.component, r);
    }
    return map;
  }, [rows]);

  const missingBase = roles.filter(
    (role) => !byRole.get(role.id)?.get('base') && !defaults.get('base')
  );

  function openCell(
    scope: 'default' | 'role',
    component: CostComponent,
    role?: { id: string; name: string }
  ) {
    const own = scope === 'default' ? defaults.get(component) : byRole.get(role!.id)?.get(component);
    const fallback = scope === 'role' ? defaults.get(component) : undefined;
    const shown = own ?? fallback;
    setEditing({
      scope,
      component,
      deliveryRoleId: role?.id ?? null,
      label: scope === 'default' ? 'Company default' : role!.name,
      currentAmount: shown ? Number(shown.amountPerHour) : null,
      currentSince: shown?.effectiveFrom ?? null,
      isInherited: !own && !!fallback,
    });
  }

  function Cell({
    scope,
    component,
    role,
  }: {
    scope: 'default' | 'role';
    component: CostComponent;
    role?: { id: string; name: string };
  }) {
    const own = scope === 'default' ? defaults.get(component) : byRole.get(role!.id)?.get(component);
    const fallback = scope === 'role' ? defaults.get(component) : undefined;
    const shown = own ?? fallback;

    return (
      <td className="px-4 py-2.5">
        <button
          type="button"
          onClick={() => openCell(scope, component, role)}
          className="group w-full rounded-md px-2 py-1 text-left transition-colors hover:bg-slate-50"
        >
          {shown ? (
            <>
              <span className="text-[13px] tabular-nums text-slate-800">
                {formatCurrency(Number(shown.amountPerHour))}
              </span>
              {!own && (
                <span className="ml-1.5 text-[10px] text-slate-400">inherited</span>
              )}
            </>
          ) : (
            <span className="text-[12px] text-slate-300 group-hover:text-slate-500">Not set</span>
          )}
        </button>
      </td>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[11px] leading-relaxed text-slate-400">
        The hourly salary-derived cost of each delivery role. A role without its own figure
        inherits the company default, and a person whose cost is genuinely out of line with their
        role can be given their own rate. Editing a rate closes the current one and opens a new one
        from a date — nothing is overwritten, so historic estimates still reproduce.
      </p>

      {!isLoading && rows.length === 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
          <div>
            <p className="text-[12px] font-medium text-amber-900">No cost rates are set</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-amber-800">
              Nothing is seeded on purpose — these are your salary-derived figures and a placeholder
              would quietly produce wrong margins. Until they are set, every estimate will cost zero
              and warn.
            </p>
          </div>
        </div>
      )}

      {!isLoading && rows.length > 0 && missingBase.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
          <p className="text-[11px] leading-relaxed text-amber-800">
            No base cost for {missingBase.map((r) => r.name).join(', ')}. Estimates using{' '}
            {missingBase.length === 1 ? 'that role' : 'those roles'} will treat it as zero.
          </p>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_4px_rgba(16,24,40,0.04)]">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Role</th>
              {COMPONENTS.map((c) => (
                <th key={c} className="px-4 py-3 text-left text-xs font-medium text-slate-500">
                  {COMPONENT_LABEL[c]} / hour
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-100 bg-slate-50/60">
              <td className="px-4 py-2.5">
                <span className="text-[13px] font-medium text-slate-700">Company default</span>
                <p className="text-[10px] text-slate-400">Applies where a role has no figure</p>
              </td>
              {COMPONENTS.map((c) => (
                <Cell key={c} scope="default" component={c} />
              ))}
            </tr>

            {roles.map((role) => {
              return (
                <tr key={role.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2.5">
                    <span className="text-[13px] text-slate-800">{role.name}</span>
                  </td>
                  {COMPONENTS.map((c) => (
                    <Cell key={c} scope="role" component={c} role={role} />
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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

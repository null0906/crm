'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';

export interface DriverOption {
  id: string;
  value: string;
  label: string;
  multiplier: string;
  position: number;
}

export interface Driver {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  valueType: 'select' | 'number';
  appliesTo: 'hours' | 'team' | 'both';
  multiplierPerUnit: string | null;
  unitBaseline: number;
  position: number;
  isActive: boolean;
  options: DriverOption[];
}

const APPLIES_HINT: Record<string, string> = {
  hours: 'Same team, more hours each.',
  team: 'Same hours each, more people.',
  both: 'Split across both, so total effort matches the multiplier rather than squaring it.',
};

/** "+5% for each beyond 1" — what the two numeric fields actually mean. */
function numericSentence(perUnit: string, baseline: number): string {
  const pct = Math.round(Number(perUnit || 0) * 1000) / 10;
  if (!Number.isFinite(pct) || pct === 0) return 'No effect per unit.';
  return `${pct > 0 ? '+' : ''}${pct}% for each beyond ${baseline}.`;
}

export function DriverEditor({ driver, canEdit }: { driver: Driver; canEdit: boolean }) {
  const utils = trpc.useUtils();
  const refresh = () => utils.sizing.listDrivers.invalidate();

  const [name, setName] = useState(driver.name);
  const [appliesTo, setAppliesTo] = useState(driver.appliesTo);
  const [perUnit, setPerUnit] = useState(driver.multiplierPerUnit ?? '');
  const [baseline, setBaseline] = useState(String(driver.unitBaseline));
  const [options, setOptions] = useState<DriverOption[]>(driver.options);
  const [adding, setAdding] = useState<{ label: string; value: string; multiplier: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<DriverOption | null>(null);

  // The list refetches after every mutation; pick up server state rather than
  // holding a stale copy on screen.
  useEffect(() => {
    setName(driver.name);
    setAppliesTo(driver.appliesTo);
    setPerUnit(driver.multiplierPerUnit ?? '');
    setBaseline(String(driver.unitBaseline));
    setOptions(driver.options);
  }, [driver]);

  const fail = (what: string) => (e: { message: string }) =>
    toast.error(`Could not ${what}`, { description: e.message });

  const update = trpc.sizing.updateDriver.useMutation({
    onSuccess: () => { toast.success('Driver saved'); void refresh(); },
    onError: fail('save the driver'),
  });
  const upsertOption = trpc.sizing.upsertOption.useMutation({
    onSuccess: () => { toast.success('Option saved'); setAdding(null); void refresh(); },
    onError: fail('save the option'),
  });
  const deleteOption = trpc.sizing.deleteOption.useMutation({
    onSuccess: () => { toast.success('Option removed'); void refresh(); },
    onError: fail('remove the option'),
  });

  const driverDirty =
    name !== driver.name ||
    appliesTo !== driver.appliesTo ||
    perUnit !== (driver.multiplierPerUnit ?? '') ||
    baseline !== String(driver.unitBaseline);

  const numericValid =
    driver.valueType !== 'number' ||
    (perUnit.trim() !== '' && Number.isFinite(Number(perUnit)) && Number(perUnit) >= 0);

  function optionChanged(o: DriverOption): boolean {
    const original = driver.options.find((x) => x.id === o.id);
    return !!original && (original.label !== o.label || original.multiplier !== o.multiplier);
  }

  return (
    <div
      className={
        driver.isActive
          ? 'rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_4px_rgba(16,24,40,0.04)]'
          : 'rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-4'
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {canEdit ? (
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 max-w-sm font-medium"
            />
          ) : (
            <p className="text-[13px] font-medium text-slate-800">{driver.name}</p>
          )}
          <p className="mt-1 text-[10px] text-slate-400">
            <code>{driver.slug}</code> · {driver.valueType === 'number' ? 'numeric' : 'choose one'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!driver.isActive && <Badge variant="secondary">inactive</Badge>}
          {canEdit && (
            <Button
              size="sm"
              variant="ghost"
              disabled={update.isPending}
              onClick={() => update.mutate({ id: driver.id, isActive: !driver.isActive })}
            >
              {driver.isActive ? 'Deactivate' : 'Reactivate'}
            </Button>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-[11px] text-slate-500">What it changes</label>
          {canEdit ? (
            <select
              value={appliesTo}
              onChange={(e) => setAppliesTo(e.target.value as Driver['appliesTo'])}
              className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-700"
            >
              <option value="hours">Adds hours</option>
              <option value="team">Adds people</option>
              <option value="both">Both</option>
            </select>
          ) : (
            <p className="mt-1 text-[12px] text-slate-700">{appliesTo}</p>
          )}
          <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
            {APPLIES_HINT[appliesTo]}
          </p>
        </div>

        {driver.valueType === 'number' && (
          <div>
            <label className="text-[11px] text-slate-500">Rate per unit</label>
            <div className="mt-1 flex items-center gap-2">
              <Input
                type="number"
                step="any"
                min={0}
                disabled={!canEdit}
                value={perUnit}
                onChange={(e) => setPerUnit(e.target.value)}
                className="h-8 w-24"
                placeholder="0.05"
              />
              <span className="text-[11px] text-slate-400">beyond</span>
              <Input
                type="number"
                min={0}
                disabled={!canEdit}
                value={baseline}
                onChange={(e) => setBaseline(e.target.value)}
                className="h-8 w-20"
              />
            </div>
            <p className="mt-1 text-[10px] text-slate-400">
              {numericSentence(perUnit, Number(baseline) || 0)}
            </p>
          </div>
        )}
      </div>

      {driver.valueType === 'select' && (
        <div className="mt-3">
          <label className="text-[11px] text-slate-500">Answers</label>
          <div className="mt-1 space-y-1.5">
            {options.map((o, i) => (
              <div key={o.id} className="flex items-center gap-2">
                <Input
                  disabled={!canEdit}
                  value={o.label}
                  onChange={(e) =>
                    setOptions((os) => os.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                  }
                  className="h-8 flex-1"
                />
                <Input
                  disabled={!canEdit}
                  type="number"
                  step="any"
                  min={0}
                  value={o.multiplier}
                  onChange={(e) =>
                    setOptions((os) => os.map((x, j) => (j === i ? { ...x, multiplier: e.target.value } : x)))
                  }
                  className="h-8 w-24"
                />
                {canEdit && optionChanged(o) && (
                  <Button
                    size="sm"
                    disabled={upsertOption.isPending}
                    onClick={() =>
                      upsertOption.mutate({
                        driverId: driver.id,
                        value: o.value,
                        label: o.label.trim(),
                        multiplier: Number(o.multiplier),
                        position: o.position,
                      })
                    }
                  >
                    Save
                  </Button>
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(o)}
                    className="p-1 text-slate-300 hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}

            {adding && (
              <div className="flex items-center gap-2">
                <Input
                  autoFocus
                  value={adding.label}
                  onChange={(e) =>
                    setAdding((a) => ({
                      ...a!,
                      label: e.target.value,
                      // The value is the stable key upsertOption matches on, so
                      // it is derived once from the label and then fixed.
                      value: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60),
                    }))
                  }
                  placeholder="Answer label"
                  className="h-8 flex-1"
                />
                <Input
                  type="number"
                  step="any"
                  min={0}
                  value={adding.multiplier}
                  onChange={(e) => setAdding((a) => ({ ...a!, multiplier: e.target.value }))}
                  placeholder="1.0"
                  className="h-8 w-24"
                />
                <Button
                  size="sm"
                  disabled={
                    !adding.label.trim() ||
                    !adding.value ||
                    !(Number(adding.multiplier) > 0) ||
                    options.some((o) => o.value === adding.value) ||
                    upsertOption.isPending
                  }
                  onClick={() =>
                    upsertOption.mutate({
                      driverId: driver.id,
                      value: adding.value,
                      label: adding.label.trim(),
                      multiplier: Number(adding.multiplier),
                      position: options.length,
                    })
                  }
                >
                  Add
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAdding(null)}>
                  Cancel
                </Button>
              </div>
            )}
          </div>

          {canEdit && !adding && (
            <Button
              size="sm"
              variant="ghost"
              className="mt-1"
              onClick={() => setAdding({ label: '', value: '', multiplier: '1.0' })}
            >
              <Plus className="mr-1 h-3 w-3" />
              Add answer
            </Button>
          )}
        </div>
      )}

      {canEdit && driverDirty && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <Button
            size="sm"
            disabled={!numericValid || name.trim().length < 2 || update.isPending}
            onClick={() =>
              update.mutate({
                id: driver.id,
                name: name.trim(),
                appliesTo,
                ...(driver.valueType === 'number'
                  ? { multiplierPerUnit: Number(perUnit), unitBaseline: Number(baseline) || 0 }
                  : {}),
              })
            }
          >
            {update.isPending ? 'Saving…' : 'Save driver'}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title={`Remove "${confirmDelete?.label}"?`}
        description="Estimates that used this answer keep the multiplier they were built with, so no figure changes. They will lose the record of which answer was chosen. This cannot be undone."
        confirmLabel="Remove answer"
        onConfirm={() => {
          if (confirmDelete) deleteOption.mutate({ id: confirmDelete.id });
          setConfirmDelete(null);
        }}
      />
    </div>
  );
}

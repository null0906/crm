'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';

/**
 * What this service line is called, and whether it is still offered.
 *
 * The slug is shown but never editable. Every table that references a service
 * line stores it as a plain string — estimates, baselines, margin targets, the
 * driver links — so renaming one would orphan all of them at once. Relabelling
 * is safe and is what this card is for; renaming is a data migration.
 *
 * Retiring is a deactivation rather than a delete, for the same reason: an
 * estimate signed last year stores the slug and has to stay legible.
 */
export function ServiceLineIdentityCard({
  slug,
  label,
  isActive,
  canEdit,
  onDeactivated,
}: {
  slug: string;
  label: string;
  isActive: boolean;
  canEdit: boolean;
  onDeactivated: () => void;
}) {
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState<string | null>(null);
  const [confirmRetire, setConfirmRetire] = useState(false);

  useEffect(() => setDraft(null), [slug, label]);

  const refresh = () => utils.serviceLines.list.invalidate();

  const save = trpc.serviceLines.upsert.useMutation({
    onSuccess: () => { toast.success('Service line saved'); setDraft(null); void refresh(); },
    onError: (e) => toast.error('Could not save', { description: e.message }),
  });
  const deactivate = trpc.serviceLines.deactivate.useMutation({
    onSuccess: () => {
      toast.success('Service line retired');
      setConfirmRetire(false);
      void refresh();
      onDeactivated();
    },
    onError: (e) => toast.error('Could not retire it', { description: e.message }),
  });

  const value = draft ?? label;

  return (
    <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_4px_rgba(16,24,40,0.04)]">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1">
          <label htmlFor="sl-label" className="text-[11px] text-slate-500">
            Label
          </label>
          <Input
            id="sl-label"
            value={value}
            disabled={!canEdit}
            onChange={(e) => setDraft(e.target.value)}
            className="mt-1 h-8"
          />
        </div>
        <div className="pb-1">
          <p className="text-[10px] text-slate-400">stored as</p>
          <p className="font-mono text-[11px] text-slate-500">{slug}</p>
        </div>
        {!isActive && <Badge variant="outline">retired</Badge>}
        {canEdit && draft !== null && draft.trim().length > 1 && (
          <Button
            size="sm"
            disabled={save.isPending}
            onClick={() => save.mutate({ slug, label: draft.trim(), isActive })}
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        )}
      </div>

      <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
        The label is safe to change — it is only rendered. The slug is what every estimate,
        checklist and margin target stores, so it is fixed once created.
      </p>

      {canEdit && isActive && (
        <button
          type="button"
          onClick={() => setConfirmRetire(true)}
          className="mt-2 text-[11px] text-slate-400 underline-offset-2 hover:text-red-600 hover:underline"
        >
          Retire this service line
        </button>
      )}
      {canEdit && !isActive && (
        <Button
          size="sm"
          variant="ghost"
          className="mt-2"
          disabled={save.isPending}
          onClick={() => save.mutate({ slug, label: value.trim(), isActive: true })}
        >
          Offer it again
        </Button>
      )}

      <ConfirmDialog
        open={confirmRetire}
        onOpenChange={setConfirmRetire}
        title={`Retire ${label}?`}
        description="It stops being offered on new estimates. Nothing already costed changes — estimates, checklists and margin targets keep referencing it, and you can offer it again at any time."
        confirmLabel="Retire"
        loading={deactivate.isPending}
        onConfirm={() => deactivate.mutate({ slug })}
      />
    </section>
  );
}

'use client';

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const emptyToUndefined = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? undefined : v;

const schema = z.object({
  callType: z.enum(['discovery', 'demo', 'follow_up', 'proposal_walkthrough', 'onboarding', 'check_in']),
  scheduledAt: z.preprocess(emptyToUndefined, z.string().optional()),
  durationMinutes: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).optional()),
  outcome: z.preprocess(
    emptyToUndefined,
    z.enum(['completed', 'no_show', 'rescheduled', 'cancelled', 'interested', 'not_interested', 'needs_follow_up']).optional(),
  ),
  attendees: z.preprocess(emptyToUndefined, z.string().optional()),
  clientRequirements: z.preprocess(emptyToUndefined, z.string().optional()),
  painPoints: z.preprocess(emptyToUndefined, z.string().optional()),
  objections: z.preprocess(emptyToUndefined, z.string().optional()),
  nextAction: z.preprocess(emptyToUndefined, z.string().optional()),
  nextActionDate: z.preprocess(emptyToUndefined, z.string().optional()),
  demoNotes: z.preprocess(emptyToUndefined, z.string().optional()),
  conductedBy: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
});

type FormData = z.infer<typeof schema>;

const CALL_TYPE_LABELS: Record<string, string> = {
  discovery: 'Discovery Call',
  demo: 'Demo',
  follow_up: 'Follow-up',
  proposal_walkthrough: 'Proposal Walkthrough',
  onboarding: 'Onboarding',
  check_in: 'Check-in',
};

const OUTCOME_LABELS: Record<string, string> = {
  completed: 'Completed',
  no_show: 'No Show',
  rescheduled: 'Rescheduled',
  cancelled: 'Cancelled',
  interested: 'Interested',
  not_interested: 'Not Interested',
  needs_follow_up: 'Needs Follow-up',
};

interface LogDemoPanelProps {
  companyId?: string;
  contactId?: string;
  dealId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function LogDemoPanel({ companyId, contactId, dealId, onSuccess, onCancel }: LogDemoPanelProps) {
  const utils = trpc.useUtils();

  const { data: usersData = [] } = trpc.users.list.useQuery(undefined);
  const teamMembers = usersData as Array<Record<string, unknown>>;

  const createDemo = trpc.demoRecords.create.useMutation({
    onSuccess: () => {
      toast.success('Demo record saved');
      void utils.demoRecords.list.invalidate();
      onSuccess?.();
    },
    onError: (err) => toast.error('Failed to save demo record', { description: err.message }),
  });

  const now = new Date();
  const localDatetime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);

  const form = useForm<FormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: { callType: 'demo', scheduledAt: localDatetime },
    shouldUnregister: true,
  });

  const callType = form.watch('callType');
  const isDiscoveryOrDemo = callType === 'discovery' || callType === 'demo';

  function onSubmit(data: FormData) {
    let scheduledAt: string | undefined;
    if (data.scheduledAt) {
      try { scheduledAt = new Date(data.scheduledAt).toISOString(); } catch { /* ignore */ }
    }

    createDemo.mutate({
      callType: data.callType,
      scheduledAt,
      durationMinutes: data.durationMinutes ?? null,
      outcome: data.outcome ?? null,
      attendees: data.attendees ?? null,
      clientRequirements: data.clientRequirements ?? null,
      painPoints: data.painPoints ?? null,
      objections: data.objections ?? null,
      nextAction: data.nextAction ?? null,
      nextActionDate: data.nextActionDate ?? null,
      demoNotes: data.demoNotes ?? null,
      conductedBy: data.conductedBy ?? null,
      companyId: companyId ?? null,
      contactId: contactId ?? null,
      dealId: dealId ?? null,
    });
  }

  const inputCls = 'flex h-8 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500';

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit, () => {
        const firstErr = Object.values(form.formState.errors)[0];
        toast.error('Please fix the form', {
          description: typeof firstErr?.message === 'string' ? firstErr.message : 'Check required fields.',
        });
      })}
      className="space-y-3 p-4 border border-slate-200 rounded-lg bg-slate-50"
    >
      {/* Type + Date + Duration */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Call Type</Label>
          <select {...form.register('callType')} className={inputCls}>
            {Object.entries(CALL_TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Date & Time</Label>
          <Input type="datetime-local" {...form.register('scheduledAt')} className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Duration (min)</Label>
          <Input type="number" min={0} placeholder="30" {...form.register('durationMinutes')} className="h-8 text-sm" />
        </div>
      </div>

      {/* Outcome + Conducted by */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Outcome</Label>
          <select {...form.register('outcome')} className={inputCls}>
            <option value="">— Select outcome</option>
            {Object.entries(OUTCOME_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        {teamMembers.length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs">Conducted by</Label>
            <select {...form.register('conductedBy')} className={inputCls}>
              <option value="">— Select person</option>
              {teamMembers.map((u) => (
                <option key={String(u.id)} value={String(u.id)}>
                  {String(u.firstName ?? '')} {String(u.lastName ?? '')}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Attendees */}
      <div className="space-y-1">
        <Label className="text-xs">Attendees</Label>
        <Input
          {...form.register('attendees')}
          placeholder="e.g. John (CTO), Sarah (Procurement)"
          className="h-8 text-sm"
        />
      </div>

      {/* Structured fields — show for discovery/demo */}
      {isDiscoveryOrDemo && (
        <>
          <div className="space-y-1">
            <Label className="text-xs">Client Requirements</Label>
            <Textarea
              {...form.register('clientRequirements')}
              placeholder="What does the client need?"
              rows={2}
              className="text-sm resize-none"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Pain Points</Label>
            <Textarea
              {...form.register('painPoints')}
              placeholder="What problems are they trying to solve?"
              rows={2}
              className="text-sm resize-none"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Objections</Label>
            <Textarea
              {...form.register('objections')}
              placeholder="Concerns or blockers raised"
              rows={2}
              className="text-sm resize-none"
            />
          </div>
        </>
      )}

      {/* Next action */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Next Action</Label>
          <Input
            {...form.register('nextAction')}
            placeholder="e.g. Send proposal by Friday"
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Next Action Date</Label>
          <Input type="date" {...form.register('nextActionDate')} className="h-8 text-sm" />
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-1">
        <Label className="text-xs">Notes</Label>
        <Textarea
          {...form.register('demoNotes')}
          placeholder="Additional notes from the call..."
          rows={3}
          className="text-sm resize-none"
        />
      </div>

      <div className="flex items-center gap-2">
        {onCancel && (
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" size="sm" disabled={createDemo.isPending}>
          {createDemo.isPending ? 'Saving...' : 'Save Demo Record'}
        </Button>
      </div>
    </form>
  );
}

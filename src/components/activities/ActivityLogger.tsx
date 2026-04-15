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
import { ACTIVITY_TYPES } from '@/lib/constants';

const emptyToUndefined = (value: unknown) => {
  if (typeof value === 'string' && value.trim() === '') {
    return undefined;
  }
  return value;
};

function toActivityIsoString(value: string): string | null {
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) {
    return direct.toISOString();
  }

  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4}),\s*(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;

  const [, dd, mm, yyyy, hh, min, meridiem] = match;
  let hours = Number(hh);
  if (meridiem.toUpperCase() === 'PM' && hours < 12) hours += 12;
  if (meridiem.toUpperCase() === 'AM' && hours === 12) hours = 0;

  const parsed = new Date(Number(yyyy), Number(mm) - 1, Number(dd), hours, Number(min));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

// Local schema mirroring the activityCreateSchema but with UI-friendly duration field
const schema = z.object({
  activityType: z.enum(['call', 'email_sent', 'email_received', 'meeting', 'note', 'task', 'sms', 'whatsapp', 'linkedin', 'demo', 'proposal', 'document', 'stage_change', 'status_change', 'assignment', 'custom']),
  subject: z.string().min(1, 'Subject is required').max(255),
  body: z.preprocess(emptyToUndefined, z.string().optional()),
  occurredAt: z.preprocess(emptyToUndefined, z.string().optional()),
  callDurationSeconds: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).optional()),
  callDirection: z.preprocess(emptyToUndefined, z.enum(['inbound', 'outbound']).optional()),
  callOutcome: z.preprocess(emptyToUndefined, z.enum(['connected', 'voicemail', 'no_answer', 'busy', 'wrong_number']).optional()),
});

type FormData = z.infer<typeof schema>;

interface ActivityLoggerProps {
  contactId?: string;
  companyId?: string;
  dealId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function ActivityLogger({ contactId, companyId, dealId, onSuccess, onCancel }: ActivityLoggerProps) {
  const utils = trpc.useUtils();

  const createActivity = trpc.activities.create.useMutation({
    onSuccess: () => {
      toast.success('Activity logged');
      void utils.activities.list.invalidate();
      onSuccess?.();
    },
    onError: (err) => {
      toast.error('Failed to log activity', { description: err.message });
    },
  });

  const now = new Date();
  const localDatetime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);

  const form = useForm<FormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: {
      activityType: 'call',
      occurredAt: localDatetime,
    },
    shouldUnregister: true,
  });

  const activityType = form.watch('activityType');
  const isCall = activityType === 'call';
  const showDirection = ['call', 'email_sent', 'email_received', 'sms'].includes(activityType);

  async function onSubmit(data: FormData) {
    const occurredAtIso = toActivityIsoString(data.occurredAt ?? '') ?? new Date().toISOString();

    await createActivity.mutateAsync({
      activityType: data.activityType,
      subject: data.subject,
      body: data.body ?? null,
      occurredAt: occurredAtIso,
      callDurationSeconds: data.callDurationSeconds ?? null,
      callDirection: data.callDirection ?? null,
      callOutcome: data.callOutcome ?? null,
      contactId: contactId ?? null,
      companyId: companyId ?? null,
      dealId: dealId ?? null,
    });
  }

  return (
    <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 space-y-3">
      <form
        onSubmit={form.handleSubmit(onSubmit, () => {
          const firstError = Object.values(form.formState.errors)[0];
          const description =
            typeof firstError?.message === 'string' && firstError.message.length > 0
              ? firstError.message
              : 'Please fix the highlighted fields.';
          toast.error('Failed to log activity', { description });
        })}
        className="space-y-3"
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Type</Label>
            <select
              {...form.register('activityType')}
              className="flex h-8 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              {ACTIVITY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Date & Time</Label>
            <Input
              type="datetime-local"
              {...form.register('occurredAt')}
              className="h-8 text-sm"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Subject *</Label>
          <Input
            {...form.register('subject')}
            placeholder={
              activityType === 'call' ? 'Discovery call with...' :
              activityType === 'email_sent' ? 'Sent proposal to...' :
              activityType === 'meeting' ? 'Product demo...' :
              'Subject'
            }
            className="h-8 text-sm"
          />
          {form.formState.errors.subject && (
            <p className="text-xs text-red-500">{form.formState.errors.subject.message}</p>
          )}
        </div>

        {(isCall || showDirection) && (
          <div className="grid grid-cols-2 gap-3">
            {isCall && (
              <div className="space-y-1">
                <Label className="text-xs">Duration (seconds)</Label>
                <Input
                  type="number"
                  min={0}
                  {...form.register('callDurationSeconds')}
                  placeholder="180"
                  className="h-8 text-sm"
                />
              </div>
            )}

            {showDirection && (
              <div className="space-y-1">
                <Label className="text-xs">Direction</Label>
                <select
                  {...form.register('callDirection')}
                  className="flex h-8 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <option value="">—</option>
                  <option value="inbound">Inbound</option>
                  <option value="outbound">Outbound</option>
                </select>
              </div>
            )}

            {isCall && (
              <div className="space-y-1">
                <Label className="text-xs">Outcome</Label>
                <select
                  {...form.register('callOutcome')}
                  className="flex h-8 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <option value="">—</option>
                  <option value="connected">Connected</option>
                  <option value="voicemail">Voicemail</option>
                  <option value="no_answer">No Answer</option>
                  <option value="busy">Busy</option>
                  <option value="wrong_number">Wrong Number</option>
                </select>
              </div>
            )}
          </div>
        )}

        <div className="space-y-1">
          <Label className="text-xs">Notes</Label>
          <Textarea
            {...form.register('body')}
            placeholder="Add notes about this activity..."
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
          <Button type="submit" size="sm" disabled={createActivity.isPending}>
            {createActivity.isPending ? 'Saving...' : 'Log Activity'}
          </Button>
        </div>
      </form>
    </div>
  );
}

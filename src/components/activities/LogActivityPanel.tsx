'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Search, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useDebounce } from '@/hooks/useDebounce';
import { ACTIVITY_TYPES } from '@/lib/constants';
import { cn } from '@/lib/utils';

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

interface LogActivityPanelProps {
  onSuccess?: () => void;
  onCancel?: () => void;
  // Pre-linked entity (when opened from a contact/deal detail page)
  contactId?: string;
  contactName?: string;
  companyId?: string;
  companyName?: string;
  dealId?: string;
  dealName?: string;
}

interface EntityChip {
  type: 'contact' | 'company' | 'deal';
  id: string;
  name: string;
}

export function LogActivityPanel({
  onSuccess,
  onCancel,
  contactId: preContactId,
  contactName: preContactName,
  companyId: preCompanyId,
  companyName: preCompanyName,
  dealId: preDealId,
  dealName: preDealName,
}: LogActivityPanelProps) {
  const utils = trpc.useUtils();

  // Entity linking state
  const [linkedEntity, setLinkedEntity] = useState<EntityChip | null>(() => {
    if (preContactId && preContactName) return { type: 'contact', id: preContactId, name: preContactName };
    if (preCompanyId && preCompanyName) return { type: 'company', id: preCompanyId, name: preCompanyName };
    if (preDealId && preDealName) return { type: 'deal', id: preDealId, name: preDealName };
    return null;
  });
  const [entitySearch, setEntitySearch] = useState('');
  const [entitySearchOpen, setEntitySearchOpen] = useState(false);
  const debouncedSearch = useDebounce(entitySearch, 200);

  const { data: searchResults } = trpc.search.global.useQuery(
    { query: debouncedSearch },
    { enabled: debouncedSearch.length >= 1 }
  );

  const createActivity = trpc.activities.create.useMutation({
    onSuccess: () => {
      toast.success('Activity logged');
      void utils.activities.list.invalidate();
      onSuccess?.();
    },
    onError: (err) => toast.error('Failed to log activity', { description: err.message }),
  });

  const now = new Date();
  const localDatetime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);

  const form = useForm<FormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: { activityType: 'call', occurredAt: localDatetime },
    shouldUnregister: true,
  });

  const activityType = form.watch('activityType');
  const isCall = activityType === 'call';
  const showDirection = ['call', 'email_sent', 'email_received', 'sms'].includes(activityType);

  function onSubmit(data: FormData) {
    const occurredAtIso = toActivityIsoString(data.occurredAt ?? '') ?? new Date().toISOString();

    createActivity.mutate({
      activityType: data.activityType,
      subject: data.subject,
      body: data.body ?? null,
      occurredAt: occurredAtIso,
      callDurationSeconds: data.callDurationSeconds ?? null,
      callDirection: data.callDirection ?? null,
      callOutcome: data.callOutcome ?? null,
      contactId: linkedEntity?.type === 'contact' ? linkedEntity.id : (preContactId ?? null),
      companyId: linkedEntity?.type === 'company' ? linkedEntity.id : (preCompanyId ?? null),
      dealId: linkedEntity?.type === 'deal' ? linkedEntity.id : (preDealId ?? null),
    });
  }

  function selectEntity(type: 'contact' | 'company' | 'deal', id: string, name: string) {
    setLinkedEntity({ type, id, name });
    setEntitySearch('');
    setEntitySearchOpen(false);
  }

  const allResults = [
    ...(searchResults?.contacts ?? []).map(c => ({ type: 'contact' as const, id: c.id, name: String(c.title), sub: String(c.subtitle ?? '') })),
    ...(searchResults?.companies ?? []).map(c => ({ type: 'company' as const, id: c.id, name: String(c.title), sub: '' })),
    ...(searchResults?.deals ?? []).map(d => ({ type: 'deal' as const, id: d.id, name: String(d.title), sub: String(d.subtitle ?? '') })),
  ];

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit, () => {
        const firstError = Object.values(form.formState.errors)[0];
        const description =
          typeof firstError?.message === 'string' && firstError.message.length > 0
            ? firstError.message
            : 'Please fix the highlighted fields.';
        toast.error('Failed to log activity', { description });
      })}
      className="space-y-4 p-6"
    >

      {/* Entity linker (only shown when no pre-linked entity) */}
      {!preContactId && !preCompanyId && !preDealId && (
        <div className="space-y-1.5">
          <Label>Link to Contact / Company / Deal <span className="text-slate-400 font-normal">(optional)</span></Label>
          {linkedEntity ? (
            <div className="flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 text-[13px]">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 bg-slate-200 rounded px-1.5 py-0.5">{linkedEntity.type}</span>
              <span className="flex-1 text-slate-800 font-medium truncate">{linkedEntity.name}</span>
              <button type="button" onClick={() => setLinkedEntity(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <Input
                  placeholder="Search contacts, companies, deals..."
                  value={entitySearch}
                  onChange={(e) => { setEntitySearch(e.target.value); setEntitySearchOpen(true); }}
                  onFocus={() => setEntitySearchOpen(true)}
                  onBlur={() => setTimeout(() => setEntitySearchOpen(false), 150)}
                  className="pl-8 text-[13px]"
                />
              </div>
              {entitySearchOpen && allResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-[0_8px_24px_rgba(16,24,40,0.08)] z-20 overflow-hidden max-h-48 overflow-y-auto">
                  {allResults.map((r) => (
                    <button
                      key={`${r.type}-${r.id}`}
                      type="button"
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0"
                      onClick={() => selectEntity(r.type, r.id, r.name)}
                    >
                      <span className={cn(
                        'text-[9px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 flex-shrink-0',
                        r.type === 'contact' && 'bg-blue-100 text-blue-600',
                        r.type === 'company' && 'bg-indigo-100 text-indigo-600',
                        r.type === 'deal' && 'bg-emerald-100 text-emerald-600',
                      )}>{r.type}</span>
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-slate-800 truncate">{r.name}</p>
                        {r.sub && <p className="text-[11px] text-slate-400 truncate">{r.sub}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Type + Date */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Type</Label>
          <select
            {...form.register('activityType')}
            className="flex h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20 focus-visible:border-blue-500"
          >
            {ACTIVITY_TYPES.filter(t => !['stage_change', 'status_change', 'assignment'].includes(t.value)).map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Date & Time</Label>
          <Input type="datetime-local" {...form.register('occurredAt')} />
        </div>
      </div>

      {/* Subject */}
      <div className="space-y-1.5">
        <Label>Subject *</Label>
        <Input
          {...form.register('subject')}
          placeholder={
            activityType === 'call' ? 'Discovery call with...' :
            activityType === 'email_sent' ? 'Sent proposal to...' :
            activityType === 'meeting' ? 'Product demo...' :
            activityType === 'note' ? 'Note about...' :
            activityType === 'task' ? 'Follow up on...' :
            'Subject'
          }
        />
        {form.formState.errors.subject && (
          <p className="text-xs text-red-500">{form.formState.errors.subject.message}</p>
        )}
      </div>

      {/* Call-specific fields */}
      {(isCall || showDirection) && (
        <div className="grid grid-cols-2 gap-3">
          {showDirection && (
            <div className="space-y-1.5">
              <Label>Direction</Label>
              <select
                {...form.register('callDirection')}
                className="flex h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20 focus-visible:border-blue-500"
              >
                <option value="">—</option>
                <option value="inbound">Inbound</option>
                <option value="outbound">Outbound</option>
              </select>
            </div>
          )}
          {isCall && (
            <>
              <div className="space-y-1.5">
                <Label>Duration (seconds)</Label>
                <Input type="number" min={0} {...form.register('callDurationSeconds')} placeholder="180" />
              </div>
              <div className="space-y-1.5">
                <Label>Outcome</Label>
                <select
                  {...form.register('callOutcome')}
                  className="flex h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20 focus-visible:border-blue-500"
                >
                  <option value="">—</option>
                  <option value="connected">Connected</option>
                  <option value="voicemail">Voicemail</option>
                  <option value="no_answer">No Answer</option>
                  <option value="busy">Busy</option>
                  <option value="wrong_number">Wrong Number</option>
                </select>
              </div>
            </>
          )}
        </div>
      )}

      {/* Notes */}
      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Textarea {...form.register('body')} placeholder="Add notes about this activity..." rows={4} />
      </div>

      <div className="flex gap-2 pt-1">
        {onCancel && (
          <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" className="flex-1" disabled={createActivity.isPending}>
          {createActivity.isPending ? 'Saving...' : 'Log Activity'}
        </Button>
      </div>
    </form>
  );
}

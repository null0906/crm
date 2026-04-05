'use client';

import React, { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Send, Mail, MessageCircle, CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SlideOverPanel } from '@/components/shared/SlideOverPanel';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { cn } from '@/lib/utils';

type ScheduleType = 'daily' | 'weekly' | 'monthly';

interface ScheduleForm {
  name: string;
  dashboardId: string;
  scheduleType: ScheduleType;
  scheduleTime: string;
  scheduleDayOfWeek: number | null;
  scheduleDayOfMonth: number | null;
  emailRecipients: string[];
  telegramRecipients: number[];
  isActive: boolean;
}

interface ScheduleRow {
  id: string;
  name: string;
  dashboardName: string | null;
  scheduleType: string;
  scheduleTime: string;
  scheduleDayOfWeek: number | null;
  scheduleDayOfMonth: number | null;
  emailRecipients: unknown;
  telegramRecipients: unknown;
  isActive: boolean;
  lastSentAt: Date | null;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const defaultForm = (): ScheduleForm => ({
  name: '',
  dashboardId: '',
  scheduleType: 'daily',
  scheduleTime: '09:00',
  scheduleDayOfWeek: 1,
  scheduleDayOfMonth: 1,
  emailRecipients: [],
  telegramRecipients: [],
  isActive: true,
});

function scheduleDescription(s: Pick<ScheduleRow, 'scheduleType' | 'scheduleTime' | 'scheduleDayOfWeek' | 'scheduleDayOfMonth'>): string {
  const time = s.scheduleTime ?? '09:00';
  if (s.scheduleType === 'daily') return `Daily at ${time} IST`;
  if (s.scheduleType === 'weekly') {
    const day = DAYS[s.scheduleDayOfWeek ?? 1];
    return `Every ${day} at ${time} IST`;
  }
  return `Monthly on day ${s.scheduleDayOfMonth ?? 1} at ${time} IST`;
}

function ScheduleFormPanel({
  open,
  onClose,
  editId,
  initialData,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editId?: string;
  initialData?: Partial<ScheduleForm>;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ScheduleForm>({ ...defaultForm(), ...initialData });
  const [emailInput, setEmailInput] = useState('');
  const [tgInput, setTgInput] = useState('');

  const { data: dashboards } = trpc.dashboards.list.useQuery();

  const createMutation = trpc.digests.create.useMutation({
    onSuccess: () => { toast.success('Digest schedule created'); onSaved(); onClose(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const updateMutation = trpc.digests.update.useMutation({
    onSuccess: () => { toast.success('Digest schedule updated'); onSaved(); onClose(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form,
      dashboardId: form.dashboardId || undefined,
      scheduleDayOfWeek: form.scheduleType === 'weekly' ? form.scheduleDayOfWeek : undefined,
      scheduleDayOfMonth: form.scheduleType === 'monthly' ? form.scheduleDayOfMonth : undefined,
    };
    if (editId) {
      updateMutation.mutate({ id: editId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const addEmail = () => {
    const e = emailInput.trim();
    if (e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && !form.emailRecipients.includes(e)) {
      setForm((f) => ({ ...f, emailRecipients: [...f.emailRecipients, e] }));
    }
    setEmailInput('');
  };

  const addTg = () => {
    const id = parseInt(tgInput.trim(), 10);
    if (!isNaN(id) && !form.telegramRecipients.includes(id)) {
      setForm((f) => ({ ...f, telegramRecipients: [...f.telegramRecipients, id] }));
    }
    setTgInput('');
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <SlideOverPanel open={open} onClose={onClose} title={editId ? 'Edit Digest Schedule' : 'New Digest Schedule'} width="lg">
      <form onSubmit={handleSubmit} className="p-6 space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="dname">Schedule Name *</Label>
          <Input
            id="dname"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Daily Sales Overview"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ddash">Dashboard</Label>
          <select
            id="ddash"
            className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={form.dashboardId}
            onChange={(e) => setForm((f) => ({ ...f, dashboardId: e.target.value }))}
          >
            <option value="">Select a dashboard…</option>
            {dashboards?.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="dtype">Schedule Type *</Label>
            <select
              id="dtype"
              className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.scheduleType}
              onChange={(e) => setForm((f) => ({ ...f, scheduleType: e.target.value as ScheduleType }))}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dtime">Time (IST) *</Label>
            <Input
              id="dtime"
              type="time"
              value={form.scheduleTime}
              onChange={(e) => setForm((f) => ({ ...f, scheduleTime: e.target.value }))}
              required
            />
          </div>
        </div>

        {form.scheduleType === 'weekly' && (
          <div className="space-y-1.5">
            <Label htmlFor="ddow">Day of Week *</Label>
            <select
              id="ddow"
              className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={String(form.scheduleDayOfWeek ?? 1)}
              onChange={(e) => setForm((f) => ({ ...f, scheduleDayOfWeek: parseInt(e.target.value, 10) }))}
            >
              {DAYS.map((d, i) => <option key={i} value={String(i)}>{d}</option>)}
            </select>
          </div>
        )}

        {form.scheduleType === 'monthly' && (
          <div className="space-y-1.5">
            <Label htmlFor="ddom">Day of Month (1–28) *</Label>
            <Input
              id="ddom"
              type="number"
              min={1}
              max={28}
              value={form.scheduleDayOfMonth ?? 1}
              onChange={(e) => setForm((f) => ({ ...f, scheduleDayOfMonth: parseInt(e.target.value, 10) }))}
            />
          </div>
        )}

        {/* Email recipients */}
        <div className="space-y-2">
          <Label>Email Recipients</Label>
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="email@example.com"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEmail(); } }}
            />
            <Button type="button" variant="outline" size="sm" onClick={addEmail}>Add</Button>
          </div>
          {form.emailRecipients.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {form.emailRecipients.map((email) => (
                <span key={email} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-full text-xs">
                  <Mail className="w-3 h-3" />{email}
                  <button type="button" onClick={() => setForm((f) => ({ ...f, emailRecipients: f.emailRecipients.filter((r) => r !== email) }))}>×</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Telegram recipients */}
        <div className="space-y-2">
          <Label>Telegram Recipients (chat IDs)</Label>
          <div className="flex gap-2">
            <Input
              type="number"
              placeholder="123456789 or -100xxxxxxxx for groups"
              value={tgInput}
              onChange={(e) => setTgInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTg(); } }}
            />
            <Button type="button" variant="outline" size="sm" onClick={addTg}>Add</Button>
          </div>
          {form.telegramRecipients.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {form.telegramRecipients.map((id) => (
                <span key={id} className="inline-flex items-center gap-1 px-2 py-1 bg-violet-50 text-violet-700 rounded-full text-xs">
                  <MessageCircle className="w-3 h-3" />{id}
                  <button type="button" onClick={() => setForm((f) => ({ ...f, telegramRecipients: f.telegramRecipients.filter((r) => r !== id) }))}>×</button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="dactive"
            checked={form.isActive}
            onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            className="w-4 h-4 rounded border-slate-300"
          />
          <Label htmlFor="dactive">Active</Label>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Saving…' : 'Save Schedule'}
          </Button>
        </div>
      </form>
    </SlideOverPanel>
  );
}

export default function DigestsPage() {
  const [formOpen, setFormOpen] = useState(false);
  const [editSchedule, setEditSchedule] = useState<{ id: string; data: Partial<ScheduleForm> } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const { data: schedules, isLoading } = trpc.digests.list.useQuery();

  const toggleActive = trpc.digests.toggleActive.useMutation({
    onSuccess: () => void utils.digests.list.invalidate(),
  });

  const deleteSchedule = trpc.digests.delete.useMutation({
    onSuccess: () => {
      toast.success('Schedule deleted');
      void utils.digests.list.invalidate();
    },
  });

  const sendNow = trpc.digests.sendNow.useMutation({
    onSuccess: () => toast.success('Digest sent!'),
    onError: (e: { message: string }) => toast.error(`Send failed: ${e.message}`),
  });

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-semibold text-slate-900 tracking-tight">Digest Schedules</h1>
          <p className="text-sm text-slate-500 mt-1">Send scheduled dashboard snapshots via email and Telegram.</p>
        </div>
        <Button onClick={() => { setEditSchedule(null); setFormOpen(true); }}>
          <Plus className="w-4 h-4 mr-1.5" />
          New Schedule
        </Button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading…</div>
        ) : !(schedules as ScheduleRow[] | undefined)?.length ? (
          <div className="p-12 text-center">
            <CalendarClock className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No digest schedules yet.</p>
            <p className="text-xs text-slate-400 mt-1">Create a schedule to start sending automated reports.</p>
          </div>
        ) : (
          (schedules as ScheduleRow[]).map((s) => (
            <div key={s.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-slate-900">{s.name}</p>
                  <Badge
                    variant={s.isActive ? 'default' : 'secondary'}
                    className={cn('text-xs', s.isActive ? 'bg-green-100 text-green-700 hover:bg-green-100' : '')}
                  >
                    {s.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {scheduleDescription(s)} · {s.dashboardName ?? 'No dashboard selected'}
                </p>
                <div className="flex items-center gap-3 mt-1.5">
                  {(s.emailRecipients as string[]).length > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                      <Mail className="w-3 h-3" />
                      {(s.emailRecipients as string[]).length} email{(s.emailRecipients as string[]).length !== 1 ? 's' : ''}
                    </span>
                  )}
                  {(s.telegramRecipients as number[]).length > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                      <MessageCircle className="w-3 h-3" />
                      {(s.telegramRecipients as number[]).length} Telegram
                    </span>
                  )}
                  {s.lastSentAt && (
                    <span className="text-xs text-slate-400">
                      Last sent {new Date(s.lastSentAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => sendNow.mutate({ id: s.id })}
                  disabled={sendNow.isPending}
                  title="Send Now"
                  className="text-slate-500 hover:text-slate-900"
                >
                  <Send className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditSchedule({
                      id: s.id,
                      data: {
                        name: s.name,
                        dashboardId: '',
                        scheduleType: s.scheduleType as ScheduleType,
                        scheduleTime: s.scheduleTime,
                        scheduleDayOfWeek: s.scheduleDayOfWeek,
                        scheduleDayOfMonth: s.scheduleDayOfMonth,
                        emailRecipients: s.emailRecipients as string[],
                        telegramRecipients: s.telegramRecipients as number[],
                        isActive: s.isActive,
                      },
                    });
                    setFormOpen(true);
                  }}
                  title="Edit"
                  className="text-slate-500 hover:text-slate-900"
                >
                  <Pencil className="w-4 h-4" />
                </Button>
                <button
                  onClick={() => toggleActive.mutate({ id: s.id, isActive: !s.isActive })}
                  className={cn(
                    'px-2 py-1 text-xs rounded border',
                    s.isActive
                      ? 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      : 'border-green-200 text-green-700 bg-green-50 hover:bg-green-100'
                  )}
                >
                  {s.isActive ? 'Pause' : 'Resume'}
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteId(s.id)}
                  title="Delete"
                  className="text-slate-400 hover:text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <ScheduleFormPanel
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditSchedule(null); }}
        editId={editSchedule?.id}
        initialData={editSchedule?.data}
        onSaved={() => void utils.digests.list.invalidate()}
      />

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        onConfirm={() => {
          if (deleteId) deleteSchedule.mutate({ id: deleteId });
          setDeleteId(null);
        }}
        title="Delete Schedule"
        description="This digest schedule will be permanently deleted. Are you sure?"
        confirmLabel="Delete"
        destructive
      />
    </div>
  );
}

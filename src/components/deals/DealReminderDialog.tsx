'use client';

import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface DealReminderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
  dealTitle?: string;
  companyId?: string | null;
  primaryContactId?: string | null;
  onCreated?: () => void;
}

function getDefaultDueDate(daysAhead: number) {
  const now = new Date();
  now.setDate(now.getDate() + daysAhead);
  return now.toISOString().split('T')[0] ?? '';
}

export function DealReminderDialog({
  open,
  onOpenChange,
  dealId,
  dealTitle,
  companyId,
  primaryContactId,
  onCreated,
}: DealReminderDialogProps) {
  const utils = trpc.useUtils();
  const [subject, setSubject] = useState('');
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState(getDefaultDueDate(2));
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');

  const placeholder = useMemo(
    () => (dealTitle ? `Ping ${dealTitle} in 2 days` : 'Follow up with this deal'),
    [dealTitle]
  );

  const createReminder = trpc.activities.create.useMutation({
    onSuccess: async () => {
      toast.success('Reminder created');
      setSubject('');
      setNotes('');
      setDueDate(getDefaultDueDate(2));
      setPriority('medium');
      await utils.activities.list.invalidate();
      onCreated?.();
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error('Failed to create reminder', { description: err.message });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedSubject = subject.trim() || placeholder;

    createReminder.mutate({
      activityType: 'task',
      subject: trimmedSubject,
      body: notes.trim() || null,
      dealId,
      companyId: companyId ?? null,
      contactId: primaryContactId ?? null,
      taskDueDate: dueDate,
      taskPriority: priority,
      occurredAt: new Date().toISOString(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set Deal Reminder</DialogTitle>
          <DialogDescription>
            Create a follow-up reminder for this deal. The reminder will go only to the task owner when it becomes due.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reminder-subject">Reminder</Label>
            <Input
              id="reminder-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={placeholder}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="reminder-due-date">Due date</Label>
              <Input
                id="reminder-due-date"
                type="date"
                value={dueDate}
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => setDueDate(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reminder-priority">Priority</Label>
              <select
                id="reminder-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as 'low' | 'medium' | 'high' | 'urgent')}
                className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reminder-notes">Notes</Label>
            <Textarea
              id="reminder-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="What do you want to remember before reaching out?"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createReminder.isPending}>
              {createReminder.isPending ? 'Saving...' : 'Create Reminder'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

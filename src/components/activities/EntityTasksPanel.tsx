'use client';

import React, { useState } from 'react';
import { CheckSquare } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/formatters';

interface EntityTasksPanelProps {
  contactId?: string;
  companyId?: string;
  dealId?: string;
}

const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-amber-500',
  low: 'bg-slate-400',
};

const INPUT_CLS = 'flex h-8 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500';

export function EntityTasksPanel({ contactId, companyId, dealId }: EntityTasksPanelProps) {
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('medium');

  const { data, isLoading } = trpc.activities.list.useQuery({
    contactId,
    companyId,
    dealId,
    activityType: 'task',
    pagination: { limit: 50 },
  });

  const openTasks = (data?.items ?? []).filter(
    (t) => !(t as Record<string, unknown>).taskCompletedAt,
  );

  const createTask = trpc.activities.create.useMutation({
    onSuccess: () => {
      toast.success('Follow-up added');
      void utils.activities.list.invalidate();
      setShowForm(false);
      setSubject('');
      setDueDate('');
      setPriority('medium');
    },
    onError: (err) => toast.error('Failed to add follow-up', { description: err.message }),
  });

  const completeTask = trpc.activities.update.useMutation({
    onSuccess: () => {
      toast.success('Task marked complete');
      void utils.activities.list.invalidate();
    },
    onError: (err) => toast.error('Failed to update', { description: err.message }),
  });

  function handleAdd() {
    if (!subject.trim()) return;
    createTask.mutate({
      activityType: 'task',
      subject: subject.trim(),
      taskDueDate: dueDate || null,
      taskPriority: priority as 'low' | 'medium' | 'high' | 'urgent',
      contactId: contactId ?? null,
      companyId: companyId ?? null,
      dealId: dealId ?? null,
    });
  }

  return (
    <div className="space-y-3">
      {!showForm && (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="w-full flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-sm text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
        >
          <CheckSquare className="h-4 w-4" />
          Add Follow-up Task
        </button>
      )}

      {showForm && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Task subject *"
            className={INPUT_CLS}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <div className="flex gap-2">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={INPUT_CLS}
            />
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className={INPUT_CLS}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => { setShowForm(false); setSubject(''); setDueDate(''); setPriority('medium'); }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!subject.trim() || createTask.isPending}
              onClick={handleAdd}
            >
              {createTask.isPending ? 'Adding...' : 'Add Task'}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-12 rounded-lg bg-slate-100 animate-pulse" />)}
        </div>
      ) : openTasks.length === 0 && !showForm ? (
        <div className="py-8 text-center text-slate-400">
          <CheckSquare className="mx-auto mb-2 h-8 w-8" />
          <p className="text-sm">No open tasks. Add a follow-up to get started.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {openTasks.map((item) => {
            const t = item as Record<string, unknown>;
            const due = t.taskDueDate ? new Date(String(t.taskDueDate)) : null;
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const overdue = due ? due < today : false;
            const pri = String(t.taskPriority ?? 'medium');
            return (
              <div key={String(t.id)} className="flex items-center gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => completeTask.mutate({ id: String(t.id), taskCompletedAt: new Date().toISOString() })}
                  className="h-4 w-4 shrink-0 rounded border-2 border-slate-300 hover:border-emerald-500 hover:bg-emerald-50 transition-colors"
                  title="Mark complete"
                />
                <span className={`h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[pri] ?? PRIORITY_DOT.medium}`} />
                <p className="min-w-0 flex-1 truncate text-sm text-slate-800">{String(t.subject ?? '')}</p>
                <span className={`shrink-0 font-mono text-xs ${overdue ? 'font-semibold text-red-600' : 'text-slate-400'}`}>
                  {due ? formatDate(due) : 'No due date'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

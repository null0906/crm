'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Bell, Check, CheckCheck, Trash2, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatRelative } from '@/lib/formatters';
import { toast } from 'sonner';

const TYPE_ICONS: Record<string, string> = {
  deal_won: '🏆',
  deal_lost: '❌',
  contact_assigned: '👤',
  task_due: '⏰',
  mention: '💬',
  stage_change: '📋',
  deal_inactivity_email: '📬',
  task_assigned: '📌',
  task_completed: '✅',
  task_cancelled: '🚫',
  system: '🔔',
};

export function NotificationBell() {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: countData } = trpc.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: 30000, // poll every 30s
  });

  const { data: notifications = [], isLoading } = trpc.notifications.list.useQuery(
    { limit: 20 },
    { enabled: open }
  );

  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      void utils.notifications.unreadCount.invalidate();
      void utils.notifications.list.invalidate();
    },
  });

  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      toast.success('All notifications marked as read');
      void utils.notifications.unreadCount.invalidate();
      void utils.notifications.list.invalidate();
    },
  });

  const deleteNotif = trpc.notifications.delete.useMutation({
    onSuccess: () => {
      void utils.notifications.unreadCount.invalidate();
      void utils.notifications.list.invalidate();
    },
  });

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const unreadCount = countData?.count ?? 0;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-text-2)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text-1)]"
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-[var(--color-surface)] bg-linear-to-br from-[var(--color-danger-hot)] to-[var(--color-danger)] px-[3px] font-mono text-[9px] font-bold leading-none tracking-[0.02em] text-[var(--color-text-inverse)] shadow-[0_1px_3px_rgba(239,68,68,0.40)]">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="dropdown-panel absolute right-0 top-10 z-50 w-96 overflow-hidden p-0">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-[var(--color-text-1)]">Notifications</h3>
              {unreadCount > 0 && (
                <span className="rounded-full bg-[var(--color-accent-soft)] px-1.5 py-0.5 text-xs font-medium text-[var(--color-accent)]">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllRead.mutate()}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent-hover)]"
                  title="Mark all as read"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  All read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="flex h-6 w-6 items-center justify-center rounded text-[var(--color-text-3)] hover:bg-[var(--color-surface-alt)]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[400px] divide-y divide-[var(--color-border)] overflow-y-auto">
            {isLoading ? (
              <div className="px-4 py-6 text-center text-sm text-[var(--color-text-3)]">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell className="mx-auto mb-2 h-8 w-8 text-[var(--color-border-strong)]" />
                <p className="text-sm text-[var(--color-text-3)]">No notifications yet</p>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[var(--color-surface-alt)] ${!notif.isRead ? 'bg-[var(--color-accent-soft)]' : ''}`}
                >
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-alt)] text-base">
                    {TYPE_ICONS[notif.type] ?? '🔔'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${!notif.isRead ? 'font-medium text-[var(--color-text-1)]' : 'text-[var(--color-text-2)]'}`}>
                      {notif.title}
                    </p>
                    {notif.body && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-[var(--color-text-2)]">{notif.body}</p>
                    )}
                    <p className="mt-1 font-mono text-xs text-[var(--color-text-3)]">{formatRelative(notif.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    {!notif.isRead && (
                      <button
                        onClick={() => markRead.mutate({ id: notif.id })}
                        className="flex h-6 w-6 items-center justify-center rounded text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
                        title="Mark as read"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => deleteNotif.mutate({ id: notif.id })}
                      className="flex h-6 w-6 items-center justify-center rounded text-[var(--color-text-3)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  {!notif.isRead && (
                    <div className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-[var(--color-accent)]" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

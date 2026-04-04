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
        className="relative w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-mono leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-96 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
              {unreadCount > 0 && (
                <span className="text-xs bg-red-100 text-red-600 rounded-full px-1.5 py-0.5 font-medium">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllRead.mutate()}
                  className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                  title="Mark all as read"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  All read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100 text-slate-400"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[400px] overflow-y-auto divide-y divide-slate-50">
            {isLoading ? (
              <div className="px-4 py-6 text-sm text-slate-400 text-center">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No notifications yet</p>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors group ${!notif.isRead ? 'bg-blue-50/40' : ''}`}
                >
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 text-base">
                    {TYPE_ICONS[notif.type] ?? '🔔'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${!notif.isRead ? 'font-medium text-slate-900' : 'text-slate-700'}`}>
                      {notif.title}
                    </p>
                    {notif.body && (
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{notif.body}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-1">{formatRelative(notif.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    {!notif.isRead && (
                      <button
                        onClick={() => markRead.mutate({ id: notif.id })}
                        className="w-6 h-6 flex items-center justify-center rounded hover:bg-blue-100 text-blue-500 transition-colors"
                        title="Mark as read"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => deleteNotif.mutate({ id: notif.id })}
                      className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-100 text-red-400 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  {!notif.isRead && (
                    <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />
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

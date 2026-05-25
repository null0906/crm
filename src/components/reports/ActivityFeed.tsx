'use client';

import React from 'react';
import Link from 'next/link';
import { CalendarDays, Mail, MessageCircle, Phone, StickyNote, Users } from 'lucide-react';
import { activityLabel, formatDate, formatTime, type ReportFilters } from './report-utils';

type Item = Record<string, any>;

function iconFor(type: string) {
  if (type === 'call') return Phone;
  if (type.startsWith('email')) return Mail;
  if (type === 'meeting' || type === 'demo') return Users;
  if (type === 'whatsapp') return MessageCircle;
  return StickyNote;
}

function groupByDate(items: Item[]) {
  return items.reduce<Record<string, Item[]>>((acc, item) => {
    const key = formatDate(item.occurredAt);
    acc[key] ??= [];
    acc[key]!.push(item);
    return acc;
  }, {});
}

export function ActivityFeed({
  initialItems,
  onLoadMore,
  loadingMore,
  hasMore,
  filters,
}: {
  initialItems: Item[];
  onLoadMore: () => void;
  loadingMore: boolean;
  hasMore: boolean;
  filters: ReportFilters;
}) {
  const groups = groupByDate(initialItems);
  const activeFilterCount = [
    filters.activityTypes?.length,
    filters.callOutcomes?.length,
    filters.demoOutcomes?.length,
    filters.taskPriorities?.length,
    filters.tags?.length,
    filters.location?.trim() ? 1 : 0,
    filters.search?.trim() ? 1 : 0,
  ].reduce<number>((total, value) => total + Number(value ?? 0), 0);

  return (
    <section className="rounded-2xl border border-[var(--border-subtle)] bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-black tracking-[-0.03em] text-[var(--text-primary)]">Activity Log</h2>
          <p className="text-sm text-[var(--text-tertiary)]">
            {initialItems.length} activities loaded. Newest first.
            {activeFilterCount > 0 ? ` ${activeFilterCount} feed filters applied.` : ''}
          </p>
        </div>
      </div>

      {initialItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border-default)] p-8 text-center text-sm text-[var(--text-tertiary)]">
          No activity matches this filter.
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groups).map(([date, dateItems]) => (
            <div key={date}>
              <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
                <CalendarDays className="h-3.5 w-3.5" />
                {date}
              </div>
              <div className="space-y-2">
                {dateItems.map((item) => {
                  const Icon = iconFor(item.activityType);
                  return (
                    <div key={item.id} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] p-4">
                      <div className="flex gap-3">
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-[var(--accent)] shadow-sm">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-[var(--text-tertiary)]">{formatTime(item.occurredAt)}</span>
                            <span className="font-black text-[var(--text-primary)]">{activityLabel(item.activityType)}</span>
                            {item.callOutcome ? <span className="rounded bg-white px-2 py-0.5 text-xs font-bold text-[var(--text-secondary)]">{activityLabel(item.callOutcome)}</span> : null}
                            {item.demoOutcome ? <span className="rounded border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-bold text-green-700">{activityLabel(item.demoOutcome)}</span> : null}
                          </div>
                          <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{item.subject ?? 'No subject'}</p>
                          <p className="mt-1 line-clamp-2 text-sm text-[var(--text-secondary)]">{item.body ?? ''}</p>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--text-tertiary)]">
                            {item.contactName ? <span>{item.contactName}</span> : null}
                            {item.companyName ? <span>@ {item.companyName}</span> : null}
                            {item.dealId ? <Link href={`/deals/${item.dealId}`} className="font-semibold text-[var(--accent)]">Prospect: {item.dealTitle}</Link> : null}
                            {item.demoNextAction ? <span>Next: {item.demoNextAction}</span> : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {hasMore && (
        <div className="mt-5 flex justify-center print:hidden">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="btn-secondary h-9 rounded-lg px-4 text-sm"
          >
            {loadingMore ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}
    </section>
  );
}

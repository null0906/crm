'use client';

import { AlertTriangle, Presentation } from 'lucide-react';
import { formatNumber } from './report-utils';

type Demo = {
  total: number;
  byType: Record<string, number>;
  byOutcome: Record<string, number>;
  interestedRate: number;
  overdueFollowUps: number;
};

function BreakdownList({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data);
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] p-4">
      <h3 className="mb-3 text-sm font-black uppercase tracking-[0.06em] text-[var(--text-tertiary)]">{title}</h3>
      {entries.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)]">No records</p>
      ) : (
        <div className="space-y-2">
          {entries.map(([key, value]) => (
            <div key={key} className="flex items-center justify-between text-sm">
              <span className="capitalize text-[var(--text-secondary)]">{key.replace(/_/g, ' ')}</span>
              <span className="font-black text-[var(--text-primary)]">{formatNumber(value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DemoSection({ demo }: { demo: Demo }) {
  return (
    <section className="rounded-2xl border border-[var(--border-subtle)] bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Presentation className="h-5 w-5 text-[var(--accent)]" />
        <div>
          <h2 className="text-lg font-black tracking-[-0.03em] text-[var(--text-primary)]">Demo & Discovery Analysis</h2>
          <p className="text-sm text-[var(--text-tertiary)]">Structured demo records and follow-up health.</p>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[220px_1fr_1fr]">
        <div className="rounded-xl border border-[var(--accent-medium)] bg-[var(--accent-light)] p-4 text-center">
          <div className="text-4xl font-black tracking-[-0.05em] text-[var(--accent)]">{formatNumber(demo.total)}</div>
          <p className="mt-1 text-sm font-semibold text-[var(--text-secondary)]">demos logged</p>
          <div className="mt-4 text-2xl font-black text-[var(--text-primary)]">{demo.interestedRate}%</div>
          <p className="text-xs font-semibold text-[var(--text-tertiary)]">interest rate</p>
        </div>
        <BreakdownList title="By Type" data={demo.byType} />
        <BreakdownList title="By Outcome" data={demo.byOutcome} />
      </div>
      {demo.overdueFollowUps > 0 && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          <AlertTriangle className="h-4 w-4" />
          {demo.overdueFollowUps} overdue follow-ups from demos need attention.
        </div>
      )}
    </section>
  );
}

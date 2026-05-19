'use client';

import { Phone, Mail, CalendarCheck, MessageCircle, Link2, CheckSquare } from 'lucide-react';
import { formatNumber } from './report-utils';

type Summary = Record<string, any>;

function DeltaBadge({ current, previous }: { current: number; previous: number }) {
  const delta = Number(current ?? 0) - Number(previous ?? 0);
  const pct = previous > 0 ? Math.round(Math.abs(delta / previous) * 100) : null;
  const isFlat = delta === 0;
  const isUp = delta > 0;

  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-bold ${
        isFlat
          ? 'bg-[var(--surface-subtle)] text-[var(--text-tertiary)]'
          : isUp
            ? 'bg-green-50 text-green-700'
            : 'bg-red-50 text-red-700'
      }`}
    >
      {!isFlat && (isUp ? '▲ ' : '▼ ')}
      {delta > 0 ? '+' : ''}{delta}
      {pct !== null ? ` (${pct}%)` : ''}
    </span>
  );
}

function MetricRow({ label, value, note }: { label: string; value: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--border-subtle)] py-2 last:border-0">
      <span className="text-sm text-[var(--text-secondary)]">{label}</span>
      <span className="text-sm font-black text-[var(--text-primary)]">{value}</span>
      {note}
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] p-4">
      <Icon className="mb-3 h-4 w-4 text-[var(--accent)]" />
      <div className="text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">{value}</div>
      <div className="mt-1 text-xs font-semibold text-[var(--text-tertiary)]">{label}</div>
    </div>
  );
}

export function ActivitySummarySection({
  summary,
  previous,
}: {
  summary: Summary;
  previous: Summary;
}) {
  return (
    <section className="rounded-2xl border border-[var(--border-subtle)] bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-black tracking-[-0.03em] text-[var(--text-primary)]">Activity Summary</h2>
        <p className="text-sm text-[var(--text-tertiary)]">Human logged activity only. Automated CRM reminders are excluded.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--border-subtle)] p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
            <Phone className="h-4 w-4" />
            Calls
          </div>
          <MetricRow label="Total calls" value={formatNumber(summary.calls.total)} />
          <MetricRow label="Connected" value={`${formatNumber(summary.calls.connected)} (${summary.calls.connectionRate}%)`} />
          <MetricRow label="Voicemail" value={formatNumber(summary.calls.voicemail)} />
          <MetricRow label="No answer" value={formatNumber(summary.calls.noAnswer)} />
          <MetricRow label="Total talk time" value={`${formatNumber(summary.calls.totalMinutes)} min`} />
          <MetricRow label="Avg duration" value={`${summary.calls.avgDurationMinutes} min`} />
        </div>

        <div className="rounded-xl border border-[var(--border-subtle)] p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
            <Mail className="h-4 w-4" />
            Channels
          </div>
          <MetricRow label="Emails sent" value={formatNumber(summary.emails.sent)} />
          <MetricRow label="Emails received" value={formatNumber(summary.emails.received)} />
          <MetricRow label="Meetings" value={formatNumber(summary.meetings)} />
          <MetricRow label="Demos" value={formatNumber(summary.demos)} />
          <MetricRow label="WhatsApp" value={formatNumber(summary.whatsapp)} />
          <MetricRow label="LinkedIn" value={formatNumber(summary.linkedin)} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <StatCard icon={CalendarCheck} label="Total activities" value={formatNumber(summary.totalActivities)} />
        <StatCard icon={CalendarCheck} label="Avg/day" value={summary.avgActivitiesPerDay} />
        <StatCard icon={CalendarCheck} label="Active days" value={`${summary.activeDays}/${summary.workingDays}`} />
        <StatCard icon={MessageCircle} label="Contacts touched" value={formatNumber(summary.uniqueContactsTouched)} />
        <StatCard icon={Link2} label="Companies touched" value={formatNumber(summary.uniqueCompaniesTouched)} />
        <StatCard icon={CheckSquare} label="Tasks done" value={formatNumber(summary.tasks.completed)} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] p-3 text-sm">
        <span className="font-bold text-[var(--text-primary)]">vs previous period</span>
        <span>Activities <DeltaBadge current={summary.totalActivities} previous={previous.totalActivities} /></span>
        <span>Calls <DeltaBadge current={summary.calls.total} previous={previous.calls.total} /></span>
        <span>Emails <DeltaBadge current={summary.emails.sent} previous={previous.emails.sent} /></span>
      </div>
    </section>
  );
}

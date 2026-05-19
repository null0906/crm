'use client';

import React from 'react';
import Link from 'next/link';
import { BarChart3, ChevronRight } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { REPORT_PRESETS, type ReportPreset, initials } from '@/components/reports/report-utils';

export default function ReportsLandingPage() {
  const [preset, setPreset] = React.useState<ReportPreset>('this_month');
  const { data: users = [], isLoading } = trpc.reports.getReportableUsers.useQuery();

  return (
    <div className="min-h-screen bg-[var(--surface-page)] p-4 md:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-light)] text-[var(--accent)]">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">Sales Rep Reports</h1>
                <p className="text-sm text-[var(--text-tertiary)]">Select a team member and date range to view their performance report.</p>
              </div>
            </div>
            <select
              value={preset}
              onChange={(event) => setPreset(event.target.value as ReportPreset)}
              className="h-10 rounded-lg border border-[var(--border-default)] bg-white px-3 text-sm font-semibold text-[var(--text-secondary)]"
            >
              {REPORT_PRESETS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => <div key={index} className="skeleton h-32 rounded-2xl" />)}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {users.map((user) => (
              <Link
                key={user.id}
                href={`/reports/${user.id}?preset=${preset}`}
                className="group rounded-2xl border border-[var(--border-subtle)] bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[var(--accent-medium)] hover:shadow-[var(--shadow-card-hover)]"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br from-[var(--accent)] to-[var(--stage-discovery)] text-sm font-black text-white shadow-sm">
                    {initials(user.firstName, user.lastName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-base font-black text-[var(--text-primary)]">{user.firstName} {user.lastName}</h2>
                    <p className="truncate text-xs font-mono text-[var(--text-tertiary)]">{user.email}</p>
                    <p className="mt-1 text-xs font-semibold text-[var(--text-secondary)]">{user.role.name}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-[var(--text-tertiary)] transition-transform group-hover:translate-x-1 group-hover:text-[var(--accent)]" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

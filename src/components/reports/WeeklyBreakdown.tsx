'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatNumber } from './report-utils';

type Week = Record<string, any>;

export function WeeklyBreakdown({ weeks }: { weeks: Week[] }) {
  return (
    <section className="rounded-2xl border border-[var(--border-subtle)] bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-black tracking-[-0.03em] text-[var(--text-primary)]">Weekly Breakdown</h2>
        <p className="text-sm text-[var(--text-tertiary)]">Activity volume by week and channel.</p>
      </div>

      {weeks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border-default)] p-8 text-center text-sm text-[var(--text-tertiary)]">
          No weekly activity found in this period.
        </div>
      ) : (
        <>
          <div className="h-72 print:hidden">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeks}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E5F0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8891AA' }} />
                <YAxis tick={{ fontSize: 11, fill: '#8891AA' }} />
                <Tooltip />
                <Bar dataKey="calls" stackId="a" fill="#2D5BE3" name="Calls" radius={[4, 4, 0, 0]} />
                <Bar dataKey="emails" stackId="a" fill="#7C3AED" name="Emails" />
                <Bar dataKey="meetings" stackId="a" fill="#0F766E" name="Meetings" />
                <Bar dataKey="demos" stackId="a" fill="#D97706" name="Demos" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 overflow-hidden rounded-xl border border-[var(--border-subtle)]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--surface-subtle)] text-xs uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
                <tr>
                  <th className="px-4 py-3">Week</th>
                  <th className="px-4 py-3 text-right">Calls</th>
                  <th className="px-4 py-3 text-right">Emails</th>
                  <th className="px-4 py-3 text-right">Meetings</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {weeks.map((week) => (
                  <tr key={week.weekStart}>
                    <td className="px-4 py-3 font-semibold text-[var(--text-primary)]">{week.label}</td>
                    <td className="px-4 py-3 text-right">{formatNumber(week.calls)}</td>
                    <td className="px-4 py-3 text-right">{formatNumber(week.emails)}</td>
                    <td className="px-4 py-3 text-right">{formatNumber(Number(week.meetings ?? 0) + Number(week.demos ?? 0))}</td>
                    <td className="px-4 py-3 text-right font-black">{formatNumber(week.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

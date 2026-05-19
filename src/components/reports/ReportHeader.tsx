'use client';

import { ArrowLeft, Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { REPORT_PRESETS, type ReportPreset, formatDate } from './report-utils';

type Rep = {
  name: string;
  email: string;
  role: string;
};

export function ReportHeader({
  rep,
  period,
  preset,
  onPresetChange,
  onExport,
  onExportFeed,
  exporting,
  exportingFeed,
}: {
  rep: Rep;
  period: { dateFrom: string | Date; dateTo: string | Date };
  preset: ReportPreset;
  onPresetChange: (value: ReportPreset) => void;
  onExport: () => void;
  onExportFeed: () => void;
  exporting: boolean;
  exportingFeed: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-white p-5 shadow-sm print:border-0 print:shadow-none">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/reports"
            className="hidden h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:bg-[var(--accent-light)] hover:text-[var(--accent)] md:flex print:hidden"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br from-[var(--accent)] to-[var(--stage-discovery)] text-sm font-black text-white shadow-[0_4px_12px_rgba(45,91,227,0.25)]">
            {rep.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">{rep.name}</h1>
            <p className="text-sm text-[var(--text-secondary)]">{rep.role} · {rep.email}</p>
            <p className="mt-1 text-xs font-medium text-[var(--text-tertiary)]">
              {formatDate(period.dateFrom)} - {formatDate(period.dateTo)}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center print:hidden">
          <select
            value={preset}
            onChange={(event) => onPresetChange(event.target.value as ReportPreset)}
            className="h-9 rounded-lg border border-[var(--border-default)] bg-white px-3 text-sm font-semibold text-[var(--text-secondary)]"
          >
            {REPORT_PRESETS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={onExportFeed}
            disabled={exportingFeed}
            className="btn-secondary h-9 rounded-lg px-4 text-sm"
          >
            {exportingFeed ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            {exportingFeed ? 'Pulling feed...' : 'Export Feed CSV'}
          </button>
          <button
            type="button"
            onClick={onExport}
            disabled={exporting}
            className="btn-primary h-9 rounded-lg px-4 text-sm"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {exporting ? 'Generating PDF...' : 'Export PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}

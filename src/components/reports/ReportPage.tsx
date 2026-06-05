'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { ChevronDown, Filter, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { ReportHeader } from './ReportHeader';
import { HighlightsBanner } from './HighlightsBanner';
import { ActivitySummarySection } from './ActivitySummarySection';
import { PipelineSection } from './PipelineSection';
import { DemoSection } from './DemoSection';
import { WeeklyBreakdown } from './WeeklyBreakdown';
import { ActivityFeed } from './ActivityFeed';
import { TagInput } from '@/components/tags/TagInput';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  REPORT_ACTIVITY_TYPES,
  REPORT_CALL_OUTCOMES,
  REPORT_DEMO_OUTCOMES,
  REPORT_PRESETS,
  REPORT_TASK_PRIORITIES,
  compactReportFilters,
  hasReportFilters,
  type ReportFilters,
  type ReportPreset,
} from './report-utils';

const TABS = [
  { key: 'summary', label: 'Activity Summary' },
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'demos', label: 'Demos' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'feed', label: 'Activity Feed' },
] as const;

function downloadDataUrl(url: string, filename: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function toggleValue(values: string[] | undefined, value: string) {
  const current = values ?? [];
  return current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
}

function FilterChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-bold ${
        selected
          ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
          : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)] hover:bg-[var(--accent-light)] hover:text-[var(--accent)]'
      }`}
    >
      {label}
    </button>
  );
}

function reportFilterCount(filters: ReportFilters) {
  return [
    filters.activityTypes?.length,
    filters.callOutcomes?.length,
    filters.demoOutcomes?.length,
    filters.taskPriorities?.length,
    filters.tags?.length,
    filters.location?.trim() ? 1 : 0,
    filters.search?.trim() ? 1 : 0,
  ].reduce<number>((total, value) => total + Number(value ?? 0), 0);
}

function ReportFiltersPanel({
  filters,
  onChange,
  onClear,
}: {
  filters: ReportFilters;
  onChange: (filters: ReportFilters) => void;
  onClear: () => void;
}) {
  const hasFilters = hasReportFilters(filters);
  const activeCount = reportFilterCount(filters);

  return (
    <div className="flex items-center justify-end print:hidden" data-report-controls="true">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-bold transition-colors ${
              hasFilters
                ? 'border-[var(--accent-medium)] bg-[var(--accent-light)] text-[var(--accent)]'
                : 'border-[var(--border-subtle)] bg-white text-[var(--text-secondary)] hover:bg-[var(--surface-input)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Filter className="h-4 w-4" />
            Filters
            {activeCount > 0 ? (
              <span className="rounded-full bg-[var(--accent)] px-1.5 py-px text-[10px] font-black leading-4 text-white">
                {activeCount}
              </span>
            ) : null}
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="end"
          className="w-[min(calc(100vw-2rem),760px)] max-h-[min(72vh,640px)] overflow-y-auto p-4"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-black uppercase tracking-[0.08em] text-[var(--text-primary)]">Report Filters</h2>
              <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">Applies to the report, exported PDF, and feed CSV.</p>
            </div>
            {hasFilters ? (
              <button
                type="button"
                onClick={onClear}
                className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-bold text-[var(--text-tertiary)] hover:bg-[var(--surface-input)] hover:text-[var(--text-primary)]"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </button>
            ) : null}
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.5fr)]">
            <div className="space-y-3">
              <div>
                <p className="mb-2 text-xs font-black uppercase tracking-[0.08em] text-[var(--text-tertiary)]">Activity Type</p>
                <div className="flex flex-wrap gap-1.5">
                  {REPORT_ACTIVITY_TYPES.map((item) => (
                    <FilterChip
                      key={item.value}
                      label={item.label}
                      selected={filters.activityTypes?.includes(item.value) ?? false}
                      onClick={() => onChange({ ...filters, activityTypes: toggleValue(filters.activityTypes, item.value) })}
                    />
                  ))}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <p className="mb-2 text-xs font-black uppercase tracking-[0.08em] text-[var(--text-tertiary)]">Call Outcome</p>
                  <div className="flex flex-wrap gap-1.5">
                    {REPORT_CALL_OUTCOMES.map((item) => (
                      <FilterChip
                        key={item.value}
                        label={item.label}
                        selected={filters.callOutcomes?.includes(item.value) ?? false}
                        onClick={() => onChange({ ...filters, callOutcomes: toggleValue(filters.callOutcomes, item.value) })}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-black uppercase tracking-[0.08em] text-[var(--text-tertiary)]">Demo Outcome</p>
                  <div className="flex flex-wrap gap-1.5">
                    {REPORT_DEMO_OUTCOMES.map((item) => (
                      <FilterChip
                        key={item.value}
                        label={item.label}
                        selected={filters.demoOutcomes?.includes(item.value) ?? false}
                        onClick={() => onChange({ ...filters, demoOutcomes: toggleValue(filters.demoOutcomes, item.value) })}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-black uppercase tracking-[0.08em] text-[var(--text-tertiary)]">Task Priority</p>
                  <div className="flex flex-wrap gap-1.5">
                    {REPORT_TASK_PRIORITIES.map((item) => (
                      <FilterChip
                        key={item.value}
                        label={item.label}
                        selected={filters.taskPriorities?.includes(item.value) ?? false}
                        onClick={() => onChange({ ...filters, taskPriorities: toggleValue(filters.taskPriorities, item.value) })}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-black uppercase tracking-[0.08em] text-[var(--text-tertiary)]" htmlFor="report-search">
                  Search
                </label>
                <input
                  id="report-search"
                  value={filters.search ?? ''}
                  onChange={(event) => onChange({ ...filters, search: event.target.value })}
                  placeholder="Subject, notes, company..."
                  className="h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-black uppercase tracking-[0.08em] text-[var(--text-tertiary)]" htmlFor="report-location">
                  Location
                </label>
                <input
                  id="report-location"
                  value={filters.location ?? ''}
                  onChange={(event) => onChange({ ...filters, location: event.target.value })}
                  placeholder="City, country, meeting..."
                  className="h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <p className="mb-1 text-xs font-black uppercase tracking-[0.08em] text-[var(--text-tertiary)]">Tags</p>
                <TagInput
                  value={filters.tags ?? []}
                  onChange={(tags) => onChange({ ...filters, tags })}
                  placeholder="Filter by tags..."
                />
              </div>
            </div>
          </div>

          {activeCount > 0 ? (
            <div className="mt-4 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
              {filters.activityTypes?.map((value) => (
                <span key={`activity-${value}`} className="rounded-md bg-blue-50 px-2 py-1 text-[11px] font-bold capitalize text-blue-700">
                  {value.replace(/_/g, ' ')}
                </span>
              ))}
              {filters.tags?.map((tag) => (
                <span key={`tag-${tag.id}`} className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">
                  {tag.name}
                </span>
              ))}
            </div>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function ReportPage({ userId }: { userId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const utils = trpc.useUtils();
  const initialPreset = (searchParams.get('preset') ?? 'this_month') as ReportPreset;
  const safeInitialPreset = REPORT_PRESETS.some((item) => item.value === initialPreset) ? initialPreset : 'this_month';
  const [preset, setPreset] = React.useState<ReportPreset>(safeInitialPreset);
  const [activeTab, setActiveTab] = React.useState<(typeof TABS)[number]['key']>('summary');
  const [feedItems, setFeedItems] = React.useState<Record<string, any>[]>([]);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [filters, setFilters] = React.useState<ReportFilters>({});
  const compactFilters = React.useMemo(() => compactReportFilters(filters), [filters]);

  const reportQuery = trpc.reports.getRepReport.useQuery(
    { userId, preset, filters: compactFilters },
    { refetchOnWindowFocus: false }
  );
  const exportReport = trpc.reports.exportRepReport.useMutation({
    onSuccess: (result) => {
      downloadDataUrl(result.url, result.filename);
      toast.success('Report PDF generated');
    },
    onError: (err) => toast.error('Could not export report', { description: err.message }),
  });
  const exportActivityFeed = trpc.reports.exportActivityFeed.useMutation({
    onSuccess: (result) => {
      downloadDataUrl(result.url, result.filename);
      toast.success('Activity feed CSV exported', {
        description: `${result.rowCount} activities included.`,
      });
    },
    onError: (err) => toast.error('Could not export activity feed', { description: err.message }),
  });

  React.useEffect(() => {
    if (reportQuery.data?.activityFeed) {
      setFeedItems(reportQuery.data.activityFeed as Record<string, any>[]);
    }
  }, [reportQuery.data?.activityFeed]);

  function handlePresetChange(nextPreset: ReportPreset) {
    setPreset(nextPreset);
    router.replace(`/reports/${userId}?preset=${nextPreset}`, { scroll: false });
  }

  async function loadMore() {
    setLoadingMore(true);
    try {
      const nextItems = await utils.client.reports.getActivityFeed.query({
        userId,
        preset,
        filters: compactFilters,
        offset: feedItems.length,
        limit: 30,
      });
      setFeedItems((current) => [...current, ...(nextItems as Record<string, any>[])]);
    } catch (error) {
      toast.error('Could not load more activity', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setLoadingMore(false);
    }
  }

  if (reportQuery.isLoading) {
    return (
      <div className="min-h-screen bg-[var(--surface-page)] p-4 md:p-6">
        <div className="mx-auto max-w-7xl space-y-4">
          <div className="skeleton h-32 rounded-2xl" />
          <div className="skeleton h-20 rounded-2xl" />
          <div className="skeleton h-96 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (reportQuery.error || !reportQuery.data) {
    return (
      <div className="min-h-screen bg-[var(--surface-page)] p-6">
        <div className="mx-auto max-w-2xl rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-black text-red-700">Could not load report</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">{reportQuery.error?.message ?? 'Please try again.'}</p>
        </div>
      </div>
    );
  }

  const data = reportQuery.data;

  return (
    <div className="min-h-screen bg-[var(--surface-page)] p-4 print:bg-white md:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <ReportHeader
          rep={data.rep}
          period={data.period}
          preset={preset}
          onPresetChange={handlePresetChange}
          onExport={() => exportReport.mutate({ userId, preset, filters: compactFilters })}
          onExportFeed={() => exportActivityFeed.mutate({ userId, preset, filters: compactFilters })}
          exporting={exportReport.isPending}
          exportingFeed={exportActivityFeed.isPending}
        />

        <ReportFiltersPanel
          filters={filters}
          onChange={setFilters}
          onClear={() => setFilters({})}
        />

        <HighlightsBanner highlights={data.highlights} />

        <div className="sticky top-[52px] z-20 flex gap-1 overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-white/90 p-1 shadow-sm backdrop-blur print:hidden">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`h-9 shrink-0 rounded-lg px-3 text-sm font-bold transition-all ${
                activeTab === tab.key
                  ? 'bg-[var(--accent)] text-white shadow-sm'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--accent-light)] hover:text-[var(--accent)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="space-y-5 print:block">
          {(activeTab === 'summary' || typeof window === 'undefined') && (
            <ActivitySummarySection summary={data.summary} previous={data.comparisonToPrevious.summary} />
          )}
          {activeTab === 'pipeline' && <PipelineSection pipeline={data.pipeline} topDeals={data.topDeals} monetaryValuesHidden={Boolean(data.monetaryValuesHidden)} />}
          {activeTab === 'demos' && <DemoSection demo={data.demoAnalysis} />}
          {activeTab === 'weekly' && <WeeklyBreakdown weeks={data.weeklyBreakdown} />}
          {activeTab === 'feed' && (
            <ActivityFeed
              initialItems={feedItems}
              onLoadMore={loadMore}
              loadingMore={loadingMore}
              hasMore={feedItems.length > 0 && feedItems.length % 30 === 0}
              filters={compactFilters}
            />
          )}
        </div>
      </div>
    </div>
  );
}

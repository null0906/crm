'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { ReportHeader } from './ReportHeader';
import { HighlightsBanner } from './HighlightsBanner';
import { ActivitySummarySection } from './ActivitySummarySection';
import { PipelineSection } from './PipelineSection';
import { DemoSection } from './DemoSection';
import { WeeklyBreakdown } from './WeeklyBreakdown';
import { ActivityFeed } from './ActivityFeed';
import { REPORT_PRESETS, type ReportPreset } from './report-utils';

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

  const reportQuery = trpc.reports.getRepReport.useQuery(
    { userId, preset },
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
          onExport={() => exportReport.mutate({ userId, preset })}
          onExportFeed={() => exportActivityFeed.mutate({ userId, preset })}
          exporting={exportReport.isPending}
          exportingFeed={exportActivityFeed.isPending}
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
          {activeTab === 'pipeline' && <PipelineSection pipeline={data.pipeline} topDeals={data.topDeals} />}
          {activeTab === 'demos' && <DemoSection demo={data.demoAnalysis} />}
          {activeTab === 'weekly' && <WeeklyBreakdown weeks={data.weeklyBreakdown} />}
          {activeTab === 'feed' && (
            <ActivityFeed
              initialItems={feedItems}
              onLoadMore={loadMore}
              loadingMore={loadingMore}
              hasMore={feedItems.length > 0 && feedItems.length % 30 === 0}
            />
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { TrendingUp, Activity, BarChart2, PieChart, TrendingDown, Filter, ClipboardCheck } from 'lucide-react';
import type { DashboardDataSource } from '@/lib/types';

interface AddWidgetModalProps {
  dashboardId: string;
  sourceContext: DashboardDataSource;
  onClose: () => void;
  onAdded: () => void;
}

const WIDGET_TYPES = [
  {
    type: 'onboarding_stats',
    label: 'Onboarding Stats',
    description: 'Active, onboarding-complete, and stale handoffs',
    icon: ClipboardCheck,
    configs: [{ label: 'Onboarding Overview' }],
  },
  {
    type: 'metric_card',
    label: 'Metric Card',
    description: 'Single KPI number with context',
    icon: TrendingUp,
    configs: [
      { label: 'Pipeline Value',  metric: 'pipeline_value' },
      { label: 'Won Revenue',     metric: 'won_value' },
      { label: 'Win Rate',        metric: 'win_rate' },
      { label: 'Avg Prospect Size', metric: 'avg_deal_size' },
      { label: 'Open Prospects',    metric: 'open_deals' },
      { label: 'Total Contacts',  metric: 'contacts' },
      { label: 'Total Companies', metric: 'companies' },
    ],
  },
  {
    type: 'line_chart',
    label: 'Revenue Trend',
    description: 'Monthly pipeline & revenue area chart',
    icon: TrendingDown,
    configs: [{ label: 'Monthly Revenue Trend' }],
  },
  {
    type: 'funnel_chart',
    label: 'Pipeline Funnel',
    description: 'Stage-by-stage prospect conversion funnel',
    icon: Filter,
    configs: [{ label: 'Prospect Conversion Funnel' }],
  },
  {
    type: 'pipeline_summary',
    label: 'Pipeline Summary',
    description: 'Prospects per stage bar chart',
    icon: BarChart2,
    configs: [{ label: 'Pipeline Overview' }],
  },
  {
    type: 'bar_chart',
    label: 'Prospects by Status',
    description: 'Open / Won / Lost breakdown',
    icon: BarChart2,
    configs: [{ label: 'Prospect Status Chart' }],
  },
  {
    type: 'pie_chart',
    label: 'Contacts by Status',
    description: 'Donut chart of contact statuses',
    icon: PieChart,
    configs: [{ label: 'Contact Status' }],
  },
  {
    type: 'activity_feed',
    label: 'Activity Feed',
    description: 'Live stream of recent activities',
    icon: Activity,
    configs: [{ label: 'Recent Activities', limit: 10 }],
  },
];

const WIDGET_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899',
];

const CHART_TYPE_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
  pipeline_summary: [
    { value: 'bar', label: 'Vertical Bar' },
    { value: 'horizontal_bar', label: 'Horizontal Bar' },
  ],
  bar_chart: [
    { value: 'bar', label: 'Vertical Bar' },
    { value: 'horizontal_bar', label: 'Horizontal Bar' },
  ],
  line_chart: [
    { value: 'area', label: 'Area' },
    { value: 'line', label: 'Line' },
  ],
};

export function AddWidgetModal({ dashboardId, sourceContext, onClose, onAdded }: AddWidgetModalProps) {
  const [selectedType, setSelectedType] = useState(WIDGET_TYPES[0]!);
  const [selectedConfig, setSelectedConfig] = useState(0);
  const [title, setTitle] = useState('');
  const [color, setColor] = useState(WIDGET_COLORS[0]!);
  const [showLabels, setShowLabels] = useState(false);
  const [chartType, setChartType] = useState('');

  const chartTypeOptions = CHART_TYPE_OPTIONS[selectedType.type] ?? [];

  const addWidget = trpc.dashboards.addWidget.useMutation({
    onSuccess: () => {
      toast.success('Widget added');
      onAdded();
      onClose();
    },
    onError: (err) => toast.error('Failed to add widget', { description: err.message }),
  });

  function handleAdd() {
    const cfg = selectedType.configs[selectedConfig];
    const widgetTitle = title.trim() || cfg?.label || selectedType.label;
    const resolvedChartType = chartType || (chartTypeOptions[0]?.value ?? '');
    addWidget.mutate({
      dashboardId,
      widgetType: selectedType.type as 'metric_card' | 'bar_chart' | 'line_chart' | 'pie_chart' | 'funnel_chart' | 'pipeline_summary' | 'activity_feed' | 'leaderboard' | 'goal_tracker' | 'conversion_rate' | 'time_in_stage' | 'forecast' | 'table' | 'custom_query' | 'onboarding_stats',
      title: widgetTitle,
      color,
      config: {
        ...(cfg as Record<string, unknown>),
        sourceContext,
        ...(chartTypeOptions.length > 0 ? { chartType: resolvedChartType, showLabels } : {}),
      },
    });
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h3 className="text-base font-semibold text-slate-900 mb-1">Add Widget</h3>
        <p className="text-sm text-slate-500">Choose a widget type to add to your dashboard.</p>
      </div>

      {/* Widget type grid */}
      <div className="grid grid-cols-2 gap-2">
        {WIDGET_TYPES.map((wt) => (
          <button
            key={wt.type}
            onClick={() => { setSelectedType(wt); setSelectedConfig(0); setTitle(''); setChartType(''); setShowLabels(false); }}
            className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${selectedType.type === wt.type ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${selectedType.type === wt.type ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
              <wt.icon className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-800">{wt.label}</p>
              <p className="text-xs text-slate-500 mt-0.5">{wt.description}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Config preset */}
      {selectedType.configs.length > 1 && (
        <div>
          <label className="text-xs font-medium text-slate-700 mb-1.5 block">Metric</label>
          <div className="flex flex-wrap gap-2">
            {selectedType.configs.map((cfg, i) => (
              <button
                key={i}
                onClick={() => setSelectedConfig(i)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${selectedConfig === i ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
              >
                {cfg.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Custom title */}
      <div>
        <label className="text-xs font-medium text-slate-700 mb-1.5 block">Title (optional)</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={selectedType.configs[selectedConfig]?.label ?? selectedType.label}
          className="w-full text-sm border border-slate-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Chart type selector (only for chart widgets) */}
      {chartTypeOptions.length > 0 && (
        <div>
          <label className="text-xs font-medium text-slate-700 mb-1.5 block">Chart type</label>
          <div className="flex items-center gap-2">
            {chartTypeOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setChartType(opt.value)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${(chartType || chartTypeOptions[0]!.value) === opt.value ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Show data labels (only for chart widgets) */}
      {chartTypeOptions.length > 0 && (
        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-slate-700">Show data labels</label>
          <button
            type="button"
            onClick={() => setShowLabels(!showLabels)}
            className={`relative w-9 h-5 rounded-full transition-colors ${showLabels ? 'bg-blue-500' : 'bg-slate-200'}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${showLabels ? 'translate-x-4' : 'translate-x-0'}`}
            />
          </button>
          <span className="text-xs text-slate-400">{showLabels ? 'On' : 'Off'}</span>
        </div>
      )}

      {/* Color */}
      <div>
        <label className="text-xs font-medium text-slate-700 mb-1.5 block">Accent color</label>
        <div className="flex items-center gap-2">
          {WIDGET_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-6 h-6 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-offset-1 ring-slate-400' : 'hover:scale-110'}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
        <Button onClick={handleAdd} disabled={addWidget.isPending} className="flex-1">
          {addWidget.isPending ? 'Adding...' : 'Add Widget'}
        </Button>
      </div>
    </div>
  );
}

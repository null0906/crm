'use client';

import React, { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { TrendingUp, Activity, BarChart2, PieChart, TrendingDown, Filter } from 'lucide-react';
import type { DashboardDataSource } from '@/lib/types';

interface AddWidgetModalProps {
  dashboardId: string;
  sourceContext: DashboardDataSource;
  onClose: () => void;
  onAdded: () => void;
}

const WIDGET_TYPES = [
  {
    type: 'metric_card',
    label: 'Metric Card',
    description: 'Single KPI number with context',
    icon: TrendingUp,
    configs: [
      { label: 'Pipeline Value',  metric: 'pipeline_value' },
      { label: 'Won Revenue',     metric: 'won_value' },
      { label: 'Win Rate',        metric: 'win_rate' },
      { label: 'Avg Deal Size',   metric: 'avg_deal_size' },
      { label: 'Open Deals',      metric: 'open_deals' },
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
    description: 'Stage-by-stage deal conversion funnel',
    icon: Filter,
    configs: [{ label: 'Deal Conversion Funnel' }],
  },
  {
    type: 'pipeline_summary',
    label: 'Pipeline Summary',
    description: 'Deals per stage bar chart',
    icon: BarChart2,
    configs: [{ label: 'Pipeline Overview' }],
  },
  {
    type: 'bar_chart',
    label: 'Deals by Status',
    description: 'Open / Won / Lost breakdown',
    icon: BarChart2,
    configs: [{ label: 'Deal Status Chart' }],
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

export function AddWidgetModal({ dashboardId, sourceContext, onClose, onAdded }: AddWidgetModalProps) {
  const [selectedType, setSelectedType] = useState(WIDGET_TYPES[0]!);
  const [selectedConfig, setSelectedConfig] = useState(0);
  const [title, setTitle] = useState('');
  const [color, setColor] = useState(WIDGET_COLORS[0]!);

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
    addWidget.mutate({
      dashboardId,
      widgetType: selectedType.type as 'metric_card' | 'bar_chart' | 'line_chart' | 'pie_chart' | 'funnel_chart' | 'pipeline_summary' | 'activity_feed' | 'leaderboard' | 'goal_tracker' | 'conversion_rate' | 'time_in_stage' | 'forecast' | 'table' | 'custom_query',
      title: widgetTitle,
      color,
      config: { ...(cfg as Record<string, unknown>), sourceContext },
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
            onClick={() => { setSelectedType(wt); setSelectedConfig(0); setTitle(''); }}
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

'use client';

import React, { useState } from 'react';
import { Plus, Settings2, Trash2, Edit2, Check, X, GripVertical } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { WidgetRenderer } from '@/components/dashboard/WidgetRenderer';
import { AddWidgetModal } from '@/components/dashboard/AddWidgetModal';
import { toast } from 'sonner';

interface DashboardWidget {
  id: string;
  widgetType: string;
  title: string;
  subtitle: string | null;
  color: string | null;
  config: unknown;
}

interface Dashboard {
  id: string;
  name: string;
  description: string | null;
  visibility: string;
  widgets: DashboardWidget[];
}

const WIDGET_COL_SPAN: Record<string, string> = {
  metric_card: 'col-span-1',
  activity_feed: 'col-span-2',
  pipeline_summary: 'col-span-2',
  bar_chart: 'col-span-2',
  pie_chart: 'col-span-2',
};

export default function DashboardPage() {
  const utils = trpc.useUtils();
  const [activeDashboardId, setActiveDashboardId] = useState<string>('');
  const [editMode, setEditMode] = useState(false);
  const [addWidgetOpen, setAddWidgetOpen] = useState(false);
  const [creatingDashboard, setCreatingDashboard] = useState(false);
  const [newDashName, setNewDashName] = useState('');

  const { data: dashboardList = [], isLoading: listLoading } = trpc.dashboards.list.useQuery();

  // Auto-select first dashboard
  React.useEffect(() => {
    const list = dashboardList as Array<{ id: string }>;
    if (list.length > 0 && !activeDashboardId) {
      setActiveDashboardId(String(list[0]!.id));
    }
  }, [dashboardList, activeDashboardId]);

  const { data: activeDashboard, refetch: refetchDashboard } = trpc.dashboards.getById.useQuery(
    { id: activeDashboardId },
    { enabled: !!activeDashboardId }
  );

  const createDashboard = trpc.dashboards.create.useMutation({
    onSuccess: (data) => {
      toast.success('Dashboard created');
      void utils.dashboards.list.invalidate();
      setActiveDashboardId(String(data!.id));
      setCreatingDashboard(false);
      setNewDashName('');
    },
    onError: (err) => toast.error('Failed to create dashboard', { description: err.message }),
  });

  const deleteDashboard = trpc.dashboards.delete.useMutation({
    onSuccess: () => {
      toast.success('Dashboard deleted');
      void utils.dashboards.list.invalidate();
      setActiveDashboardId('');
      setEditMode(false);
    },
    onError: (err) => toast.error('Failed to delete dashboard', { description: err.message }),
  });

  const deleteWidget = trpc.dashboards.deleteWidget.useMutation({
    onSuccess: () => {
      void refetchDashboard();
    },
    onError: (err) => toast.error('Failed to remove widget', { description: err.message }),
  });

  const widgets: DashboardWidget[] = (activeDashboard as Dashboard | undefined)?.widgets ?? [];

  if (listLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-sm text-slate-400">Loading dashboards...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          {/* Dashboard tabs */}
          <div className="flex items-center gap-1">
            {(dashboardList as unknown as Dashboard[]).map((d) => (
              <button
                key={d.id}
                onClick={() => { setActiveDashboardId(d.id); setEditMode(false); }}
                className={`text-sm px-3 py-1.5 rounded-md transition-colors ${activeDashboardId === d.id ? 'bg-slate-900 text-white font-medium' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {d.name}
              </button>
            ))}
          </div>

          {/* Create dashboard */}
          {creatingDashboard ? (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                value={newDashName}
                onChange={(e) => setNewDashName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newDashName.trim()) createDashboard.mutate({ name: newDashName.trim() });
                  if (e.key === 'Escape') { setCreatingDashboard(false); setNewDashName(''); }
                }}
                placeholder="Dashboard name..."
                className="text-sm border border-blue-400 rounded-md px-2.5 py-1 outline-none w-36 focus:ring-2 focus:ring-blue-200"
              />
              <button
                onClick={() => newDashName.trim() && createDashboard.mutate({ name: newDashName.trim() })}
                className="w-6 h-6 rounded flex items-center justify-center bg-blue-500 text-white hover:bg-blue-600"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => { setCreatingDashboard(false); setNewDashName(''); }}
                className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCreatingDashboard(true)}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 px-2 py-1 rounded-md hover:bg-slate-100 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New
            </button>
          )}
        </div>

        {activeDashboardId && (
          <div className="flex items-center gap-2">
            {editMode && (
              <Button
                size="sm"
                variant="outline"
                className="text-red-600 border-red-200 hover:bg-red-50"
                onClick={() => {
                  if (confirm('Delete this dashboard and all its widgets?')) {
                    deleteDashboard.mutate({ id: activeDashboardId });
                  }
                }}
              >
                <Trash2 className="w-4 h-4" />
                Delete dashboard
              </Button>
            )}
            {editMode && (
              <Button size="sm" onClick={() => setAddWidgetOpen(true)}>
                <Plus className="w-4 h-4" />
                Add Widget
              </Button>
            )}
            <Button
              size="sm"
              variant={editMode ? 'default' : 'outline'}
              onClick={() => setEditMode(!editMode)}
            >
              {editMode ? (
                <><Check className="w-4 h-4" />Done</>
              ) : (
                <><Settings2 className="w-4 h-4" />Edit</>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Dashboard content */}
      <div className="flex-1 overflow-y-auto p-6">
        {!activeDashboardId ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
              <Settings2 className="w-8 h-8 text-slate-400" />
            </div>
            <h2 className="text-base font-semibold text-slate-700 mb-1">No dashboard yet</h2>
            <p className="text-sm text-slate-400 mb-4">Create a dashboard to start tracking your metrics.</p>
            <Button onClick={() => setCreatingDashboard(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Create Dashboard
            </Button>
          </div>
        ) : widgets.length === 0 && !editMode ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-sm text-slate-400 mb-3">This dashboard has no widgets yet.</p>
            <Button size="sm" onClick={() => setEditMode(true)}>
              <Settings2 className="w-4 h-4 mr-1" />
              Enter Edit Mode
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-4 auto-rows-[180px]">
            {widgets.map((widget) => (
              <div
                key={widget.id}
                className={`bg-white border border-slate-200 rounded-xl p-4 relative group ${WIDGET_COL_SPAN[widget.widgetType] ?? 'col-span-1'}`}
              >
                {editMode && (
                  <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <button
                      onClick={() => {
                        if (confirm('Remove this widget?')) deleteWidget.mutate({ id: widget.id });
                      }}
                      className="w-6 h-6 rounded bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center"
                      title="Remove widget"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
                {editMode && (
                  <div className="absolute top-2 left-2 text-slate-300 cursor-grab">
                    <GripVertical className="w-4 h-4" />
                  </div>
                )}
                <WidgetRenderer widget={widget} />
              </div>
            ))}

            {/* Add widget placeholder in edit mode */}
            {editMode && (
              <button
                onClick={() => setAddWidgetOpen(true)}
                className="col-span-1 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center gap-2 text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/30 transition-colors"
              >
                <Plus className="w-8 h-8" />
                <span className="text-sm font-medium">Add Widget</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Add widget modal */}
      {addWidgetOpen && activeDashboardId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <AddWidgetModal
              dashboardId={activeDashboardId}
              onClose={() => setAddWidgetOpen(false)}
              onAdded={() => void refetchDashboard()}
            />
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import { Plus, LayoutGrid, List, Upload } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { SlideOverPanel } from '@/components/shared/SlideOverPanel';
import { KanbanBoard } from '@/components/deals/KanbanBoard';
import { DealTable } from '@/components/deals/DealTable';
import { DealForm } from '@/components/deals/DealForm';
import { DealDetail } from '@/components/deals/DealDetail';
import { ImportWizard } from '@/components/import-export/ImportWizard';

interface Stage {
  id: string;
  name: string;
  color: string | null;
  position: number;
}

type ViewMode = 'kanban' | 'table';

export default function DealsPage() {
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [createOpen, setCreateOpen] = useState(false);
  const [createStageId, setCreateStageId] = useState<string>('');
  const [selectedDealId, setSelectedDealId] = useState<string>('');
  const [importOpen, setImportOpen] = useState(false);

  const { data: pipelines = [], isLoading: pipelinesLoading } = trpc.pipelines.list.useQuery();

  // Auto-select first pipeline
  React.useEffect(() => {
    if (pipelines.length > 0 && !selectedPipelineId) {
      setSelectedPipelineId(String(pipelines[0]!.id));
    }
  }, [pipelines, selectedPipelineId]);

  const { data: pipelineData } = trpc.pipelines.getWithStages.useQuery(
    { id: selectedPipelineId },
    { enabled: !!selectedPipelineId }
  );

  const stages: Stage[] = ((pipelineData?.stages as Stage[]) ?? []).sort((a, b) => a.position - b.position);

  function handleAddDeal(stageId: string) {
    setCreateStageId(stageId);
    setCreateOpen(true);
  }

  if (pipelinesLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-sm text-slate-400">Loading pipelines...</div>
      </div>
    );
  }

  if (pipelines.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <LayoutGrid className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No pipelines found</p>
          <p className="text-sm text-slate-400 mt-1">Create a pipeline in Settings to get started.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white flex-shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-[15px] font-semibold text-slate-900 tracking-tight">Deals</h1>

          {/* Pipeline tabs */}
          <div className="flex items-center gap-0.5 bg-slate-100/80 border border-slate-200/60 rounded-lg p-1">
            {pipelines.map((pipeline) => (
              <button
                key={String(pipeline.id)}
                className={`text-[13px] px-3 py-1 rounded-md transition-all duration-150 ${
                  selectedPipelineId === String(pipeline.id)
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80 font-medium'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
                onClick={() => setSelectedPipelineId(String(pipeline.id))}
              >
                {pipeline.name as string}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center bg-slate-100/80 border border-slate-200/60 rounded-lg p-1">
            <button
              onClick={() => setViewMode('kanban')}
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'kanban' ? 'bg-white shadow-sm text-slate-900 border border-slate-200/80' : 'text-slate-400 hover:text-slate-600'}`}
              title="Kanban view"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'table' ? 'bg-white shadow-sm text-slate-900 border border-slate-200/80' : 'text-slate-400 hover:text-slate-600'}`}
              title="Table view"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>

          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4" />
            Import
          </Button>
          <Button size="sm" onClick={() => { setCreateStageId(stages[0]?.id ?? ''); setCreateOpen(true); }}>
            <Plus className="w-4 h-4" />
            Add Deal
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {!selectedPipelineId ? (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm">
            Select a pipeline
          </div>
        ) : viewMode === 'kanban' ? (
          stages.length > 0 ? (
            <KanbanBoard
              pipelineId={selectedPipelineId}
              stages={stages}
              onAddDeal={handleAddDeal}
              onDealClick={(deal) => setSelectedDealId(String(deal.id))}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">
              No stages in this pipeline.
            </div>
          )
        ) : (
          <DealTable
            pipelineId={selectedPipelineId}
            onDealClick={(dealId) => setSelectedDealId(dealId)}
          />
        )}
      </div>

      {/* Create Deal */}
      <SlideOverPanel open={createOpen} onClose={() => setCreateOpen(false)} title="Add Deal" width="md">
        <div className="p-6">
          {selectedPipelineId && (
            <DealForm
              pipelineId={selectedPipelineId}
              stageId={createStageId}
              onSuccess={() => setCreateOpen(false)}
              onCancel={() => setCreateOpen(false)}
            />
          )}
        </div>
      </SlideOverPanel>

      {/* Import Wizard */}
      <SlideOverPanel open={importOpen} onClose={() => setImportOpen(false)} title="Import Deals" width="lg">
        {importOpen && (
          <ImportWizard
            entityType="deal"
            pipelineId={selectedPipelineId}
            pipelineName={String(pipelines.find((p) => String(p.id) === selectedPipelineId)?.name ?? '')}
            onClose={() => setImportOpen(false)}
          />
        )}
      </SlideOverPanel>

      {/* Deal Detail */}
      {selectedDealId && (
        <DealDetail
          dealId={selectedDealId}
          open={!!selectedDealId}
          onClose={() => setSelectedDealId('')}
        />
      )}
    </div>
  );
}

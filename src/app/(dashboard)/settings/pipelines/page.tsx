'use client';

import React, { useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronLeft, Plus, LayoutGrid, Pencil, Trash2, ChevronDown, ChevronUp, GripVertical, Check, X } from 'lucide-react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { toast } from 'sonner';

const STAGE_COLORS = [
  '#6B7280', '#3B82F6', '#8B5CF6', '#EC4899',
  '#F59E0B', '#F97316', '#10B981', '#EF4444', '#06B6D4',
];

const PIPELINE_TYPE_OPTIONS = [
  { value: 'sales', label: 'Sales Pipeline' },
  { value: 'active_delivery', label: 'Active Delivery / Projects' },
  { value: 'partner', label: 'Partner Pipeline' },
  { value: 'compliance', label: 'Compliance Pipeline' },
] as const;

export default function PipelinesSettingsPage() {
  const utils = trpc.useUtils();
  const { data: pipelines = [], isLoading } = trpc.pipelines.list.useQuery();
  const [newPipelineName, setNewPipelineName] = useState('');
  const [creating, setCreating] = useState(false);

  const createPipeline = trpc.pipelines.create.useMutation({
    onSuccess: () => {
      toast.success('Pipeline created');
      setNewPipelineName('');
      setCreating(false);
      void utils.pipelines.list.invalidate();
    },
    onError: (err) => toast.error('Failed to create pipeline', { description: err.message }),
  });

  function handleCreate() {
    if (!newPipelineName.trim()) return;
    createPipeline.mutate({
      name: newPipelineName.trim(),
      stages: [
        { name: 'Lead', stageType: 'active', defaultProbability: 10 },
        { name: 'Proposal', stageType: 'active', defaultProbability: 40 },
        { name: 'Negotiation', stageType: 'active', defaultProbability: 70 },
        { name: 'Won', stageType: 'won', defaultProbability: 100 },
        { name: 'Lost', stageType: 'lost', defaultProbability: 0 },
      ],
    });
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Link href="/settings" className="text-slate-400 hover:text-slate-600">
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-[15px] font-semibold text-slate-900 tracking-tight">Pipelines</h1>
            <p className="text-xs text-slate-400 mt-0.5">Configure your sales pipelines and stages.</p>
          </div>
        </div>
        <Button size="sm" onClick={() => setCreating(!creating)}>
          <Plus className="w-4 h-4" />
          New Pipeline
        </Button>
      </div>

      {creating && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">New Pipeline</h3>
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs">Pipeline Name</Label>
              <Input
                value={newPipelineName}
                onChange={(e) => setNewPipelineName(e.target.value)}
                placeholder="e.g. Enterprise Sales"
                className="h-8"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
            </div>
            <Button size="sm" onClick={handleCreate} disabled={!newPipelineName.trim() || createPipeline.isPending}>
              {createPipeline.isPending ? 'Creating...' : 'Create'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
          </div>
          <p className="text-xs text-slate-400 mt-2">Default stages will be created automatically.</p>
        </div>
      )}

      <div className="space-y-3">
        {isLoading ? (
          <div className="text-sm text-slate-400">Loading...</div>
        ) : pipelines.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
            <LayoutGrid className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No pipelines yet.</p>
          </div>
        ) : (
          pipelines.map((pipeline) => (
            <PipelineCard key={String(pipeline.id)} pipeline={pipeline} />
          ))
        )}
      </div>
    </div>
  );
}

function PipelineCard({ pipeline }: { pipeline: Record<string, unknown> }) {
  const utils = trpc.useUtils();
  const [expanded, setExpanded] = useState(false);
  const [addingStage, setAddingStage] = useState(false);
  const [newStageName, setNewStageName] = useState('');
  const [newStageColor, setNewStageColor] = useState('#3B82F6');
  const [newStageType, setNewStageType] = useState<'active' | 'won' | 'lost'>('active');
  const [newStageProbability, setNewStageProbability] = useState(50);
  const [deleteStageId, setDeleteStageId] = useState<string | null>(null);

  const pipelineId = pipeline.id as string;

  const { data: pipelineData } = trpc.pipelines.getWithStages.useQuery({ id: pipelineId });
  const stages = (pipelineData?.stages as Array<Record<string, unknown>>) ?? [];
  const pipelineType = String(pipelineData?.pipelineType ?? pipeline.pipelineType ?? 'sales');
  const [draftStages, setDraftStages] = useState<Array<Record<string, unknown>>>([]);

  React.useEffect(() => {
    setDraftStages(stages);
  }, [stages]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const draftStageIds = draftStages.map((stage) => String(stage.id));
  const hasStageOrderChanges =
    draftStages.length === stages.length &&
    draftStages.some((stage, index) => String(stage.id) !== String(stages[index]?.id));

  const addStage = trpc.pipelines.addStage.useMutation({
    onSuccess: () => {
      toast.success('Stage added');
      setAddingStage(false);
      setNewStageName('');
      setNewStageColor('#3B82F6');
      setNewStageType('active');
      setNewStageProbability(50);
      void utils.pipelines.getWithStages.invalidate();
      void utils.pipelines.list.invalidate();
      void utils.deals.byStage.invalidate();
      void utils.deals.list.invalidate();
    },
    onError: (err) => toast.error('Failed to add stage', { description: err.message }),
  });

  const reorderStages = trpc.pipelines.reorderStages.useMutation({
    onSuccess: () => {
      toast.success('Stage order updated');
      void utils.pipelines.getWithStages.invalidate({ id: pipelineId });
      void utils.pipelines.list.invalidate();
      void utils.deals.byStage.invalidate();
      void utils.deals.list.invalidate();
    },
    onError: (err) => toast.error('Failed to reorder stages', { description: err.message }),
  });

  const deleteStage = trpc.pipelines.deleteStage.useMutation({
    onSuccess: () => {
      toast.success('Stage deleted');
      setDeleteStageId(null);
      void utils.pipelines.getWithStages.invalidate();
      void utils.pipelines.list.invalidate();
      void utils.deals.byStage.invalidate();
      void utils.deals.list.invalidate();
    },
    onError: (err) => toast.error('Failed to delete stage', { description: err.message }),
  });

  const updatePipeline = trpc.pipelines.update.useMutation({
    onSuccess: () => {
      toast.success('Pipeline type updated');
      void utils.pipelines.getWithStages.invalidate({ id: pipelineId });
      void utils.pipelines.list.invalidate();
      void utils.deals.byStage.invalidate();
      void utils.deals.list.invalidate();
    },
    onError: (err) => toast.error('Failed to update pipeline type', { description: err.message }),
  });

  function handleAddStage() {
    if (!newStageName.trim()) return;
    addStage.mutate({
      pipelineId,
      name: newStageName.trim(),
      color: newStageColor,
      stageType: newStageType,
      defaultProbability: newStageProbability,
      position: stages.length,
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setDraftStages((currentStages) => {
      const oldIndex = currentStages.findIndex((stage) => String(stage.id) === String(active.id));
      const newIndex = currentStages.findIndex((stage) => String(stage.id) === String(over.id));
      if (oldIndex === -1 || newIndex === -1) return currentStages;
      return arrayMove(currentStages, oldIndex, newIndex);
    });
  }

  function handleSaveStageOrder() {
    if (!hasStageOrderChanges) return;
    reorderStages.mutate({
      pipelineId,
      stageIds: draftStageIds,
    });
  }

  function handleDiscardStageOrder() {
    setDraftStages(stages);
  }

  return (
    <>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {/* Pipeline header */}
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-slate-400 hover:text-slate-600"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            <div>
              <h3 className="text-sm font-semibold text-slate-800">{pipeline.name as string}</h3>
              {!!pipeline.description && (
                <p className="text-xs text-slate-400 mt-0.5">{pipeline.description as string}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={pipeline.isActive ? 'success' : 'secondary'} className="text-xs">
              {pipeline.isActive ? 'Active' : 'Inactive'}
            </Badge>
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              {expanded ? 'Hide stages' : 'Edit stages'}
            </button>
          </div>
        </div>

        {/* Stage pills preview (when collapsed) */}
        {!expanded && (
          <div className="flex items-center gap-2 flex-wrap px-5 pb-4">
            {stages.map((stage, i) => (
              <div key={stage.id as string} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: (stage.color as string) ?? '#6B7280' }} />
                <span className="text-xs text-slate-600">{stage.name as string}</span>
                {i < stages.length - 1 && <span className="text-slate-300 text-xs">→</span>}
              </div>
            ))}
          </div>
        )}

        {/* Expanded stage editor */}
        {expanded && (
          <div className="border-t border-slate-100 px-5 py-4">
            <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50/60 p-3">
              <Label className="text-xs font-semibold text-slate-600">Pipeline Type</Label>
              <select
                value={pipelineType}
                onChange={(e) => updatePipeline.mutate({
                  id: pipelineId,
                  pipelineType: e.target.value as 'sales' | 'active_delivery' | 'partner' | 'compliance',
                })}
                disabled={updatePipeline.isPending}
                className="mt-1 flex h-8 w-full rounded-md border border-blue-100 bg-white px-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {PIPELINE_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                This controls which features are available for deals in this pipeline. Active Delivery and Compliance pipelines show project fields, timeline, and team members.
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Stages</p>
                <p className="text-xs text-slate-400 mt-1">Drag stages into the order you want, then save the new flow.</p>
              </div>
              <div className="flex items-center gap-2">
                {hasStageOrderChanges && (
                  <>
                    <Button size="sm" variant="outline" onClick={handleDiscardStageOrder} disabled={reorderStages.isPending}>
                      Discard
                    </Button>
                    <Button size="sm" onClick={handleSaveStageOrder} disabled={reorderStages.isPending}>
                      {reorderStages.isPending ? 'Saving...' : 'Save Order'}
                    </Button>
                  </>
                )}
                <button
                  onClick={() => setAddingStage(true)}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Stage
                </button>
              </div>
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={draftStageIds} strategy={verticalListSortingStrategy}>
                <div className="space-y-1.5">
                  {draftStages.map((stage) => (
                    <StageRow
                      key={stage.id as string}
                      stage={stage}
                      pipelineId={pipelineId}
                      reorderPending={reorderStages.isPending}
                      onDelete={() => setDeleteStageId(stage.id as string)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {/* Add stage form */}
            {addingStage && (
              <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-xs font-semibold text-slate-600 mb-3">New Stage</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Name</Label>
                    <Input
                      value={newStageName}
                      onChange={(e) => setNewStageName(e.target.value)}
                      placeholder="e.g. Discovery"
                      className="h-8 text-sm"
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && handleAddStage()}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Type</Label>
                    <select
                      value={newStageType}
                      onChange={(e) => setNewStageType(e.target.value as 'active' | 'won' | 'lost')}
                      className="flex h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="active">Active</option>
                      <option value="won">Won</option>
                      <option value="lost">Lost</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Probability (%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={newStageProbability}
                      onChange={(e) => setNewStageProbability(Number(e.target.value))}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Color</Label>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {STAGE_COLORS.map((c) => (
                        <button
                          key={c}
                          onClick={() => setNewStageColor(c)}
                          className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
                          style={{
                            backgroundColor: c,
                            borderColor: newStageColor === c ? '#1e40af' : 'transparent',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" onClick={handleAddStage} disabled={!newStageName.trim() || addStage.isPending}>
                    {addStage.isPending ? 'Adding...' : 'Add Stage'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setAddingStage(false); setNewStageName(''); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete stage confirm */}
      <ConfirmDialog
        open={!!deleteStageId}
        onOpenChange={(open) => { if (!open) setDeleteStageId(null); }}
        title="Delete stage?"
        description="This will remove the stage only if no deals are still using it. Deals in that stage are not deleted automatically."
        confirmLabel="Delete"
        destructive
        loading={deleteStage.isPending}
        onConfirm={() => deleteStageId && deleteStage.mutate({ id: deleteStageId })}
      />
    </>
  );
}

function StageRow({ stage, pipelineId, onDelete, reorderPending }: {
  stage: Record<string, unknown>;
  pipelineId: string;
  onDelete: () => void;
  reorderPending: boolean;
}) {
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(stage.name as string);
  const [color, setColor] = useState((stage.color as string) ?? '#6B7280');
  const [probability, setProbability] = useState((stage.defaultProbability as number) ?? 0);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: String(stage.id), disabled: editing || reorderPending });

  React.useEffect(() => {
    setName(stage.name as string);
    setColor((stage.color as string) ?? '#6B7280');
    setProbability((stage.defaultProbability as number) ?? 0);
  }, [stage.name, stage.color, stage.defaultProbability]);

  const updateStage = trpc.pipelines.updateStage.useMutation({
    onSuccess: () => {
      toast.success('Stage updated');
      setEditing(false);
      void utils.pipelines.getWithStages.invalidate();
      void utils.pipelines.list.invalidate();
      void utils.deals.byStage.invalidate();
      void utils.deals.list.invalidate();
    },
    onError: (err) => toast.error('Failed to update stage', { description: err.message }),
  });

  const isSystem = stage.isSystemStage as boolean;
  const stageType = stage.stageType as string;

  const typeColor = stageType === 'won' ? 'text-green-600' : stageType === 'lost' ? 'text-red-500' : 'text-slate-400';
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  if (editing) {
    return (
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 text-sm"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Probability (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={probability}
              onChange={(e) => setProbability(Number(e.target.value))}
              className="h-8 text-sm"
            />
          </div>
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Color</Label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {STAGE_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    borderColor: color === c ? '#1e40af' : 'transparent',
                  }}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <Button
            size="sm"
            onClick={() => updateStage.mutate({ id: stage.id as string, name, color, defaultProbability: probability })}
            disabled={!name.trim() || updateStage.isPending}
          >
            <Check className="w-3.5 h-3.5 mr-1" />
            {updateStage.isPending ? 'Saving...' : 'Save'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setEditing(false); setName(stage.name as string); setColor((stage.color as string) ?? '#6B7280'); }}>
            <X className="w-3.5 h-3.5 mr-1" />
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg border border-transparent group ${
        isDragging ? 'bg-blue-50 border-blue-200 shadow-sm' : 'hover:bg-slate-50'
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        disabled={reorderPending}
        className="cursor-grab active:cursor-grabbing p-1 -ml-1 rounded text-slate-300 hover:text-slate-500 disabled:cursor-not-allowed"
        title="Drag to reorder stage"
      >
        <GripVertical className="w-3.5 h-3.5 flex-shrink-0" />
      </button>
      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      <span className="text-sm text-slate-700 flex-1">{name}</span>
      <span className={`text-xs font-medium capitalize ${typeColor}`}>{stageType}</span>
      <span className="text-xs text-slate-400">{probability}%</span>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => setEditing(true)}
          className="p-1 rounded hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"
          title="Edit stage"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        {!isSystem && (
          <button
            onClick={onDelete}
            className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
            title="Delete stage"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

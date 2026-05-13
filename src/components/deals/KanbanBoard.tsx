'use client';

import React, { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { DealCard } from './DealCard';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/formatters';

interface Stage {
  id: string;
  name: string;
  color: string | null;
  position: number;
}

interface KanbanColumnProps {
  stage: Stage;
  deals: Record<string, unknown>[];
  onAddDeal: (stageId: string) => void;
  onDealClick: (deal: Record<string, unknown>) => void;
}

function getStageColor(stage: Stage) {
  return stage.color || 'var(--color-stage-neutral)';
}

function DealCardSkeleton() {
  return (
    <div className="rounded-[10px] border border-l-[3px] border-[var(--color-border-ui)] border-l-[var(--color-header-border)] bg-[var(--color-surface)] p-3.5 shadow-sm">
      <div className="skeleton mb-3 h-3.5 w-3/4" />
      <div className="skeleton mb-3 h-[18px] w-2/5" />
      <div className="flex flex-col gap-1.5">
        <div className="skeleton h-3 w-[55%]" />
        <div className="skeleton h-3 w-[45%]" />
        <div className="skeleton h-3 w-[60%]" />
      </div>
    </div>
  );
}

function KanbanColumn({ stage, deals, onAddDeal, onDealClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  const totalValue = deals.reduce((sum, d) => sum + (parseFloat(d.amount as string) || 0), 0);
  const stageColor = getStageColor(stage);

  return (
    <div
      ref={setNodeRef}
      className={`kanban-column flex w-[280px] flex-shrink-0 flex-col rounded-[10px] transition-[background,outline] duration-150 ${isOver ? 'drag-over bg-[rgba(37,99,235,0.04)] outline-2 outline-dashed outline-[rgba(37,99,235,0.30)] outline-offset-4' : 'bg-[rgba(241,243,248,0.65)]'}`}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="h-2 w-2 flex-shrink-0 rounded-full"
            style={{
              backgroundColor: stageColor,
              boxShadow: `0 0 0 3px color-mix(in srgb, ${stageColor} 22%, transparent)`,
            }}
          />
          <span className="truncate text-base font-semibold text-[var(--color-text-1)]">{stage.name}</span>
          <span className="min-w-[20px] flex-shrink-0 rounded-full bg-[var(--color-avatar-bg)] px-2 py-0.5 text-center text-xs font-semibold text-[var(--color-neutral)]">
            {deals.length}
          </span>
        </div>
        {totalValue > 0 && (
          <span className="ml-auto font-mono text-[11.5px] font-semibold text-[var(--color-company)]">
            {formatCurrency(totalValue)}
          </span>
        )}
      </div>

      {/* Cards */}
      <div className="flex-1 px-2 pb-3 space-y-2 min-h-[100px]">
        <SortableContext items={deals.map((d) => d.id as string)} strategy={verticalListSortingStrategy}>
          {deals.map((deal, index) => (
            <div key={deal.id as string} style={{ animationDelay: `${Math.min(index, 5) * 35}ms` }}>
              <DealCard deal={deal} stageColor={stageColor} onClick={() => onDealClick(deal)} />
            </div>
          ))}
        </SortableContext>

        {deals.length === 0 && (
          <div className="flex h-16 items-center justify-center rounded-lg border border-dashed border-[var(--color-border-strong)] text-xs text-[var(--color-text-3)]">
            Drop here
          </div>
        )}

        <button
          onClick={() => onAddDeal(stage.id)}
          className="mt-1 flex h-[34px] w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--color-border-strong)] bg-transparent text-sm font-medium text-[var(--color-text-3)] transition-[border-color,color,background] duration-150 hover:border-[var(--color-status-new-dot)] hover:bg-[var(--color-row-hover)] hover:text-[var(--color-accent)]"
        >
          <Plus className="h-[13px] w-[13px]" />
          Add deal
        </button>
      </div>
    </div>
  );
}

interface KanbanBoardProps {
  pipelineId: string;
  stages: Stage[];
  onAddDeal: (stageId: string) => void;
  onDealClick: (deal: Record<string, unknown>) => void;
  search?: string;
  extraFilters?: Array<{
    field: string;
    operator: 'eq' | 'neq' | 'contains' | 'contains_any' | 'gte' | 'lte' | 'gt' | 'lt' | 'in' | 'not_in' | 'is_empty' | 'is_not_empty';
    value: unknown;
  }>;
}

export function KanbanBoard({ pipelineId, stages, onAddDeal, onDealClick, search, extraFilters }: KanbanBoardProps) {
  const utils = trpc.useUtils();
  const [activeDeal, setActiveDeal] = useState<Record<string, unknown> | null>(null);
  const [dealsByStage, setDealsByStage] = useState<Record<string, Record<string, unknown>[]>>({});

  const { data, isLoading } = trpc.deals.byStage.useQuery({
    pipelineId,
    search: search || undefined,
    filters: extraFilters && extraFilters.length > 0 ? { conditions: extraFilters, logic: 'AND' } : undefined,
  });

  React.useEffect(() => {
    if (data) {
      setDealsByStage(data as Record<string, Record<string, unknown>[]>);
    }
  }, [data]);

  const moveToStage = trpc.deals.moveToStage.useMutation({
    onError: () => {
      // Refetch on error to revert optimistic update
      void utils.deals.byStage.invalidate({
        pipelineId,
        search: search || undefined,
        filters: extraFilters && extraFilters.length > 0 ? { conditions: extraFilters, logic: 'AND' } : undefined,
      });
      toast.error('Failed to move deal');
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  function findStageForDeal(dealId: string): string | undefined {
    for (const [stageId, deals] of Object.entries(dealsByStage)) {
      if (deals.some((d) => d.id === dealId)) return stageId;
    }
    return undefined;
  }

  function handleDragStart(event: DragStartEvent) {
    const { active } = event;
    const stageId = findStageForDeal(active.id as string);
    if (stageId) {
      const deal = dealsByStage[stageId]?.find((d) => d.id === active.id);
      if (deal) setActiveDeal(deal);
    }
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeStageId = findStageForDeal(active.id as string);
    const overStageId = stages.some((s) => s.id === over.id)
      ? (over.id as string)
      : findStageForDeal(over.id as string);

    if (!activeStageId || !overStageId || activeStageId === overStageId) return;

    setDealsByStage((prev) => {
      const activeDealItem = prev[activeStageId]?.find((d) => d.id === active.id);
      if (!activeDealItem) return prev;

      return {
        ...prev,
        [activeStageId]: (prev[activeStageId] ?? []).filter((d) => d.id !== active.id),
        [overStageId]: [...(prev[overStageId] ?? []), activeDealItem],
      };
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDeal(null);

    if (!over) return;

    const overStageId = stages.some((s) => s.id === over.id)
      ? (over.id as string)
      : findStageForDeal(over.id as string);

    if (!overStageId) return;

    moveToStage.mutate({
      dealId: active.id as string,
      toStageId: overStageId,
    });
  }

  if (isLoading) {
    return (
      <div className="flex h-full gap-3 overflow-x-auto p-4">
        {stages.map((stage) => (
          <div key={stage.id} className="w-[280px] flex-shrink-0 rounded-[10px] bg-[rgba(241,243,248,0.65)] p-2">
            <div className="mb-3 flex items-center gap-2 px-1 pt-1">
              <div className="skeleton h-2 w-2 rounded-full" />
              <div className="skeleton h-3.5 w-28" />
              <div className="skeleton ml-auto h-3 w-14" />
            </div>
            <div className="space-y-2">
              <DealCardSkeleton />
              <DealCardSkeleton />
              <DealCardSkeleton />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex h-full items-start gap-3 overflow-x-auto p-4">
        {stages.map((stage) => (
          <KanbanColumn
            key={stage.id}
            stage={stage}
            deals={dealsByStage[stage.id] ?? []}
            onAddDeal={onAddDeal}
            onDealClick={onDealClick}
          />
        ))}
      </div>

      <DragOverlay>
        {activeDeal ? <DealCard deal={activeDeal} stageColor={(() => {
          const activeStage = stages.find((stage) => stage.id === findStageForDeal(String(activeDeal.id)));
          return activeStage ? getStageColor(activeStage) : undefined;
        })()} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

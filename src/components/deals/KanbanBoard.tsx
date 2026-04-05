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

function KanbanColumn({ stage, deals, onAddDeal, onDealClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  const totalValue = deals.reduce((sum, d) => sum + (parseFloat(d.amount as string) || 0), 0);

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col w-[272px] flex-shrink-0 rounded-xl transition-colors duration-150 ${isOver ? 'bg-blue-50/60' : 'bg-slate-50/80'}`}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: stage.color ?? '#94A3B8' }}
          />
          <span className="text-[12px] font-semibold text-slate-600 truncate">{stage.name}</span>
          <span className="text-[10px] font-semibold text-slate-400 bg-slate-200/80 rounded-full px-1.5 py-0.5 min-w-[18px] text-center flex-shrink-0">
            {deals.length}
          </span>
        </div>
        <button
          onClick={() => onAddDeal(stage.id)}
          className="w-5 h-5 rounded-md flex items-center justify-center text-slate-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {totalValue > 0 && (
        <div className="px-3 pb-2 text-[11px] text-slate-400 font-semibold font-data">
          {formatCurrency(totalValue)}
        </div>
      )}

      {/* Cards */}
      <div className="flex-1 px-2 pb-3 space-y-2 min-h-[100px]">
        <SortableContext items={deals.map((d) => d.id as string)} strategy={verticalListSortingStrategy}>
          {deals.map((deal) => (
            <DealCard key={deal.id as string} deal={deal} onClick={() => onDealClick(deal)} />
          ))}
        </SortableContext>

        {deals.length === 0 && (
          <div className="h-16 flex items-center justify-center text-[11px] text-slate-300 border border-dashed border-slate-200 rounded-lg">
            Drop here
          </div>
        )}
      </div>
    </div>
  );
}

interface KanbanBoardProps {
  pipelineId: string;
  stages: Stage[];
  onAddDeal: (stageId: string) => void;
  onDealClick: (deal: Record<string, unknown>) => void;
}

export function KanbanBoard({ pipelineId, stages, onAddDeal, onDealClick }: KanbanBoardProps) {
  const utils = trpc.useUtils();
  const [activeDeal, setActiveDeal] = useState<Record<string, unknown> | null>(null);
  const [dealsByStage, setDealsByStage] = useState<Record<string, Record<string, unknown>[]>>({});

  const { data, isLoading } = trpc.deals.byStage.useQuery({ pipelineId });

  React.useEffect(() => {
    if (data) {
      setDealsByStage(data as Record<string, Record<string, unknown>[]>);
    }
  }, [data]);

  const moveToStage = trpc.deals.moveToStage.useMutation({
    onError: () => {
      // Refetch on error to revert optimistic update
      void utils.deals.byStage.invalidate({ pipelineId });
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
      <div className="flex gap-4 p-4 overflow-x-auto h-full">
        {stages.map((stage) => (
          <div key={stage.id} className="w-72 flex-shrink-0 h-48 rounded-xl bg-slate-100 animate-pulse" />
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
      <div className="flex gap-3 p-4 overflow-x-auto h-full items-start">
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
        {activeDeal ? <DealCard deal={activeDeal} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

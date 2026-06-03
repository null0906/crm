'use client';

import React from 'react';
import { Plus } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { DealCard } from './DealCard';
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
    <div className="m-[6px_8px_0] rounded-[10px] border border-l-[3px] border-[var(--border-subtle)] border-l-[var(--border-default)] bg-[var(--surface-card)] p-3.5 shadow-[var(--shadow-card)]">
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
  const totalValue = deals.reduce((sum, d) => sum + (parseFloat(d.amount as string) || 0), 0);
  const stageColor = getStageColor(stage);

  return (
    <div
      className="kanban-column flex w-[282px] flex-shrink-0 flex-col rounded-[14px] border border-white/80 bg-[rgba(255,255,255,0.55)] pb-2.5 shadow-[0_1px_3px_rgba(15,20,40,0.06)] backdrop-blur-md transition-[background,box-shadow,border-color] duration-150"
    >
      {/* Column header */}
      <div className="kanban-column-header relative z-[5] flex items-center gap-2 rounded-t-[14px] border-b border-[rgba(226,229,240,0.7)] bg-[rgba(255,255,255,0.70)] px-3.5 pb-2.5 pt-3 backdrop-blur-md">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="h-2 w-2 flex-shrink-0 rounded-full"
            style={{
              backgroundColor: stageColor,
              boxShadow: `0 0 0 3px color-mix(in srgb, ${stageColor} 22%, transparent)`,
            }}
          />
          <span className="truncate text-[12.5px] font-bold tracking-[-0.01em] text-[var(--text-primary)]">{stage.name}</span>
          <span className="min-w-[20px] flex-shrink-0 rounded-full bg-[rgba(0,0,0,0.06)] px-2 py-0.5 text-center text-xs font-semibold text-[var(--text-secondary)]">
            {deals.length}
          </span>
        </div>
        {totalValue > 0 && (
          <span className="ml-auto font-mono text-[12px] font-bold tracking-[-0.02em] text-[var(--text-secondary)]">
            {formatCurrency(totalValue)}
          </span>
        )}
        <button
          type="button"
          onClick={() => onAddDeal(stage.id)}
          className={`${totalValue > 0 ? '' : 'ml-auto'} flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-[var(--border-default)] bg-white/80 text-[var(--text-tertiary)] shadow-sm transition-[border-color,color,background,box-shadow] duration-150 hover:border-[var(--accent-medium)] hover:bg-[var(--accent-light)] hover:text-[var(--accent)] hover:shadow-[0_2px_8px_rgba(45,91,227,0.12)]`}
          title={`Add prospect to ${stage.name}`}
          aria-label={`Add prospect to ${stage.name}`}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Cards */}
      <div className="flex-1 min-h-[100px] pb-1">
        {deals.map((deal, index) => (
          <div key={deal.id as string} style={{ animationDelay: `${Math.min(index, 5) * 35}ms` }}>
            <DealCard deal={deal} stageColor={stageColor} onClick={() => onDealClick(deal)} />
          </div>
        ))}

        {deals.length === 0 && (
          <div className="mx-2 mt-2 flex h-16 items-center justify-center rounded-lg border border-dashed border-[var(--border-strong)] text-xs text-[var(--text-tertiary)]">
            No prospects in this stage
          </div>
        )}

        <button
          onClick={() => onAddDeal(stage.id)}
          className="mx-2 mt-2 flex h-[34px] w-[calc(100%-16px)] items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--border-strong)] bg-transparent text-sm font-medium text-[var(--text-tertiary)] transition-[border-color,color,background] duration-150 hover:border-[var(--accent-medium)] hover:bg-[var(--accent-light)] hover:text-[var(--accent)]"
        >
          <Plus className="h-[13px] w-[13px]" />
          Add prospect
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
  const { data, isLoading } = trpc.deals.byStage.useQuery({
    pipelineId,
    search: search || undefined,
    filters: extraFilters && extraFilters.length > 0 ? { conditions: extraFilters, logic: 'AND' } : undefined,
  });
  const dealsByStage = (data ?? {}) as Record<string, Record<string, unknown>[]>;

  if (isLoading) {
    return (
      <div className="flex h-full gap-3 overflow-x-auto bg-[var(--surface-page)] p-4">
        {stages.map((stage) => (
          <div key={stage.id} className="w-[282px] flex-shrink-0 rounded-[14px] border border-white/80 bg-[rgba(255,255,255,0.55)] p-2 shadow-[0_1px_3px_rgba(15,20,40,0.06)] backdrop-blur-md">
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
    <div className="flex h-full items-start gap-3 overflow-x-auto bg-[var(--surface-page)] p-4">
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
  );
}

'use client';

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, CheckSquare, Clock, User, Building2, Briefcase, Users } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { isDeliveryPipeline } from '@/lib/pipeline-utils';

interface DealCardProps {
  deal: Record<string, unknown>;
  onClick?: () => void;
  stageColor?: string | null;
}

const STAGE_COLORS: Record<string, string> = {
  'lead in': 'var(--stage-lead-in)',
  qualified: 'var(--stage-qualified)',
  discovery: 'var(--stage-discovery)',
  demo: 'var(--stage-demo)',
  scoping: 'var(--stage-scoping)',
  proposal: 'var(--stage-proposal)',
  negotiation: 'var(--stage-negotiation)',
  won: 'var(--stage-won)',
  lost: 'var(--stage-lost)',
};

function getStageColor(deal: Record<string, unknown>, explicitStageColor?: string | null) {
  if (explicitStageColor) return explicitStageColor;
  if (typeof deal.stageColor === 'string' && deal.stageColor) return deal.stageColor;
  const stageName = String(deal.stageName ?? '').toLowerCase();
  return STAGE_COLORS[stageName] ?? 'var(--color-stage-neutral)';
}

function getProbabilityTone(probability: number) {
  if (probability >= 70) {
    return {
      color: 'var(--color-success)',
      background: 'var(--color-success-bg)',
      borderColor: 'var(--color-status-contacted-border)',
    };
  }
  if (probability >= 40) {
    return {
      color: 'var(--color-warning)',
      background: 'var(--color-warning-bg)',
      borderColor: 'var(--color-status-nurturing-border)',
    };
  }
  return {
    color: 'var(--color-neutral)',
    background: 'var(--color-neutral-bg)',
    borderColor: 'var(--color-border)',
  };
}

function getProgressColor(deal: Record<string, unknown>): string {
  const progress = Number(deal.projectProgressPercent ?? 0);
  if (deal.isDelayed) return '#EF4444';
  if (progress >= 80) return '#16A34A';
  if (progress >= 40) return 'var(--accent)';
  return '#94A3B8';
}

function formatCardDate(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return formatDate(date);
}

function MetaRow({
  icon: Icon,
  text,
  muted = false,
}: {
  icon: React.ElementType;
  text: string;
  muted?: boolean;
}) {
  return (
    <div className={`flex min-w-0 items-center gap-1.5 text-sm ${muted ? 'text-[var(--color-text-3)]' : 'text-[var(--color-text-2)]'}`}>
      <Icon className="h-3 w-3 flex-shrink-0 text-[var(--color-text-3)]" strokeWidth={1.75} />
      <span className="truncate" title={text}>{text}</span>
    </div>
  );
}

export function DealCard({ deal, onClick, stageColor }: DealCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: deal.id as string,
  });

  const dndTransform = CSS.Transform.toString(transform);
  const style = {
    transform: isDragging
      ? [dndTransform, 'rotate(1.5deg)', 'scale(1.02)'].filter(Boolean).join(' ')
      : dndTransform,
    transition: transition ?? 'box-shadow 150ms ease, transform 150ms ease, border-color 150ms ease',
    opacity: isDragging ? 0.95 : 1,
    '--stage-color': getStageColor(deal, stageColor),
    borderLeftColor: getStageColor(deal, stageColor),
  } as React.CSSProperties & Record<'--stage-color', string>;

  const amount = deal.amount as number | string | null | undefined;
  const currency = String(deal.currency ?? 'INR');
  const probability = deal.probability as number | null | undefined;
  const expectedCloseDate = deal.expectedCloseDate as string | null | undefined;
  const primaryContactName = deal.primaryContactName as string | null | undefined;
  const companyName = deal.companyName as string | null | undefined;
  const services = Array.isArray(deal.services)
    ? deal.services.filter((service): service is string => typeof service === 'string' && service.trim().length > 0)
    : [];
  const servicesLabel = services.join(', ');
  const ownerName =
    (deal.ownerName as string | null | undefined) ??
    ([deal.ownerFirstName, deal.ownerLastName].filter(Boolean).join(' ').trim() || null);
  const isVelocitySlow = Boolean(deal.isVelocitySlow);
  const showProjectFields = isDeliveryPipeline(deal.pipelineType as string | null | undefined);
  const projectStartDate = formatCardDate(deal.projectStartDate);
  const projectEndDate = formatCardDate((deal.revisedEndDate as string | null | undefined) ?? deal.projectEndDate);
  const projectProgressPercent = Number(deal.projectProgressPercent ?? 0);
  const taskCount = Number(deal.taskCount ?? 0);
  const completedTaskCount = Number(deal.completedTaskCount ?? 0);
  const teamMemberCount = Number(deal.teamMemberCount ?? 0);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`deal-card group m-[6px_8px_0] cursor-grab overflow-hidden rounded-[10px] border border-l-[3px] border-[var(--border-subtle)] bg-[var(--surface-card)] px-[13px] py-3 shadow-[var(--shadow-card)] transition-[box-shadow,transform,border-color] duration-150 ease-[var(--ease-spring)] hover:-translate-y-0.5 hover:border-[var(--border-default)] hover:shadow-[var(--shadow-card-hover)] active:cursor-grabbing ${isDragging ? 'dragging' : ''}`}
    >
      <p
        className="mb-[9px] break-words text-[13.5px] font-semibold leading-[1.35] tracking-[-0.015em] text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent)]"
        title={String(deal.title ?? '')}
      >
        {deal.title as string}
      </p>

      {isVelocitySlow && (
        <div className="mb-2 inline-flex items-center gap-1 rounded-md border border-[var(--status-nurturing-border)] bg-[var(--status-nurturing-bg)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--status-nurturing-text)]">
          <Clock className="h-3 w-3" strokeWidth={1.75} />
          Slow
        </div>
      )}

      <div className="mb-[11px] flex items-baseline justify-between gap-3">
        {amount !== null && amount !== undefined && (
          <span className="break-all font-mono text-[17px] font-extrabold leading-none tracking-[-0.03em] text-[var(--text-primary)]">
            {formatCurrency(amount, currency)}
          </span>
        )}
        {probability !== null && probability !== undefined && (
          <span
            style={getProbabilityTone(probability)}
            className="ml-auto rounded-md border px-2 py-0.5 text-xs font-bold"
          >
            {probability}%
          </span>
        )}
      </div>

      <div className="mb-[9px] h-px bg-[var(--border-subtle)] opacity-70" />

      <div className="flex flex-col gap-1.5">
        {primaryContactName && <MetaRow icon={User} text={primaryContactName} />}
        {companyName && <MetaRow icon={Building2} text={companyName} />}
        {servicesLabel && <MetaRow icon={Briefcase} text={servicesLabel} />}
        {ownerName && <MetaRow icon={User} text={`Owner: ${ownerName}`} muted />}

        {expectedCloseDate && <MetaRow icon={Calendar} text={formatDate(new Date(expectedCloseDate))} muted />}
      </div>

      {showProjectFields && (
        <div className="mt-3 space-y-2 border-t border-[var(--border-subtle)] pt-2">
          {projectStartDate && projectEndDate && (
            <div>
              <div className="mb-1 flex items-center justify-between gap-2 text-[10.5px] text-[var(--text-tertiary)]">
                <span>{projectStartDate}</span>
                <span className={deal.isDelayed ? 'font-semibold text-red-600' : ''}>
                  {deal.isDelayed ? 'Delayed · ' : ''}{projectEndDate}
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-[var(--surface-subtle)]">
                <div
                  className="h-full rounded-full transition-[width] duration-500 ease-out"
                  style={{ width: `${Math.min(100, Math.max(0, projectProgressPercent))}%`, background: getProgressColor(deal) }}
                />
              </div>
              <span className="mt-1 block text-[10.5px] text-[var(--text-tertiary)]">
                {projectProgressPercent}% complete
              </span>
            </div>
          )}

          {taskCount > 0 && (
            <MetaRow icon={CheckSquare} text={`${completedTaskCount}/${taskCount} tasks`} muted />
          )}

          {teamMemberCount > 0 && (
            <MetaRow icon={Users} text={`${teamMemberCount} team member${teamMemberCount === 1 ? '' : 's'}`} muted />
          )}
        </div>
      )}
    </div>
  );
}

'use client';

import React from 'react';
import { Calendar, CheckSquare, Clock, User, Building2, Briefcase, Users } from 'lucide-react';
import { formatDate } from '@/lib/formatters';
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

function getDaysInStage(value: unknown): number | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
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
  const style = {
    '--stage-color': getStageColor(deal, stageColor),
    borderLeftColor: getStageColor(deal, stageColor),
  } as React.CSSProperties & Record<'--stage-color', string>;

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
  const daysInStage = getDaysInStage(deal.stageEnteredAt);
  const showStuckBadge = daysInStage !== null && daysInStage > 5 && String(deal.status ?? 'open') === 'open';

  return (
    <div
      style={style}
      onClick={onClick}
      className="deal-card group m-[6px_8px_0] cursor-pointer overflow-hidden rounded-[10px] border border-l-[3px] border-[var(--border-subtle)] bg-[var(--surface-card)] px-[13px] py-3 shadow-[var(--shadow-card)] transition-[box-shadow,transform,border-color] duration-150 ease-[var(--ease-spring)] hover:-translate-y-0.5 hover:border-[var(--border-default)] hover:shadow-[var(--shadow-card-hover)]"
    >
      <p
        className="mb-[9px] break-words text-[13.5px] font-semibold leading-[1.35] tracking-[-0.015em] text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent)]"
        title={String(deal.title ?? '')}
      >
        {deal.title as string}
      </p>

      {(isVelocitySlow || showStuckBadge) && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {isVelocitySlow && (
            <span className="inline-flex items-center gap-1 rounded-md border border-[var(--status-nurturing-border)] bg-[var(--status-nurturing-bg)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--status-nurturing-text)]">
              <Clock className="h-3 w-3" strokeWidth={1.75} />
              Slow
            </span>
          )}
          {showStuckBadge && (
            <span className="inline-flex items-center gap-1 rounded-md border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700">
              <Clock className="h-3 w-3" strokeWidth={1.75} />
              Stuck {daysInStage}d
            </span>
          )}
        </div>
      )}

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

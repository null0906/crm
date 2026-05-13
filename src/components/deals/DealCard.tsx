'use client';

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, Clock, User, Building2, Briefcase } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/formatters';

interface DealCardProps {
  deal: Record<string, unknown>;
  onClick?: () => void;
  stageColor?: string | null;
}

const STAGE_COLORS: Record<string, string> = {
  'lead in': 'var(--color-stage-neutral)',
  qualified: 'var(--color-status-new-text)',
  discovery: 'var(--color-purple)',
  demo: 'var(--color-warning)',
  scoping: 'var(--color-orange-500)',
  proposal: 'var(--color-pink-500)',
  negotiation: 'var(--color-danger)',
  won: 'var(--color-success)',
  lost: 'var(--color-neutral)',
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
    borderLeftColor: getStageColor(deal, stageColor),
  };

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

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`deal-card group cursor-grab overflow-hidden rounded-[10px] border border-l-[3px] border-[var(--color-border-ui)] bg-[var(--color-surface)] px-3.5 py-3 shadow-sm transition-[box-shadow,transform,border-color] duration-150 hover:-translate-y-px hover:border-[var(--color-border-strong)] hover:shadow-[0_4px_12px_rgba(17,19,24,0.10),_0_2px_4px_rgba(17,19,24,0.06)] active:cursor-grabbing ${isDragging ? 'dragging' : ''}`}
    >
      <p
        className="mb-2.5 break-words text-[13.5px] font-semibold leading-snug tracking-[-0.01em] text-[var(--color-text-1)] transition-colors group-hover:text-[var(--color-accent)]"
        title={String(deal.title ?? '')}
      >
        {deal.title as string}
      </p>

      {isVelocitySlow && (
        <div className="mb-2 inline-flex items-center gap-1 rounded-md border border-[var(--color-status-nurturing-border)] bg-[var(--color-warning-bg)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-warning)]">
          <Clock className="h-3 w-3" strokeWidth={1.75} />
          Slow
        </div>
      )}

      <div className="mb-2.5 flex items-center justify-between gap-3">
        {amount !== null && amount !== undefined && (
          <span className="break-all font-mono text-lg font-bold tracking-[-0.02em] text-[var(--color-text-1)]">
            {formatCurrency(amount, currency)}
          </span>
        )}
        {probability !== null && probability !== undefined && (
          <span
            style={getProbabilityTone(probability)}
            className="ml-auto rounded border px-2 py-0.5 text-xs font-semibold"
          >
            {probability}%
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        {primaryContactName && <MetaRow icon={User} text={primaryContactName} />}
        {companyName && <MetaRow icon={Building2} text={companyName} />}
        {servicesLabel && <MetaRow icon={Briefcase} text={servicesLabel} />}
        {ownerName && <MetaRow icon={User} text={`Owner: ${ownerName}`} muted />}

        {expectedCloseDate && <MetaRow icon={Calendar} text={formatDate(new Date(expectedCloseDate))} muted />}
      </div>
    </div>
  );
}

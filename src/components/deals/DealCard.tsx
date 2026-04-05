'use client';

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, DollarSign, User, Building2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate } from '@/lib/formatters';

interface DealCardProps {
  deal: Record<string, unknown>;
  onClick?: () => void;
}

export function DealCard({ deal, onClick }: DealCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: deal.id as string,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const amount = deal.amount as number | null | undefined;
  const probability = deal.probability as number | null | undefined;
  const expectedCloseDate = deal.expectedCloseDate as string | null | undefined;
  const primaryContactName = deal.primaryContactName as string | null | undefined;
  const companyName = deal.companyName as string | null | undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className="bg-white border border-slate-200/80 rounded-xl p-3 shadow-[0_1px_3px_rgba(16,24,40,0.06),_0_1px_2px_rgba(16,24,40,0.04)] hover:shadow-[0_4px_12px_rgba(16,24,40,0.08),_0_2px_4px_rgba(16,24,40,0.04)] hover:border-slate-300 transition-all duration-150 cursor-pointer group"
    >
      <p className="text-[13px] font-medium text-slate-800 leading-snug mb-2.5 group-hover:text-blue-600 transition-colors">
        {deal.title as string}
      </p>

      <div className="space-y-1">
        {amount !== null && amount !== undefined && (
          <div className="flex items-center gap-1.5">
            <DollarSign className="w-3 h-3 text-slate-300 flex-shrink-0" />
            <span className="text-[12px] font-semibold text-slate-700 font-data">{formatCurrency(amount)}</span>
            {probability !== null && probability !== undefined && (
              <Badge variant="secondary" className="ml-auto text-[10px]">{probability}%</Badge>
            )}
          </div>
        )}

        {primaryContactName && (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <User className="w-3 h-3 flex-shrink-0" strokeWidth={1.75} />
            <span className="truncate">{primaryContactName}</span>
          </div>
        )}

        {companyName && (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Building2 className="w-3 h-3 flex-shrink-0" strokeWidth={1.75} />
            <span className="truncate">{companyName}</span>
          </div>
        )}

        {expectedCloseDate && (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Calendar className="w-3 h-3 flex-shrink-0" strokeWidth={1.75} />
            <span>{formatDate(new Date(expectedCloseDate))}</span>
          </div>
        )}
      </div>
    </div>
  );
}

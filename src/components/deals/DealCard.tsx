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
      className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
    >
      <p className="text-sm font-medium text-slate-900 leading-snug mb-2 group-hover:text-blue-600 transition-colors">
        {deal.title as string}
      </p>

      <div className="space-y-1.5">
        {amount !== null && amount !== undefined && (
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <DollarSign className="w-3 h-3 text-slate-400 flex-shrink-0" />
            <span className="font-medium">{formatCurrency(amount)}</span>
            {probability !== null && probability !== undefined && (
              <Badge variant="outline" className="text-xs ml-auto">{probability}%</Badge>
            )}
          </div>
        )}

        {primaryContactName && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <User className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{primaryContactName}</span>
          </div>
        )}

        {companyName && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Building2 className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{companyName}</span>
          </div>
        )}

        {expectedCloseDate && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Calendar className="w-3 h-3 flex-shrink-0" />
            <span>{formatDate(new Date(expectedCloseDate))}</span>
          </div>
        )}
      </div>
    </div>
  );
}

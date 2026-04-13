'use client';

import React, { useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';
import { ChevronUp, ChevronDown, ChevronsUpDown, Trash2, ExternalLink } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatCurrency, formatDate, formatRelative } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface Deal {
  id: string;
  title: string;
  amount: string | null;
  currency: string;
  status: string;
  probability: number | null;
  expectedCloseDate: string | null;
  primaryContactName: string | null;
  companyName: string | null;
  ownerName: string | null;
  stageName: string | null;
  stageColor: string | null;
  createdAt: string;
}

type FilterOp = 'eq' | 'neq' | 'gte' | 'lte' | 'gt' | 'lt' | 'contains' | 'in' | 'not_in' | 'is_empty' | 'is_not_empty';

interface FilterCondition {
  field: string;
  operator: FilterOp;
  value: string;
}

interface DealTableProps {
  pipelineId: string;
  onDealClick: (dealId: string) => void;
  extraFilters?: FilterCondition[];
}

const columnHelper = createColumnHelper<Deal>();

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-50 text-blue-700 border border-blue-200',
  won: 'bg-green-50 text-green-700 border border-green-200',
  lost: 'bg-red-50 text-red-700 border border-red-200',
};

export function DealTable({ pipelineId, onDealClick, extraFilters }: DealTableProps) {
  const utils = trpc.useUtils();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const limit = 25;

  const { data, isLoading } = trpc.deals.list.useQuery({
    pipelineId,
    pagination: { limit, cursor },
    sort: sorting[0]
      ? { field: sorting[0].id, direction: sorting[0].desc ? 'desc' : 'asc' }
      : undefined,
    filters: extraFilters && extraFilters.length > 0
      ? { conditions: extraFilters, logic: 'AND' }
      : undefined,
  });

  const deleteDeal = trpc.deals.delete.useMutation({
    onSuccess: () => {
      toast.success('Deal deleted');
      void utils.deals.list.invalidate();
      void utils.deals.byStage.invalidate({ pipelineId });
    },
    onError: (err) => toast.error('Failed to delete deal', { description: err.message }),
  });

  const items: Deal[] = ((data as { items?: unknown[] })?.items ?? []) as Deal[];
  const hasMore: boolean = (data as { hasMore?: boolean })?.hasMore ?? false;
  const nextCursor: string | null = (data as { nextCursor?: string | null })?.nextCursor ?? null;

  const columns = [
    columnHelper.accessor('title', {
      header: 'Deal',
      cell: (info) => (
        <button
          onClick={() => onDealClick(info.row.original.id)}
          className="text-left font-medium text-slate-900 hover:text-blue-600 transition-colors flex items-center gap-1.5 group"
        >
          {info.getValue()}
          <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      ),
    }),
    columnHelper.accessor('stageName', {
      header: 'Stage',
      cell: (info) => {
        const color = info.row.original.stageColor ?? '#6366f1';
        return (
          <span className="flex items-center gap-1.5 text-sm text-slate-700">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
            {info.getValue() ?? '—'}
          </span>
        );
      },
    }),
    columnHelper.accessor('amount', {
      header: 'Value',
      cell: (info) => (
        <span className="font-medium text-slate-900">
          {formatCurrency(info.getValue(), info.row.original.currency)}
        </span>
      ),
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      cell: (info) => {
        const status = info.getValue();
        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${STATUS_COLORS[status] ?? 'bg-slate-100 text-slate-700'}`}>
            {status}
          </span>
        );
      },
    }),
    columnHelper.accessor('probability', {
      header: 'Prob.',
      cell: (info) => {
        const val = info.getValue();
        if (val === null || val === undefined) return <span className="text-slate-400">—</span>;
        return (
          <div className="flex items-center gap-2">
            <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full"
                style={{ width: `${val}%` }}
              />
            </div>
            <span className="text-xs text-slate-600">{val}%</span>
          </div>
        );
      },
    }),
    columnHelper.accessor('primaryContactName', {
      header: 'Contact',
      cell: (info) => <span className="text-slate-700">{info.getValue() ?? '—'}</span>,
    }),
    columnHelper.accessor('companyName', {
      header: 'Company',
      cell: (info) => <span className="text-slate-700">{info.getValue() ?? '—'}</span>,
    }),
    columnHelper.accessor('ownerName', {
      header: 'Owner',
      cell: (info) => <span className="text-slate-700">{info.getValue() ?? '—'}</span>,
    }),
    columnHelper.accessor('expectedCloseDate', {
      header: 'Close Date',
      cell: (info) => {
        const val = info.getValue();
        if (!val) return <span className="text-slate-400">—</span>;
        const date = new Date(val);
        const isOverdue = date < new Date() && info.row.original.status === 'open';
        return (
          <span className={`text-sm ${isOverdue ? 'text-red-600 font-medium' : 'text-slate-700'}`}>
            {formatDate(val)}
          </span>
        );
      },
    }),
    columnHelper.accessor('createdAt', {
      header: 'Created',
      cell: (info) => <span className="text-slate-500 text-sm">{formatRelative(info.getValue())}</span>,
    }),
    columnHelper.display({
      id: 'actions',
      header: '',
      cell: (info) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirm('Delete this deal?')) {
              deleteDeal.mutate({ id: info.row.original.id });
            }
          }}
          className="opacity-0 group-hover/row:opacity-100 w-7 h-7 flex items-center justify-center rounded hover:bg-red-50 text-red-400 transition-all"
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      ),
    }),
  ];

  const table = useReactTable({
    data: items,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualSorting: true,
    manualPagination: true,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="text-sm text-slate-400">Loading deals...</div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="text-sm text-slate-400">No deals in this pipeline yet.</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 border-b border-slate-200">
              {table.getFlatHeaders().map((header) => (
                <th
                  key={header.id}
                  className="text-left px-4 py-2.5 font-medium text-slate-600 whitespace-nowrap select-none"
                >
                  {header.isPlaceholder ? null : (
                    <button
                      className={`flex items-center gap-1 ${header.column.getCanSort() ? 'cursor-pointer hover:text-slate-900' : ''}`}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && (
                        header.column.getIsSorted() === 'asc' ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : header.column.getIsSorted() === 'desc' ? (
                          <ChevronDown className="w-3 h-3" />
                        ) : (
                          <ChevronsUpDown className="w-3 h-3 opacity-30" />
                        )
                      )}
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="group/row hover:bg-slate-50 transition-colors"
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {(cursor || hasMore) && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-white flex-shrink-0">
          <p className="text-sm text-slate-500">
            {items.length} deal{items.length !== 1 ? 's' : ''} shown
          </p>
          <div className="flex items-center gap-2">
            {cursor && (
              <Button variant="outline" size="sm" onClick={() => setCursor(undefined)}>
                First page
              </Button>
            )}
            {hasMore && nextCursor && (
              <Button variant="outline" size="sm" onClick={() => setCursor(nextCursor)}>
                Next page
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

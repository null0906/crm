'use client';

import React, { useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type RowSelectionState,
} from '@tanstack/react-table';
import { ChevronUp, ChevronDown, ChevronsUpDown, Trash2, ExternalLink } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatCurrency, formatDate, formatRelative } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { TableSkeleton } from '@/components/shared/LoadingSkeleton';
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

type FilterOp = 'eq' | 'neq' | 'gte' | 'lte' | 'gt' | 'lt' | 'contains' | 'contains_any' | 'in' | 'not_in' | 'is_empty' | 'is_not_empty';

interface FilterCondition {
  field: string;
  operator: FilterOp;
  value: unknown;
}

interface DealTableProps {
  pipelineId: string;
  onDealClick: (dealId: string) => void;
  search?: string;
  extraFilters?: FilterCondition[];
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: React.Dispatch<React.SetStateAction<RowSelectionState>>;
}

const columnHelper = createColumnHelper<Deal>();

const STATUS_STYLES: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  open: {
    bg: 'var(--color-status-new-bg)',
    border: 'var(--color-status-new-border)',
    text: 'var(--color-status-new-text)',
    dot: 'var(--color-status-new-dot)',
  },
  won: {
    bg: 'var(--color-success-bg)',
    border: 'var(--color-status-contacted-border)',
    text: 'var(--color-success)',
    dot: 'var(--color-success)',
  },
  lost: {
    bg: 'var(--color-danger-bg)',
    border: 'var(--color-status-unqualified-border)',
    text: 'var(--color-danger)',
    dot: 'var(--color-danger)',
  },
};

function EmptyCell() {
  return <span className="select-none font-mono text-base text-[var(--color-border-strong)]">—</span>;
}

export function DealTable({ pipelineId, onDealClick, search, extraFilters, rowSelection, onRowSelectionChange }: DealTableProps) {
  const utils = trpc.useUtils();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const limit = 25;

  // Reset to page 1 when pipeline, filters, or sort changes
  React.useEffect(() => { setCursor(undefined); }, [pipelineId, sorting, search, extraFilters]);

  const { data, isLoading } = trpc.deals.list.useQuery({
    pipelineId,
    search: search || undefined,
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
    columnHelper.display({
      id: 'select',
      header: ({ table }) => (
        <input
          type="checkbox"
          checked={table.getIsAllRowsSelected()}
          onChange={table.getToggleAllRowsSelectedHandler()}
          className="h-3.5 w-3.5 rounded-[3px] border-[var(--color-border-strong)] accent-[var(--color-accent)]"
        />
      ),
      cell: (info) => (
        <input
          type="checkbox"
          checked={info.row.getIsSelected()}
          onChange={info.row.getToggleSelectedHandler()}
          onClick={(e) => e.stopPropagation()}
          className="h-3.5 w-3.5 rounded-[3px] border-[var(--color-border-strong)] accent-[var(--color-accent)]"
        />
      ),
    }),
    columnHelper.accessor('title', {
      header: 'Deal',
      cell: (info) => (
        <button
          onClick={() => onDealClick(info.row.original.id)}
          className="group flex items-center gap-1.5 text-left text-[13.5px] font-semibold text-[var(--color-text-1)] transition-colors hover:text-[var(--color-accent)]"
        >
          {info.getValue()}
          <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      ),
    }),
    columnHelper.accessor('stageName', {
      header: 'Stage',
      cell: (info) => {
        const color = info.row.original.stageColor ?? 'var(--color-stage-neutral)';
        return (
          <span className="flex items-center gap-1.5 text-sm text-[var(--color-text-2)]">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
            {info.getValue() ?? '—'}
          </span>
        );
      },
    }),
    columnHelper.accessor('amount', {
      header: 'Value',
      cell: (info) => (
        <span className="font-mono text-base font-semibold text-[var(--color-text-1)]">
          {formatCurrency(info.getValue(), info.row.original.currency)}
        </span>
      ),
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      cell: (info) => {
        const status = info.getValue();
        const style = STATUS_STYLES[status] ?? STATUS_STYLES.open!;
        return (
          <span
            style={{ background: style.bg, borderColor: style.border, color: style.text }}
            className="inline-flex items-center gap-[5px] rounded-[5px] border px-2 py-[3px] text-[11.5px] font-semibold capitalize tracking-[0.01em]"
          >
            <span style={{ background: style.dot }} className="h-[5px] w-[5px] rounded-full" />
            {status}
          </span>
        );
      },
    }),
    columnHelper.accessor('probability', {
      header: 'Prob.',
      cell: (info) => {
        const val = info.getValue();
        if (val === null || val === undefined) return <EmptyCell />;
        return (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-12 overflow-hidden rounded-full bg-[var(--color-avatar-bg)]">
              <div
                className="h-full rounded-full bg-[var(--color-accent)]"
                style={{ width: `${val}%` }}
              />
            </div>
            <span className="text-xs text-[var(--color-text-2)]">{val}%</span>
          </div>
        );
      },
    }),
    columnHelper.accessor('primaryContactName', {
      header: 'Contact',
      cell: (info) => info.getValue() ? <span className="text-[var(--color-text-2)]">{info.getValue()}</span> : <EmptyCell />,
    }),
    columnHelper.accessor('companyName', {
      header: 'Company',
      cell: (info) => info.getValue() ? <span className="font-medium text-[var(--color-company)]">{info.getValue()}</span> : <EmptyCell />,
    }),
    columnHelper.accessor('ownerName', {
      header: 'Owner',
      cell: (info) => info.getValue() ? <span className="text-[var(--color-text-2)]">{info.getValue()}</span> : <EmptyCell />,
    }),
    columnHelper.accessor('expectedCloseDate', {
      header: 'Close Date',
      cell: (info) => {
        const val = info.getValue();
        if (!val) return <EmptyCell />;
        const date = new Date(val);
        const isOverdue = date < new Date() && info.row.original.status === 'open';
        return (
          <span className={`font-mono text-sm ${isOverdue ? 'font-medium text-[var(--color-danger)]' : 'text-[var(--color-text-2)]'}`}>
            {formatDate(val)}
          </span>
        );
      },
    }),
    columnHelper.accessor('createdAt', {
      header: 'Created',
      cell: (info) => <span className="font-mono text-sm text-[var(--color-text-2)]">{formatRelative(info.getValue())}</span>,
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
          className="flex h-7 w-7 items-center justify-center rounded text-[var(--color-text-3)] opacity-0 transition-all hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)] group-hover/row:opacity-100"
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
    state: { sorting, rowSelection: rowSelection ?? {} },
    getRowId: (row) => row.id,
    onSortingChange: setSorting,
    onRowSelectionChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualSorting: true,
    manualPagination: true,
  });

  if (isLoading) {
    return (
      <TableSkeleton rows={8} cols={8} />
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="text-sm text-[var(--color-text-3)]">No deals in this pipeline yet.</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="border-b-2 border-[var(--color-header-border)] bg-linear-to-b from-[var(--color-header-start)] to-[var(--color-header-end)]">
              {table.getFlatHeaders().map((header) => (
                <th
                  key={header.id}
                  className="h-[38px] whitespace-nowrap px-3.5 text-left text-[10.5px] font-bold uppercase tracking-[0.05em] text-[var(--color-header-text)] select-none"
                >
                  {header.isPlaceholder ? null : (
                    <button
                      className={`flex items-center gap-1 ${header.column.getCanSort() ? 'cursor-pointer hover:text-[var(--color-text-1)]' : ''}`}
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
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="group/row h-11 border-b border-[var(--color-row-border)] bg-[var(--color-surface)] transition-[background,box-shadow] duration-100 hover:bg-[var(--color-row-hover)] hover:shadow-[inset_3px_0_0_var(--color-accent)]"
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="h-11 whitespace-nowrap px-3.5 align-middle text-base">
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
        <div className="flex flex-shrink-0 items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
          <p className="text-sm text-[var(--color-text-3)]">
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

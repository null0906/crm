'use client';

import React, { useState } from 'react';
import {
  useReactTable, getCoreRowModel, flexRender,
  type ColumnDef,
} from '@tanstack/react-table';
import { Plus, Search, Building2, Pencil, Trash2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useDebounce } from '@/hooks/useDebounce';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { TableSkeleton } from '@/components/shared/LoadingSkeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { SlideOverPanel } from '@/components/shared/SlideOverPanel';
import { CompanyForm } from '@/components/companies/CompanyForm';
import { CompanyTypeBadge } from '@/components/companies/CompanyTypeBadge';
import { CompanyDetail } from '@/components/companies/CompanyDetail';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { formatDate } from '@/lib/formatters';
import { PAGE_SIZES, COMPANY_TYPES } from '@/lib/constants';
import { toast } from 'sonner';

type Company = Record<string, unknown>;

export default function CompaniesPage() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [ownerFilter, setOwnerFilter] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [pageSize, setPageSize] = useState(50);
  const [cursor, setCursor] = useState<string | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [editCompany, setEditCompany] = useState<Company | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string>('');

  const debouncedSearch = useDebounce(search, 300);
  const utils = trpc.useUtils();

  const { data: usersData } = trpc.users.list.useQuery();
  const users = usersData ?? [];

  // Reset cursor whenever any filter/search changes
  React.useEffect(() => { setCursor(undefined); }, [debouncedSearch, typeFilter, ownerFilter, dateFrom, dateTo, pageSize]);

  type FilterOp = 'eq' | 'gte' | 'lte';
  const filterConditions: Array<{ field: string; operator: FilterOp; value: string }> = [];
  if (typeFilter) filterConditions.push({ field: 'companyType', operator: 'eq', value: typeFilter });
  if (ownerFilter) filterConditions.push({ field: 'ownerId', operator: 'eq', value: ownerFilter });
  if (dateFrom) filterConditions.push({ field: 'createdAt', operator: 'gte', value: dateFrom });
  if (dateTo) filterConditions.push({ field: 'createdAt', operator: 'lte', value: dateTo });

  const deleteCompany = trpc.companies.delete.useMutation({
    onSuccess: () => {
      toast.success('Company deleted');
      void utils.companies.list.invalidate();
      setDeleteOpen(false);
      setDeleteId('');
    },
    onError: (e) => toast.error('Failed to delete', { description: e.message }),
  });

  const { data, isLoading } = trpc.companies.list.useQuery({
    search: debouncedSearch || undefined,
    filters: filterConditions.length > 0
      ? { conditions: filterConditions, logic: 'AND' }
      : undefined,
    pagination: { cursor, limit: pageSize },
  });

  const companies: Company[] = (data?.items ?? []) as Company[];

  const columns: ColumnDef<Company>[] = [
    {
      accessorKey: 'name',
      header: 'Company',
      cell: ({ row }) => {
        const c = row.original;
        const name = c.name as string;
        return (
          <div className="flex items-center gap-2">
            <Avatar className="w-7 h-7 flex-shrink-0">
              <AvatarFallback className="text-xs bg-indigo-100 text-indigo-700 font-semibold">
                {name.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <button
              className="text-sm font-medium text-blue-600 hover:underline text-left"
              onClick={(e) => { e.stopPropagation(); setSelectedCompany(c); }}
            >
              {name}
            </button>
          </div>
        );
      },
    },
    {
      accessorKey: 'companyType',
      header: 'Type',
      cell: ({ row }) => <CompanyTypeBadge type={String(row.original.companyType ?? 'prospect')} />,
    },
    {
      accessorKey: 'industry',
      header: 'Industry',
      cell: ({ row }) => <span className="text-sm text-slate-600">{String(row.original.industry ?? '—')}</span>,
    },
    {
      accessorKey: 'companySize',
      header: 'Size',
      cell: ({ row }) => <span className="text-sm text-slate-600">{String(row.original.companySize ?? '—')}</span>,
    },
    {
      accessorKey: 'domain',
      header: 'Domain',
      cell: ({ row }) => <span className="text-sm text-slate-600 font-mono">{String(row.original.domain ?? '—')}</span>,
    },
    {
      accessorKey: 'annualRevenueRange',
      header: 'Revenue Range',
      cell: ({ row }) => <span className="text-sm text-slate-600">{String(row.original.annualRevenueRange ?? '—')}</span>,
    },
    {
      accessorKey: 'ownerFirstName',
      header: 'Owner',
      cell: ({ row }) => {
        const first = row.original.ownerFirstName as string | undefined;
        if (!first) return <span className="text-sm text-slate-400">—</span>;
        return <span className="text-sm text-slate-600">{first}</span>;
      },
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      cell: ({ row }) => <span className="text-sm text-slate-500">{formatDate(row.original.createdAt as Date)}</span>,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); setEditCompany(row.original); }}
            className="p-1 rounded hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"
            title="Edit"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDeleteId(String(row.original.id));
              setDeleteOpen(true);
            }}
            className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
      size: 60,
    },
  ];

  const table = useReactTable({
    data: companies,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white">
        <div>
          <h1 className="text-[15px] font-semibold text-slate-900 tracking-tight">Companies</h1>
          <p className="text-xs text-slate-400 mt-0.5">{data ? `${data.total ?? data.items.length} companies` : 'Loading...'}</p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4" />
          Add Company
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-6 py-2.5 bg-white border-b border-slate-100">
        <div className="relative flex-1 max-w-[280px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <Input
            placeholder="Search companies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-[13px]"
          />
        </div>

        <div className="flex items-center gap-1">
          <button
            className={`text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors ${!typeFilter ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'}`}
            onClick={() => setTypeFilter('')}
          >
            All
          </button>
          {COMPANY_TYPES.map((t) => (
            <button
              key={t.value}
              className={`text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors ${typeFilter === t.value ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'}`}
              onClick={() => setTypeFilter(typeFilter === t.value ? '' : t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Owner filter */}
        <select
          value={ownerFilter}
          onChange={(e) => setOwnerFilter(e.target.value)}
          className="text-[11px] border border-slate-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-600"
        >
          <option value="">All owners</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
          ))}
        </select>

        {/* Date range */}
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="text-[11px] border border-slate-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-600"
            title="Created from"
          />
          <span className="text-xs text-slate-400">–</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="text-[11px] border border-slate-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-600"
            title="Created to"
          />
        </div>

        {(ownerFilter || dateFrom || dateTo) && (
          <button
            onClick={() => { setOwnerFilter(''); setDateFrom(''); setDateTo(''); }}
            className="text-[11px] text-slate-400 hover:text-slate-600"
          >
            Clear
          </button>
        )}

        <div className="ml-auto flex items-center gap-1">
          <span className="text-xs text-slate-500">Show</span>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="text-xs border border-slate-200 rounded px-1 py-0.5 bg-white"
          >
            {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <TableSkeleton rows={10} cols={7} />
        ) : companies.length === 0 ? (
          <EmptyState
            title="No companies found"
            description={search ? `No companies matching "${search}"` : 'Add your first company to get started.'}
            action={{ label: 'Add Company', onClick: () => setCreateOpen(true) }}
            icon={<Building2 className="w-8 h-8" />}
          />
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50/80 border-b border-slate-100 sticky top-0 z-10">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th key={header.id} className="px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-[0.06em] whitespace-nowrap">
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-slate-100 hover:bg-blue-50/40 cursor-pointer transition-colors duration-100 group"
                  onClick={() => setSelectedCompany(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {data && (
        <div className="flex items-center justify-between px-6 py-3 bg-white border-t border-slate-200">
          <span className="text-xs text-slate-500">Showing {companies.length} companies</span>
          <div className="flex items-center gap-2">
            {cursor && (
              <Button size="sm" variant="outline" onClick={() => setCursor(undefined)}>First page</Button>
            )}
            {data.hasMore && (
              <Button size="sm" variant="outline" onClick={() => setCursor(data.nextCursor ?? undefined)}>Next page</Button>
            )}
          </div>
        </div>
      )}

      {/* Create */}
      <SlideOverPanel open={createOpen} onClose={() => setCreateOpen(false)} title="Add Company" width="md">
        <div className="p-6">
          <CompanyForm
            onSuccess={() => setCreateOpen(false)}
            onCancel={() => setCreateOpen(false)}
          />
        </div>
      </SlideOverPanel>

      {/* Detail */}
      {selectedCompany && (
        <CompanyDetail
          companyId={String(selectedCompany.id)}
          open={!!selectedCompany}
          onClose={() => setSelectedCompany(null)}
          onDeleted={() => setSelectedCompany(null)}
        />
      )}

      {/* Edit panel (from row action) */}
      {editCompany && (
        <SlideOverPanel open={!!editCompany} onClose={() => setEditCompany(null)} title="Edit Company" width="md">
          <div className="p-6">
            <CompanyForm
              mode="edit"
              companyId={String(editCompany.id)}
              defaultValues={{
                name: String(editCompany.name ?? ''),
                industry: String(editCompany.industry ?? ''),
                companyType: (editCompany.companyType as 'prospect' | 'customer' | 'partner' | 'vendor' | 'competitor' | 'other') ?? 'prospect',
                companySize: (editCompany.companySize as '1-10' | '11-50' | '51-200' | '201-500' | '501-1000' | '1001-5000' | '5000+') ?? undefined,
                domain: String(editCompany.domain ?? ''),
                phone: String(editCompany.phone ?? ''),
                city: String(editCompany.city ?? ''),
                country: String(editCompany.country ?? ''),
                ownerId: String(editCompany.ownerId ?? ''),
                status: (editCompany.status as 'active' | 'inactive' | 'churned' | 'archived') ?? 'active',
              }}
              onSuccess={() => { setEditCompany(null); void utils.companies.list.invalidate(); }}
              onCancel={() => setEditCompany(null)}
            />
          </div>
        </SlideOverPanel>
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(open) => { setDeleteOpen(open); if (!open) setDeleteId(''); }}
        title="Delete company?"
        description="This action cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={deleteCompany.isPending}
        onConfirm={() => deleteCompany.mutate({ id: deleteId })}
      />
    </div>
  );
}

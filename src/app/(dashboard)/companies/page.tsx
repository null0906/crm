'use client';

import React, { useState } from 'react';
import {
  useReactTable, getCoreRowModel, flexRender,
  type ColumnDef, type RowSelectionState, type VisibilityState,
} from '@tanstack/react-table';
import { Plus, Search, Building2, Pencil, Trash2, ChevronDown } from 'lucide-react';
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
import { TagInput } from '@/components/tags/TagInput';
import { CompanyDetail } from '@/components/companies/CompanyDetail';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { formatDate } from '@/lib/formatters';
import { PAGE_SIZES, COMPANY_SIZES, COMPANY_STATUSES, COMPANY_TYPES } from '@/lib/constants';
import { toast } from 'sonner';
import { ColumnVisibilityMenu } from '@/components/shared/ColumnVisibilityMenu';

type Company = Record<string, unknown>;

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export default function CompaniesPage() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [ownerFilter, setOwnerFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [industryFilter, setIndustryFilter] = useState<string>('');
  const [sizeFilter, setSizeFilter] = useState<string>('');
  const [locationFilter, setLocationFilter] = useState<string>('');
  const [cityFilter, setCityFilter] = useState<string>('');
  const [countryFilter, setCountryFilter] = useState<string>('');
  const [filterTags, setFilterTags] = useState<{ id: string; name: string; color: string }[]>([]);
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [pageSize, setPageSize] = useState(50);
  const [cursor, setCursor] = useState<string | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [editCompany, setEditCompany] = useState<Company | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string>('');
  const [bulkOwnerId, setBulkOwnerId] = useState('');
  const [bulkCompanyType, setBulkCompanyType] = useState('');
  const [bulkTagsToAdd, setBulkTagsToAdd] = useState<{ id: string; name: string; color: string }[]>([]);

  const debouncedSearch = useDebounce(search, 300);
  const utils = trpc.useUtils();

  const { data: usersData } = trpc.users.list.useQuery();
  const users = usersData ?? [];

  // Reset cursor whenever any filter/search changes
  React.useEffect(() => {
    setCursor(undefined);
  }, [debouncedSearch, typeFilter, ownerFilter, statusFilter, industryFilter, sizeFilter, locationFilter, cityFilter, countryFilter, filterTags, dateFrom, dateTo, pageSize]);

  type FilterOp = 'eq' | 'gte' | 'lte' | 'contains' | 'contains_any';
  const filterConditions: Array<{ field: string; operator: FilterOp; value: unknown }> = [];
  if (typeFilter) filterConditions.push({ field: 'companyType', operator: 'eq', value: typeFilter });
  if (ownerFilter) filterConditions.push({ field: 'ownerId', operator: 'eq', value: ownerFilter });
  if (statusFilter) filterConditions.push({ field: 'status', operator: 'eq', value: statusFilter });
  if (industryFilter) filterConditions.push({ field: 'industry', operator: 'contains', value: industryFilter });
  if (sizeFilter) filterConditions.push({ field: 'companySize', operator: 'eq', value: sizeFilter });
  if (locationFilter) filterConditions.push({ field: 'location', operator: 'contains', value: locationFilter });
  if (cityFilter) filterConditions.push({ field: 'city', operator: 'contains', value: cityFilter });
  if (countryFilter) filterConditions.push({ field: 'country', operator: 'contains', value: countryFilter });
  if (filterTags.length > 0) filterConditions.push({ field: 'tags', operator: 'contains_any', value: filterTags.map((tag) => tag.id) });
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

  const bulkUpdate = trpc.companies.bulkUpdate.useMutation({
    onSuccess: ({ updated }) => {
      toast.success(`${updated} companies updated`);
      setBulkOwnerId('');
      setBulkCompanyType('');
      setBulkTagsToAdd([]);
      setRowSelection({});
      void utils.companies.list.invalidate();
    },
    onError: (e) => toast.error('Failed to update companies', { description: e.message }),
  });

  const { data, isLoading } = trpc.companies.list.useQuery({
    search: debouncedSearch || undefined,
    filters: filterConditions.length > 0
      ? { conditions: filterConditions, logic: 'AND' }
      : undefined,
    pagination: { cursor, limit: pageSize },
  });

  const companies: Company[] = (data?.items ?? []) as Company[];
  const selectedIds = Object.keys(rowSelection).filter((k) => rowSelection[k]);
  const selectedCompanyId = isUuid(selectedCompany?.id) ? selectedCompany.id : null;

  const openCompanyDetail = (company: Company) => {
    if (!isUuid(company.id)) {
      toast.error('Could not open company details', {
        description: 'This row is missing a valid company ID. Please refresh and try again.',
      });
      return;
    }

    setSelectedCompany(company);
  };

  const columns: ColumnDef<Company>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <input
          type="checkbox"
          checked={table.getIsAllRowsSelected()}
          onChange={table.getToggleAllRowsSelectedHandler()}
          className="rounded border-slate-300"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
          onClick={(e) => e.stopPropagation()}
          className="rounded border-slate-300"
        />
      ),
      size: 40,
      enableHiding: false,
    },
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
              onClick={(e) => { e.stopPropagation(); openCompanyDetail(c); }}
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
      accessorKey: 'city',
      header: 'City',
      cell: ({ row }) => <span className="text-sm text-slate-600">{String(row.original.city ?? '—')}</span>,
    },
    {
      accessorKey: 'country',
      header: 'Country',
      cell: ({ row }) => <span className="text-sm text-slate-600">{String(row.original.country ?? '—')}</span>,
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
      enableHiding: false,
    },
  ];

  const table = useReactTable({
    data: companies,
    columns,
    state: { rowSelection, columnVisibility },
    getRowId: (row) => String(row.id),
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="flex h-full flex-col bg-[var(--surface-page)]">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-slate-100 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between md:px-6">
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
      <div className="flex flex-col gap-2 border-b border-slate-100 bg-white px-4 py-2.5 md:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1 max-w-[280px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <Input
              placeholder="Search companies..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-[13px]"
            />
          </div>

          <div className="flex max-w-full items-center gap-1 overflow-x-auto">
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

          <button
            onClick={() => setShowAdvancedFilters((current) => !current)}
            className={`inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md border transition-colors ${
              showAdvancedFilters || statusFilter || industryFilter || sizeFilter || locationFilter || cityFilter || countryFilter || filterTags.length > 0 || dateFrom || dateTo
                ? 'border-blue-200 bg-blue-50 text-blue-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            More Filters
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvancedFilters ? 'rotate-180' : ''}`} />
          </button>

          <div className="ml-auto flex items-center gap-2">
            <ColumnVisibilityMenu table={table} />
            <div className="flex items-center gap-1">
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
        </div>

        {showAdvancedFilters && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-[11px] border border-slate-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-600"
            >
              <option value="">All statuses</option>
              {COMPANY_STATUSES.map((status) => (
                <option key={status.value} value={status.value}>{status.label}</option>
              ))}
            </select>
            <Input
              placeholder="Industry"
              value={industryFilter}
              onChange={(e) => setIndustryFilter(e.target.value)}
              className="h-8 w-[140px] text-[11px]"
            />
            <select
              value={sizeFilter}
              onChange={(e) => setSizeFilter(e.target.value)}
              className="text-[11px] border border-slate-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-600"
            >
              <option value="">All sizes</option>
              {COMPANY_SIZES.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
            <Input
              placeholder="Location"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="h-8 w-[140px] text-[11px]"
            />
            <Input
              placeholder="City"
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className="h-8 w-[120px] text-[11px]"
            />
            <Input
              placeholder="Country"
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
              className="h-8 w-[120px] text-[11px]"
            />
            <div className="min-w-[220px] max-w-[320px]">
              <TagInput value={filterTags} onChange={setFilterTags} placeholder="Filter by tags..." />
            </div>
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
            {(typeFilter || ownerFilter || statusFilter || industryFilter || sizeFilter || locationFilter || cityFilter || countryFilter || filterTags.length > 0 || dateFrom || dateTo) && (
              <button
                onClick={() => {
                  setTypeFilter('');
                  setOwnerFilter('');
                  setStatusFilter('');
                  setIndustryFilter('');
                  setSizeFilter('');
                  setLocationFilter('');
                  setCityFilter('');
                  setCountryFilter('');
                  setFilterTags([]);
                  setDateFrom('');
                  setDateTo('');
                }}
                className="text-[11px] text-slate-400 hover:text-slate-600"
              >
                Clear All
              </button>
            )}
          </div>
        )}
      </div>

      {selectedIds.length > 0 && (
        <div className="flex items-center gap-2 px-6 py-2 bg-blue-50 border-b border-blue-200">
          <span className="text-sm font-medium text-blue-700">{selectedIds.length} selected</span>
          <select
            value={bulkOwnerId}
            onChange={(e) => setBulkOwnerId(e.target.value)}
            className="text-xs border border-blue-200 rounded-md px-2 py-1 bg-white text-slate-600"
          >
            <option value="">Change owner</option>
            <option value="__unassigned__">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
            ))}
          </select>
          <select
            value={bulkCompanyType}
            onChange={(e) => setBulkCompanyType(e.target.value)}
            className="text-xs border border-blue-200 rounded-md px-2 py-1 bg-white text-slate-600"
          >
            <option value="">Change company type</option>
            {COMPANY_TYPES.map((type) => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
          <div className="min-w-[240px] max-w-[320px]">
            <TagInput value={bulkTagsToAdd} onChange={setBulkTagsToAdd} placeholder="Add tags to selected..." />
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={bulkUpdate.isPending || (!bulkOwnerId && !bulkCompanyType && bulkTagsToAdd.length === 0)}
            onClick={() => bulkUpdate.mutate({
              ids: selectedIds,
              data: {
                ownerId: bulkOwnerId ? (bulkOwnerId === '__unassigned__' ? null : bulkOwnerId) : undefined,
                companyType: bulkCompanyType ? (bulkCompanyType as 'prospect' | 'customer' | 'partner' | 'vendor' | 'competitor' | 'other') : undefined,
                tagIdsToAdd: bulkTagsToAdd.length > 0 ? bulkTagsToAdd.map((tag) => tag.id) : undefined,
              },
            })}
          >
            Apply
          </Button>
          <button onClick={() => setRowSelection({})} className="text-xs text-slate-500 ml-auto hover:text-slate-700">
            Clear selection
          </button>
        </div>
      )}

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
                  onClick={() => openCompanyDetail(row.original)}
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
      {selectedCompanyId && (
        <CompanyDetail
          companyId={selectedCompanyId}
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

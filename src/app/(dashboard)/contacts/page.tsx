'use client';

import React, { useState, useCallback } from 'react';
import {
  useReactTable, getCoreRowModel, flexRender,
  type ColumnDef, type RowSelectionState,
} from '@tanstack/react-table';
import { Plus, Search, Users, Download, Upload, Trash2, Pencil, Link2, ChevronDown } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useDebounce } from '@/hooks/useDebounce';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { TableSkeleton } from '@/components/shared/LoadingSkeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { SlideOverPanel } from '@/components/shared/SlideOverPanel';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { ContactForm } from '@/components/contacts/ContactForm';
import { ContactStatusBadge } from '@/components/contacts/ContactStatusBadge';
import { TagBadge } from '@/components/tags/TagBadge';
import { TagInput } from '@/components/tags/TagInput';
import { ContactDetail } from '@/components/contacts/ContactDetail';
import { formatDate, formatRelative, getInitials } from '@/lib/formatters';
import { toast } from 'sonner';
import { PAGE_SIZES, CONTACT_STATUSES } from '@/lib/constants';
import { SavedViewsBar } from '@/components/saved-views/SavedViewsBar';
import { ImportWizard } from '@/components/import-export/ImportWizard';
import { exportToCSV } from '@/lib/export-csv';

type Contact = Record<string, unknown>;

export default function ContactsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [ownerFilter, setOwnerFilter] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pageSize, setPageSize] = useState(50);
  const [cursor, setCursor] = useState<string | undefined>();
  const [activeViewId, setActiveViewId] = useState<string>('');
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [relinkOpen, setRelinkOpen] = useState(false);
  const [relinkResult, setRelinkResult] = useState<{ contactsLinkedByName: number; contactsLinkedByDeal: number; companiesCreated: number } | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string>('');
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [bulkOwnerId, setBulkOwnerId] = useState('');
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkTagsToAdd, setBulkTagsToAdd] = useState<{ id: string; name: string; color: string }[]>([]);

  const debouncedSearch = useDebounce(search, 300);
  const utils = trpc.useUtils();

  const { data: usersData } = trpc.users.list.useQuery();
  const users = usersData ?? [];

  // Reset cursor whenever any filter/search changes
  React.useEffect(() => { setCursor(undefined); }, [debouncedSearch, statusFilter, ownerFilter, dateFrom, dateTo, pageSize]);

  // Build filter conditions
  type FilterOp = 'eq' | 'gte' | 'lte';
  const filterConditions: Array<{ field: string; operator: FilterOp; value: string }> = [];
  if (statusFilter) filterConditions.push({ field: 'status', operator: 'eq', value: statusFilter });
  if (ownerFilter) filterConditions.push({ field: 'ownerId', operator: 'eq', value: ownerFilter });
  if (dateFrom) filterConditions.push({ field: 'createdAt', operator: 'gte', value: dateFrom });
  if (dateTo) filterConditions.push({ field: 'createdAt', operator: 'lte', value: dateTo });

  const { data, isLoading } = trpc.contacts.list.useQuery({
    search: debouncedSearch || undefined,
    filters: filterConditions.length > 0
      ? { conditions: filterConditions, logic: 'AND' }
      : undefined,
    pagination: { cursor, limit: pageSize },
  });

  const deleteContact = trpc.contacts.delete.useMutation({
    onSuccess: () => {
      toast.success('Contact deleted');
      void utils.contacts.list.invalidate();
      setDeleteOpen(false);
      setDeleteId('');
    },
    onError: (e) => toast.error('Failed to delete', { description: e.message }),
  });

  const bulkDelete = trpc.contacts.bulkDelete.useMutation({
    onSuccess: ({ deleted }) => {
      toast.success(`${deleted} contacts deleted`);
      setRowSelection({});
      setDeleteOpen(false);
      setDeleteId('');
      void utils.contacts.list.invalidate();
    },
    onError: (e) => toast.error('Failed to delete', { description: e.message }),
  });

  const bulkUpdate = trpc.contacts.bulkUpdate.useMutation({
    onSuccess: ({ updated }) => {
      toast.success(`${updated} contacts updated`);
      setBulkOwnerId('');
      setBulkStatus('');
      setBulkTagsToAdd([]);
      setRowSelection({});
      void utils.contacts.list.invalidate();
    },
    onError: (e) => toast.error('Failed to update contacts', { description: e.message }),
  });

  const relinkMutation = trpc.import.relinkContactCompanies.useMutation({
    onSuccess: (result) => {
      setRelinkResult(result);
      void utils.contacts.list.invalidate();
      toast.success('Re-link complete', {
        description: `${result.contactsLinkedByName + result.contactsLinkedByDeal} contacts linked, ${result.companiesCreated} companies created`,
      });
    },
    onError: (err) => toast.error('Re-link failed', { description: err.message }),
  });

  const contacts: Contact[] = (data?.items ?? []) as Contact[];
  const selectedIds = Object.keys(rowSelection).filter((k) => rowSelection[k]);

  const columns: ColumnDef<Contact>[] = [
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
    },
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => {
        const c = row.original;
        const first = c.firstName as string;
        const last = c.lastName as string;
        return (
          <div className="flex items-center gap-2">
            <Avatar className="w-7 h-7 flex-shrink-0">
              <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
                {getInitials(first, last)}
              </AvatarFallback>
            </Avatar>
            <button
              className="text-sm font-medium text-blue-600 hover:underline text-left"
              onClick={(e) => { e.stopPropagation(); setSelectedContact(c); }}
            >
              {first} {last}
            </button>
          </div>
        );
      },
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => (
        <span className="text-sm text-slate-600 font-mono">{String(row.original.email ?? '—')}</span>
      ),
    },
    {
      accessorKey: 'phone',
      header: 'Phone',
      cell: ({ row }) => <span className="text-sm text-slate-600">{String(row.original.phone ?? '—')}</span>,
    },
    {
      accessorKey: 'company',
      header: 'Company',
      cell: ({ row }) => <span className="text-sm text-slate-700">{String(row.original.companyName ?? '—')}</span>,
    },
    {
      accessorKey: 'jobTitle',
      header: 'Job Title',
      cell: ({ row }) => <span className="text-sm text-slate-600">{String(row.original.jobTitle ?? '—')}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <ContactStatusBadge status={String(row.original.status ?? 'new')} />,
    },
    {
      accessorKey: 'owner',
      header: 'Owner',
      cell: ({ row }) => {
        const first = row.original.ownerFirstName as string | undefined;
        const last = row.original.ownerLastName as string | undefined;
        if (!first) return <span className="text-sm text-slate-400">—</span>;
        return (
          <div className="flex items-center gap-1.5">
            <Avatar className="w-5 h-5">
              <AvatarFallback className="text-xs bg-slate-200 text-slate-600">
                {getInitials(first, last)}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm text-slate-600">{first}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'lastContactedAt',
      header: 'Last Contacted',
      cell: ({ row }) => {
        const date = row.original.lastContactedAt as Date | null;
        return <span className="text-sm text-slate-500">{date ? formatRelative(date) : '—'}</span>;
      },
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      cell: ({ row }) => {
        const date = row.original.createdAt as Date;
        return <span className="text-sm text-slate-500">{formatDate(date)}</span>;
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); setEditContact(row.original); }}
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
    data: contacts,
    columns,
    state: { rowSelection },
    getRowId: (row) => String(row.id),
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white">
        <div>
          <h1 className="text-[15px] font-semibold text-slate-900 tracking-tight">Contacts</h1>
          <p className="text-xs text-slate-400 mt-0.5">{data ? `${data.total ?? data.items.length} contacts` : 'Loading...'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const rows = contacts.map((c) => ({
                firstName: String(c.firstName ?? ''),
                lastName: String(c.lastName ?? ''),
                email: String(c.email ?? ''),
                phone: String(c.phone ?? ''),
                jobTitle: String(c.jobTitle ?? ''),
                company: String(c.companyName ?? ''),
                status: String(c.status ?? ''),
                city: String(c.city ?? ''),
                country: String(c.country ?? ''),
              }));
              exportToCSV(rows, 'contacts.csv');
            }}
          >
            <Download className="w-4 h-4" />
            Export
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setRelinkResult(null); setRelinkOpen(true); }}
            title="Auto-link contacts to companies using existing data"
          >
            <Link2 className="w-4 h-4" />
            Auto Re-link
          </Button>
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4" />
            Import
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" />
            Add Contact
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3 px-6 py-2.5 bg-white border-b border-slate-100">
        {/* Search */}
        <div className="relative flex-1 max-w-[280px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <Input
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-[13px]"
          />
        </div>

        {/* Status chips */}
        <div className="flex items-center gap-1">
          <button
            className={`text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors ${!statusFilter ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'}`}
            onClick={() => setStatusFilter('')}
          >
            All
          </button>
          {CONTACT_STATUSES.slice(0, 5).map((s) => (
            <button
              key={s.value}
              className={`text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors ${statusFilter === s.value ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'}`}
              onClick={() => setStatusFilter(statusFilter === s.value ? '' : s.value)}
            >
              {s.label}
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

        {/* Saved views */}
        <SavedViewsBar
          entityType="contact"
          activeFilters={filterConditions.length > 0 ? { conditions: filterConditions, logic: 'AND' } : undefined}
          activeViewId={activeViewId}
          onLoadView={(view) => {
            setActiveViewId(view.id);
            const filters = view.filters as { conditions?: Array<{ field: string; operator: string; value: unknown }>; logic?: string } | null;
            const statusCond = filters?.conditions?.find((c) => c.field === 'status');
            if (statusCond) setStatusFilter(String(statusCond.value));
            else setStatusFilter('');
          }}
        />

        {/* Page size */}
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

      {/* Bulk actions */}
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
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value)}
            className="text-xs border border-blue-200 rounded-md px-2 py-1 bg-white text-slate-600"
          >
            <option value="">Change lead type</option>
            {CONTACT_STATUSES.map((status) => (
              <option key={status.value} value={status.value}>{status.label}</option>
            ))}
          </select>
          <div className="min-w-[240px] max-w-[320px]">
            <TagInput value={bulkTagsToAdd} onChange={setBulkTagsToAdd} placeholder="Add tags to selected..." />
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={bulkUpdate.isPending || (!bulkOwnerId && !bulkStatus && bulkTagsToAdd.length === 0)}
            onClick={() => bulkUpdate.mutate({
              ids: selectedIds,
              data: {
                ...(bulkOwnerId ? { ownerId: bulkOwnerId === '__unassigned__' ? null : bulkOwnerId } : {}),
                ...(bulkStatus ? { status: bulkStatus as 'new' | 'contacted' | 'qualified' | 'unqualified' | 'nurturing' | 'converted' | 'lost' | 'archived' } : {}),
                ...(bulkTagsToAdd.length > 0 ? { tagIdsToAdd: bulkTagsToAdd.map((tag) => tag.id) } : {}),
              },
            })}
          >
            Apply
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="ml-2"
            onClick={() => {
              setDeleteOpen(true);
            }}
          >
            <Trash2 className="w-3 h-3 mr-1" />
            Delete
          </Button>
          <button onClick={() => setRowSelection({})} className="text-xs text-slate-500 ml-auto hover:text-slate-700">
            Clear selection
          </button>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <TableSkeleton rows={10} cols={8} />
        ) : contacts.length === 0 ? (
          <EmptyState
            title="No contacts found"
            description={search ? `No contacts matching "${search}"` : "Add your first contact to get started."}
            action={{ label: 'Add Contact', onClick: () => setCreateOpen(true) }}
            icon={<Users className="w-8 h-8" />}
          />
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50/80 border-b border-slate-100 sticky top-0 z-10">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-[0.06em] whitespace-nowrap"
                    >
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
                  onClick={() => setSelectedContact(row.original)}
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
          <span className="text-xs text-slate-500">
            Showing {contacts.length} contacts
          </span>
          <div className="flex items-center gap-2">
            {cursor && (
              <Button size="sm" variant="outline" onClick={() => setCursor(undefined)}>
                First page
              </Button>
            )}
            {data.hasMore && (
              <Button size="sm" variant="outline" onClick={() => setCursor(data.nextCursor ?? undefined)}>
                Next page
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Create modal */}
      <SlideOverPanel
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add Contact"
        width="md"
      >
        <div className="p-6">
          <ContactForm
            onSuccess={() => setCreateOpen(false)}
            onCancel={() => setCreateOpen(false)}
          />
        </div>
      </SlideOverPanel>

      {/* Contact detail slide-over */}
      {selectedContact && (
        <ContactDetail
          contactId={String(selectedContact.id)}
          open={!!selectedContact}
          onClose={() => setSelectedContact(null)}
          onDeleted={() => setSelectedContact(null)}
        />
      )}

      {/* Edit contact panel (from row action) */}
      {editContact && (
        <SlideOverPanel open={!!editContact} onClose={() => setEditContact(null)} title="Edit Contact" width="md">
          <div className="p-6">
            <ContactForm
              mode="edit"
              contactId={String(editContact.id)}
              defaultValues={{
                firstName: String(editContact.firstName ?? ''),
                lastName: String(editContact.lastName ?? ''),
                email: String(editContact.email ?? ''),
                phone: String(editContact.phone ?? ''),
                companyName: String(editContact.companyName ?? ''),
                jobTitle: String(editContact.jobTitle ?? ''),
                status: (editContact.status as 'new' | 'contacted' | 'qualified' | 'unqualified' | 'nurturing' | 'converted' | 'lost' | 'archived') ?? 'new',
                ownerId: String(editContact.ownerId ?? ''),
                description: String(editContact.description ?? ''),
              }}
              onSuccess={() => { setEditContact(null); void utils.contacts.list.invalidate(); }}
              onCancel={() => setEditContact(null)}
            />
          </div>
        </SlideOverPanel>
      )}

      {/* Import wizard */}
      <SlideOverPanel
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import Contacts"
        width="lg"
      >
        <ImportWizard entityType="contact" onClose={() => { setImportOpen(false); void utils.contacts.list.invalidate(); }} />
      </SlideOverPanel>

      {/* Auto Re-link modal */}
      {relinkOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
            {!relinkResult ? (
              <>
                <div>
                  <h3 className="text-base font-semibold text-slate-900 mb-1">Auto Re-link Contacts to Companies</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    This will scan all contacts and automatically link them to their companies using:
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-slate-500 list-disc list-inside">
                    <li>Company name text already stored on the contact</li>
                    <li>Company linked to deals where this contact appears</li>
                  </ul>
                  <p className="text-sm text-slate-500 mt-2">
                    Missing companies will be created automatically. No contacts will be deleted or duplicated.
                  </p>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setRelinkOpen(false)}
                    className="flex-1 px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => relinkMutation.mutate()}
                    disabled={relinkMutation.isPending}
                    className="flex-1 px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 transition-colors font-medium"
                  >
                    {relinkMutation.isPending ? 'Running...' : 'Run Re-link'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <h3 className="text-base font-semibold text-slate-900 mb-3">Re-link Complete</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center p-3 bg-blue-50 border border-blue-100 rounded-xl">
                      <p className="text-2xl font-bold text-blue-700">{relinkResult.contactsLinkedByName}</p>
                      <p className="text-[11px] text-blue-600 mt-0.5 leading-tight">Linked by company name</p>
                    </div>
                    <div className="text-center p-3 bg-purple-50 border border-purple-100 rounded-xl">
                      <p className="text-2xl font-bold text-purple-700">{relinkResult.contactsLinkedByDeal}</p>
                      <p className="text-[11px] text-purple-600 mt-0.5 leading-tight">Linked via deal</p>
                    </div>
                    <div className="text-center p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                      <p className="text-2xl font-bold text-emerald-700">{relinkResult.companiesCreated}</p>
                      <p className="text-[11px] text-emerald-600 mt-0.5 leading-tight">Companies created</p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setRelinkOpen(false)}
                  className="w-full px-4 py-2 text-sm rounded-lg bg-slate-900 text-white hover:bg-slate-700 transition-colors font-medium"
                >
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(open) => { setDeleteOpen(open); if (!open) setDeleteId(''); }}
        title={deleteId ? 'Delete contact?' : `Delete ${selectedIds.length} contact${selectedIds.length === 1 ? '' : 's'}?`}
        description="This action cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={deleteContact.isPending || bulkDelete.isPending}
        onConfirm={() => {
          if (deleteId) {
            deleteContact.mutate({ id: deleteId });
          } else if (selectedIds.length > 0) {
            bulkDelete.mutate({ ids: selectedIds });
          }
        }}
      />
    </div>
  );
}

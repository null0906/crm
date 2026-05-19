'use client';

import React, { useState, useCallback } from 'react';
import {
  useReactTable, getCoreRowModel, flexRender,
  type ColumnDef, type RowSelectionState, type VisibilityState,
} from '@tanstack/react-table';
import { Plus, Search, Users, Download, Upload, Trash2, Pencil, Link2, ChevronDown, MessageCircle, PhoneCall, Mail, CalendarDays, StickyNote } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useDebounce } from '@/hooks/useDebounce';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableSkeleton } from '@/components/shared/LoadingSkeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { SlideOverPanel } from '@/components/shared/SlideOverPanel';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { ContactForm } from '@/components/contacts/ContactForm';
import { ContactStatusBadge } from '@/components/contacts/ContactStatusBadge';
import { TagInput } from '@/components/tags/TagInput';
import { ContactDetail } from '@/components/contacts/ContactDetail';
import { formatDate, formatRelative } from '@/lib/formatters';
import { toast } from 'sonner';
import { PAGE_SIZES, CONTACT_SOURCES, CONTACT_STATUSES } from '@/lib/constants';
import { SavedViewsBar } from '@/components/saved-views/SavedViewsBar';
import { ImportWizard } from '@/components/import-export/ImportWizard';
import { exportToCSV } from '@/lib/export-csv';
import { ColumnVisibilityMenu } from '@/components/shared/ColumnVisibilityMenu';
import { getWhatsAppHref } from '@/lib/whatsapp';

type Contact = Record<string, unknown>;

function EmptyCell() {
  return <span className="cell-empty select-none font-mono text-base text-[var(--color-border-strong)]">—</span>;
}

function formatPhone(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (/\s|-|\(|\)/.test(raw)) return raw;
  return raw.replace(/(\d{5})(?=\d)/g, '$1 ');
}

const INITIAL_TOUCH_CONFIG: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  call: {
    label: 'Call',
    icon: PhoneCall,
    className: 'border-blue-200 bg-blue-50 text-blue-700',
  },
  email_sent: {
    label: 'Email',
    icon: Mail,
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  email_received: {
    label: 'Email',
    icon: Mail,
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  meeting: {
    label: 'Meeting',
    icon: CalendarDays,
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  demo: {
    label: 'Demo',
    icon: CalendarDays,
    className: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  },
  whatsapp: {
    label: 'WhatsApp',
    icon: MessageCircle,
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  linkedin: {
    label: 'LinkedIn',
    icon: Link2,
    className: 'border-sky-200 bg-sky-50 text-sky-700',
  },
  note: {
    label: 'Note',
    icon: StickyNote,
    className: 'border-slate-200 bg-slate-50 text-slate-600',
  },
};

function InitialTouchBadge({ type, at }: { type: unknown; at: unknown }) {
  const key = String(type ?? '').trim();
  if (!key) return <EmptyCell />;
  const cfg = INITIAL_TOUCH_CONFIG[key] ?? {
    label: key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
    icon: StickyNote,
    className: 'border-slate-200 bg-slate-50 text-slate-600',
  };
  const Icon = cfg.icon;
  const date = at ? new Date(String(at)) : null;
  const title = date && !Number.isNaN(date.getTime())
    ? `First touch: ${cfg.label} on ${formatDate(date)}`
    : `First touch: ${cfg.label}`;

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${cfg.className}`}
    >
      <Icon className="h-3 w-3" strokeWidth={1.8} />
      {cfg.label}
    </span>
  );
}

function TableAvatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-[5px] border border-[var(--color-border)] bg-[var(--color-avatar-bg)] font-sans text-[10px] font-semibold tracking-[0.02em] text-[var(--color-neutral)]">
      {initials || '•'}
    </div>
  );
}

export default function ContactsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [ownerFilter, setOwnerFilter] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<string>('');
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
  React.useEffect(() => {
    setCursor(undefined);
  }, [debouncedSearch, statusFilter, ownerFilter, sourceFilter, locationFilter, cityFilter, countryFilter, filterTags, dateFrom, dateTo, pageSize]);

  // Build filter conditions
  type FilterOp = 'eq' | 'gte' | 'lte' | 'contains' | 'contains_any';
  const filterConditions: Array<{ field: string; operator: FilterOp; value: unknown }> = [];
  if (statusFilter) filterConditions.push({ field: 'status', operator: 'eq', value: statusFilter });
  if (ownerFilter) filterConditions.push({ field: 'ownerId', operator: 'eq', value: ownerFilter });
  if (sourceFilter) filterConditions.push({ field: 'source', operator: 'eq', value: sourceFilter });
  if (locationFilter) filterConditions.push({ field: 'location', operator: 'contains', value: locationFilter });
  if (cityFilter) filterConditions.push({ field: 'city', operator: 'contains', value: cityFilter });
  if (countryFilter) filterConditions.push({ field: 'country', operator: 'contains', value: countryFilter });
  if (filterTags.length > 0) filterConditions.push({ field: 'tags', operator: 'contains_any', value: filterTags.map((tag) => tag.id) });
  if (dateFrom) filterConditions.push({ field: 'createdAt', operator: 'gte', value: dateFrom });
  if (dateTo) filterConditions.push({ field: 'createdAt', operator: 'lte', value: dateTo });
  const activeFilterConfig = filterConditions.length > 0
    ? { conditions: filterConditions, logic: 'AND' as const }
    : undefined;
  const hasActiveExportFilters = Boolean(debouncedSearch || activeFilterConfig);

  const { data, isLoading } = trpc.contacts.list.useQuery({
    search: debouncedSearch || undefined,
    filters: activeFilterConfig,
    pagination: { cursor, limit: pageSize },
  });
  const exportContactsQuery = trpc.import.exportContacts.useQuery(
    {
      limit: 5000,
      search: debouncedSearch || undefined,
      filters: activeFilterConfig,
    },
    { enabled: false }
  );

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
          className="h-3.5 w-3.5 rounded-[3px] border-[var(--color-border-strong)] accent-[var(--color-accent)]"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
          onClick={(e) => e.stopPropagation()}
          className="h-3.5 w-3.5 rounded-[3px] border-[var(--color-border-strong)] accent-[var(--color-accent)]"
        />
      ),
      size: 40,
      enableHiding: false,
    },
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => {
        const c = row.original;
        const first = c.firstName as string;
        const last = c.lastName as string;
        const fullName = `${first ?? ''} ${last ?? ''}`.trim();
        return (
          <div className="flex items-center gap-[9px]">
            <TableAvatar name={fullName} />
            <button
              className="cell-name text-left text-[13.5px] font-semibold tracking-[-0.01em] text-[var(--color-text-1)] hover:text-[var(--color-accent)]"
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
      cell: ({ row }) => {
        const email = String(row.original.email ?? '').trim();
        return email
          ? <span className="cell-email font-mono text-sm text-[var(--color-neutral)]">{email}</span>
          : <EmptyCell />;
      },
    },
    {
      accessorKey: 'phone',
      header: 'Phone',
      cell: ({ row }) => {
        const rawPhone = String(row.original.mobile ?? row.original.phone ?? '').trim();
        const phone = formatPhone(rawPhone);
        const whatsappHref = getWhatsAppHref(rawPhone);
        return phone
          ? (
            <div className="flex items-center gap-2">
              <span className="cell-phone font-mono text-sm tracking-[0.03em] text-[var(--color-neutral)]">{phone}</span>
              {whatsappHref && (
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-emerald-600 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
                  title="Open WhatsApp chat"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          )
          : <EmptyCell />;
      },
    },
    {
      accessorKey: 'initialActivityType',
      header: 'Initial Touch',
      cell: ({ row }) => (
        <InitialTouchBadge
          type={row.original.initialActivityType}
          at={row.original.initialActivityAt}
        />
      ),
    },
    {
      accessorKey: 'company',
      header: 'Company',
      cell: ({ row }) => {
        const company = String(row.original.companyName ?? '').trim();
        return company
          ? <span className="cell-company text-base font-medium text-[var(--color-company)] hover:text-[var(--color-accent)]">{company}</span>
          : <EmptyCell />;
      },
    },
    {
      accessorKey: 'jobTitle',
      header: 'Job Title',
      cell: ({ row }) => {
        const title = String(row.original.jobTitle ?? '').trim();
        return title
          ? <span className="cell-jobtitle block max-w-[180px] truncate text-sm text-[var(--color-text-3)]" title={title}>{title}</span>
          : <EmptyCell />;
      },
    },
    {
      accessorKey: 'city',
      header: 'City',
      cell: ({ row }) => {
        const city = String(row.original.city ?? '').trim();
        return city ? <span className="text-sm text-[var(--color-text-3)]">{city}</span> : <EmptyCell />;
      },
    },
    {
      accessorKey: 'country',
      header: 'Country',
      cell: ({ row }) => {
        const country = String(row.original.country ?? '').trim();
        return country ? <span className="text-sm text-[var(--color-text-3)]">{country}</span> : <EmptyCell />;
      },
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
        if (!first) return <EmptyCell />;
        const ownerName = `${first} ${last ?? ''}`.trim();
        return (
          <div className="flex items-center gap-2">
            <TableAvatar name={ownerName} />
            <span className="max-w-[120px] truncate text-sm font-medium text-[var(--text-secondary)]" title={ownerName}>
              {ownerName}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: 'lastContactedAt',
      header: 'Last Contacted',
      cell: ({ row }) => {
        const date = row.original.lastContactedAt as Date | null;
        return date ? <span className="font-mono text-sm text-[var(--color-text-2)]">{formatRelative(date)}</span> : <EmptyCell />;
      },
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      cell: ({ row }) => {
        const date = row.original.createdAt as Date;
        return <span className="font-mono text-sm text-[var(--color-text-2)]">{formatDate(date)}</span>;
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="row-actions flex items-center justify-end gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); setEditContact(row.original); }}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-3)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
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
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-3)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]"
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
    data: contacts,
    columns,
    state: { rowSelection, columnVisibility },
    getRowId: (row) => String(row.id),
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="contacts-page flex h-full flex-col bg-[var(--surface-page)]">
      {/* Filter Bar */}
      <div className="filter-bar flex flex-col gap-2 bg-[var(--surface-page)] px-3 pb-0 pt-3 md:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1 max-w-[280px]">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-3)]" />
            <Input
              placeholder="Search contacts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-base"
            />
          </div>

          <div className="flex max-w-full items-center gap-1 overflow-x-auto">
            <button
              className={`status-pill h-7 rounded-md border px-3 text-[12.5px] transition-all ${!statusFilter ? 'border-[var(--accent)] bg-[var(--accent)] text-white font-semibold shadow-[0_1px_4px_rgba(45,91,227,0.30)]' : 'border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-secondary)] hover:border-[var(--accent-medium)] hover:bg-[var(--accent-light)] hover:text-[var(--accent)]'}`}
              onClick={() => setStatusFilter('')}
            >
              All
            </button>
            {CONTACT_STATUSES.slice(0, 5).map((s) => (
              <button
                key={s.value}
                className={`status-pill h-7 rounded-md border px-3 text-[12.5px] transition-all ${statusFilter === s.value ? 'border-[var(--accent)] bg-[var(--accent)] text-white font-semibold shadow-[0_1px_4px_rgba(45,91,227,0.30)]' : 'border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-secondary)] hover:border-[var(--accent-medium)] hover:bg-[var(--accent-light)] hover:text-[var(--accent)]'}`}
                onClick={() => setStatusFilter(statusFilter === s.value ? '' : s.value)}
              >
                {s.label}
              </button>
            ))}
          </div>

          <select
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            className="h-7 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-sm text-[var(--color-text-2)] focus-visible:border-[var(--color-border-focus)]"
          >
            <option value="">All owners</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
            ))}
          </select>

          <button
            onClick={() => setShowAdvancedFilters((current) => !current)}
            className={`inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md border transition-colors ${
              showAdvancedFilters || sourceFilter || locationFilter || cityFilter || countryFilter || filterTags.length > 0 || dateFrom || dateTo
                ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-2)] hover:bg-[var(--color-surface-alt)]'
            }`}
          >
            More Filters
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvancedFilters ? 'rotate-180' : ''}`} />
          </button>

          <SavedViewsBar
            entityType="contact"
            activeFilters={filterConditions.length > 0 ? { conditions: filterConditions, logic: 'AND' } : undefined}
            activeViewId={activeViewId}
            onLoadView={(view) => {
              setActiveViewId(view.id);
              const filters = view.filters as { conditions?: Array<{ field: string; operator: string; value: unknown }>; logic?: string } | null;
              const statusCond = filters?.conditions?.find((c) => c.field === 'status');
              const ownerCond = filters?.conditions?.find((c) => c.field === 'ownerId');
              const sourceCond = filters?.conditions?.find((c) => c.field === 'source');
              const locationCond = filters?.conditions?.find((c) => c.field === 'location');
              const cityCond = filters?.conditions?.find((c) => c.field === 'city');
              const countryCond = filters?.conditions?.find((c) => c.field === 'country');
              setStatusFilter(statusCond ? String(statusCond.value) : '');
              setOwnerFilter(ownerCond ? String(ownerCond.value) : '');
              setSourceFilter(sourceCond ? String(sourceCond.value) : '');
              setLocationFilter(locationCond ? String(locationCond.value) : '');
              setCityFilter(cityCond ? String(cityCond.value) : '');
              setCountryFilter(countryCond ? String(countryCond.value) : '');
            }}
          />

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <ColumnVisibilityMenu table={table} />
            <Button
              size="sm"
              variant="outline"
              disabled={exportContactsQuery.isFetching}
              onClick={async () => {
                const { data: exportData } = await exportContactsQuery.refetch();
                const rows = (exportData?.rows ?? contacts).map((c) => ({
                  firstName: String(c.firstName ?? ''),
                  lastName: String(c.lastName ?? ''),
                  email: String(c.email ?? ''),
                  secondaryEmail: String(c.secondaryEmail ?? ''),
                  phone: String(c.phone ?? ''),
                  mobile: String(c.mobile ?? ''),
                  jobTitle: String(c.jobTitle ?? ''),
                  department: String(c.department ?? ''),
                  company: String(c.companyName ?? ''),
                  status: String(c.status ?? ''),
                  source: String(c.source ?? ''),
                  leadScore: String(c.leadScore ?? ''),
                  owner: `${String(c.ownerFirstName ?? '')} ${String(c.ownerLastName ?? '')}`.trim(),
                  initialTouch: String(c.initialActivityType ?? ''),
                  initialTouchAt: c.initialActivityAt ? formatDate(c.initialActivityAt as Date | string) : '',
                  location: String(c.location ?? ''),
                  city: String(c.city ?? ''),
                  state: String(c.state ?? ''),
                  postalCode: String(c.postalCode ?? ''),
                  country: String(c.country ?? ''),
                  linkedIn: String(c.linkedinUrl ?? ''),
                  notes: String(c.description ?? ''),
                  lastContacted: c.lastContactedAt ? formatDate(c.lastContactedAt as Date | string) : '',
                  createdAt: c.createdAt ? formatDate(c.createdAt as Date | string) : '',
                  updatedAt: c.updatedAt ? formatDate(c.updatedAt as Date | string) : '',
                }));
                exportToCSV(rows, hasActiveExportFilters ? 'contacts-filtered.csv' : 'contacts.csv', { forceTextColumns: ['phone', 'mobile', 'postalCode'] });
                toast.success(hasActiveExportFilters ? 'Filtered contacts exported' : 'Contacts exported', {
                  description: `${rows.length} contact${rows.length === 1 ? '' : 's'} downloaded`,
                });
                if (exportData?.truncated) {
                  toast.warning('Export is limited to the first 5,000 contacts');
                }
              }}
              title={hasActiveExportFilters ? 'Export contacts matching the current filters and search' : 'Export all contacts'}
            >
              <Download className="h-3.5 w-3.5" />
              {exportContactsQuery.isFetching ? 'Exporting...' : hasActiveExportFilters ? 'Export Filtered' : 'Export'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setRelinkResult(null); setRelinkOpen(true); }}
              title="Auto-link contacts to companies using existing data"
            >
              <Link2 className="h-3.5 w-3.5" />
              Auto Re-link
            </Button>
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="h-3.5 w-3.5" />
              Import
            </Button>
            <div className="h-4 w-px bg-[var(--color-border)]" />
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Add Contact
            </Button>
            <span className="ml-2 text-sm text-[var(--color-text-3)]">Show</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="h-7 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm text-[var(--color-text-2)]"
            >
              {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {showAdvancedFilters && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="h-7 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-sm text-[var(--color-text-2)] focus-visible:border-[var(--color-border-focus)]"
            >
              <option value="">All sources</option>
              {CONTACT_SOURCES.map((source) => (
                <option key={source.value} value={source.value}>{source.label}</option>
              ))}
            </select>
            <Input
              placeholder="Location"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="h-7 w-[140px] text-sm"
            />
            <Input
              placeholder="City"
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className="h-7 w-[120px] text-sm"
            />
            <Input
              placeholder="Country"
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
              className="h-7 w-[120px] text-sm"
            />
            <div className="min-w-[220px] max-w-[320px]">
              <TagInput value={filterTags} onChange={setFilterTags} placeholder="Filter by tags..." />
            </div>
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-7 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 font-mono text-sm text-[var(--color-text-2)] focus-visible:border-[var(--color-border-focus)]"
                title="Created from"
              />
              <span className="text-xs text-[var(--color-text-3)]">–</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-7 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 font-mono text-sm text-[var(--color-text-2)] focus-visible:border-[var(--color-border-focus)]"
                title="Created to"
              />
            </div>
            {(ownerFilter || statusFilter || sourceFilter || locationFilter || cityFilter || countryFilter || filterTags.length > 0 || dateFrom || dateTo) && (
              <button
                onClick={() => {
                  setStatusFilter('');
                  setOwnerFilter('');
                  setSourceFilter('');
                  setLocationFilter('');
                  setCityFilter('');
                  setCountryFilter('');
                  setFilterTags([]);
                  setDateFrom('');
                  setDateTo('');
                }}
                className="text-sm text-[var(--color-text-3)] hover:text-[var(--color-text-2)]"
              >
                Clear All
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bulk actions */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-accent-soft)] px-6 py-2">
          <span className="text-sm font-medium text-[var(--color-accent)]">{selectedIds.length} selected</span>
          <select
            value={bulkOwnerId}
            onChange={(e) => setBulkOwnerId(e.target.value)}
            className="h-7 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm text-[var(--color-text-2)]"
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
            className="h-7 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm text-[var(--color-text-2)]"
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
          <button onClick={() => setRowSelection({})} className="ml-auto text-sm text-[var(--color-text-2)] hover:text-[var(--color-text-1)]">
            Clear selection
          </button>
        </div>
      )}

      {/* Table */}
      <div className="table-container mx-3 my-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-sm md:mx-6 md:my-4">
        <div className="flex-1 overflow-auto bg-[var(--surface-card)]">
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
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-[var(--surface-subtle)]">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="h-9 border-b border-[var(--border-default)] px-4 text-left text-[10.5px] font-bold uppercase tracking-[0.06em] text-[var(--text-tertiary)] whitespace-nowrap"
                    >
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row, index) => (
                <tr
                  key={row.id}
                  className={`group h-12 cursor-pointer border-b border-[var(--border-subtle)] bg-[var(--surface-card)] transition-[background,box-shadow] duration-100 last:border-b-0 hover:bg-[var(--accent-light)] hover:shadow-[inset_3px_0_0_var(--accent)] ${row.getIsSelected() ? 'table-row-selected' : ''}`}
                  style={{ animationDelay: `${Math.min(index, 8) * 25}ms` }}
                  onClick={() => setSelectedContact(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="h-12 whitespace-nowrap px-4 text-base text-[var(--text-primary)]">
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
        <div className="flex items-center justify-between border-t border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-2.5">
          <span className="text-sm text-[var(--text-tertiary)]">
            Showing {contacts.length} of {data.total ?? contacts.length} contacts
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
      </div>

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
          <div className="mx-4 w-full max-w-sm space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-up)] p-6 shadow-xl">
            {!relinkResult ? (
              <>
                <div>
                  <h3 className="mb-1 text-lg font-semibold text-[var(--color-text-1)]">Auto Re-link Contacts to Companies</h3>
                  <p className="text-sm leading-relaxed text-[var(--color-text-2)]">
                    This will scan all contacts and automatically link them to their companies using:
                  </p>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-[var(--color-text-2)]">
                    <li>Company name text already stored on the contact</li>
                    <li>Company linked to prospects where this contact appears</li>
                  </ul>
                  <p className="mt-2 text-sm text-[var(--color-text-2)]">
                    Missing companies will be created automatically. No contacts will be deleted or duplicated.
                  </p>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setRelinkOpen(false)}
                    className="flex-1 rounded-md border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-2)] hover:bg-[var(--color-surface-alt)]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => relinkMutation.mutate()}
                    disabled={relinkMutation.isPending}
                    className="flex-1 rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-text-inverse)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
                  >
                    {relinkMutation.isPending ? 'Running...' : 'Run Re-link'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <h3 className="mb-3 text-lg font-semibold text-[var(--color-text-1)]">Re-link Complete</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-accent-soft)] p-3 text-center">
                      <p className="text-2xl font-bold text-[var(--color-accent)]">{relinkResult.contactsLinkedByName}</p>
                      <p className="mt-0.5 text-xs leading-tight text-[var(--color-accent)]">Linked by company name</p>
                    </div>
                    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-purple-bg)] p-3 text-center">
                      <p className="text-2xl font-bold text-[var(--color-purple)]">{relinkResult.contactsLinkedByDeal}</p>
                      <p className="mt-0.5 text-xs leading-tight text-[var(--color-purple)]">Linked via prospect</p>
                    </div>
                    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-success-bg)] p-3 text-center">
                      <p className="text-2xl font-bold text-[var(--color-success)]">{relinkResult.companiesCreated}</p>
                      <p className="mt-0.5 text-xs leading-tight text-[var(--color-success)]">Companies created</p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setRelinkOpen(false)}
                  className="w-full rounded-md bg-[var(--color-text-1)] px-4 py-2 text-sm font-medium text-[var(--color-text-inverse)] hover:opacity-90"
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

'use client';

import React, { useState } from 'react';
import type { RowSelectionState } from '@tanstack/react-table';
import { Plus, LayoutGrid, List, Upload, Link2, Filter, Search, ChevronDown } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useDebounce } from '@/hooks/useDebounce';
import { Button } from '@/components/ui/button';
import { SlideOverPanel } from '@/components/shared/SlideOverPanel';
import { KanbanBoard } from '@/components/deals/KanbanBoard';
import { DealTable } from '@/components/deals/DealTable';
import { DealForm } from '@/components/deals/DealForm';
import { DealDetail } from '@/components/deals/DealDetail';
import { TagInput } from '@/components/tags/TagInput';
import { ImportWizard } from '@/components/import-export/ImportWizard';
import { BackfillDealLinksWizard } from '@/components/import-export/BackfillDealLinksWizard';
import { Input } from '@/components/ui/input';
import { DEAL_SERVICE_OPTIONS, DEAL_STATUSES } from '@/lib/constants';
import { toast } from 'sonner';

interface Stage {
  id: string;
  name: string;
  color: string | null;
  position: number;
}

type ViewMode = 'kanban' | 'table';

export default function DealsPage() {
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [createOpen, setCreateOpen] = useState(false);
  const [createStageId, setCreateStageId] = useState<string>('');
  const [selectedDealId, setSelectedDealId] = useState<string>('');
  const [importOpen, setImportOpen] = useState(false);
  const [backfillOpen, setBackfillOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [ownerFilter, setOwnerFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [stageFilter, setStageFilter] = useState<string>('');
  const [companyFilter, setCompanyFilter] = useState<string>('');
  const [contactFilter, setContactFilter] = useState<string>('');
  const [partnerFilter, setPartnerFilter] = useState<string>('');
  const [serviceFilter, setServiceFilter] = useState<string>('');
  const [expectedCloseFrom, setExpectedCloseFrom] = useState<string>('');
  const [expectedCloseTo, setExpectedCloseTo] = useState<string>('');
  const [filterTags, setFilterTags] = useState<{ id: string; name: string; color: string }[]>([]);
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [bulkOwnerId, setBulkOwnerId] = useState('');
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkTagsToAdd, setBulkTagsToAdd] = useState<{ id: string; name: string; color: string }[]>([]);
  const debouncedSearch = useDebounce(search, 300);

  const { data: pipelines = [], isLoading: pipelinesLoading } = trpc.pipelines.list.useQuery();
  const { data: usersData } = trpc.users.list.useQuery();
  const { data: contactsData } = trpc.contacts.list.useQuery({ pagination: { limit: 200 } });
  const { data: companiesData } = trpc.companies.list.useQuery({ pagination: { limit: 200 } });
  const users = usersData ?? [];
  const contacts = (contactsData?.items ?? []) as Array<Record<string, unknown>>;
  const companies = (companiesData?.items ?? []) as Array<Record<string, unknown>>;
  const partnerCompanies = companies.filter((company) => String(company.companyType ?? '') === 'partner');
  const utils = trpc.useUtils();
  const selectedDealIds = Object.keys(rowSelection).filter((k) => rowSelection[k]);

  const bulkUpdateDeals = trpc.deals.bulkUpdate.useMutation({
    onSuccess: ({ updated }) => {
      toast.success(`${updated} deals updated`);
      setBulkOwnerId('');
      setBulkStatus('');
      setBulkTagsToAdd([]);
      setRowSelection({});
      void utils.deals.list.invalidate();
      if (selectedPipelineId) void utils.deals.byStage.invalidate({ pipelineId: selectedPipelineId });
    },
    onError: (err) => toast.error('Failed to update deals', { description: err.message }),
  });

  type FilterOp = 'eq' | 'gte' | 'lte' | 'contains' | 'contains_any';
  const dealFilterConditions: Array<{ field: string; operator: FilterOp; value: unknown }> = [];
  if (ownerFilter) dealFilterConditions.push({ field: 'ownerId', operator: 'eq', value: ownerFilter });
  if (statusFilter) dealFilterConditions.push({ field: 'status', operator: 'eq', value: statusFilter });
  if (stageFilter) dealFilterConditions.push({ field: 'stageId', operator: 'eq', value: stageFilter });
  if (companyFilter) dealFilterConditions.push({ field: 'companyId', operator: 'eq', value: companyFilter });
  if (contactFilter) dealFilterConditions.push({ field: 'primaryContactId', operator: 'eq', value: contactFilter });
  if (partnerFilter) dealFilterConditions.push({ field: 'partnerCompanyId', operator: 'eq', value: partnerFilter });
  if (serviceFilter) dealFilterConditions.push({ field: 'services', operator: 'contains', value: serviceFilter });
  if (filterTags.length > 0) dealFilterConditions.push({ field: 'tags', operator: 'contains_any', value: filterTags.map((tag) => tag.id) });
  if (dateFrom) dealFilterConditions.push({ field: 'createdAt', operator: 'gte', value: dateFrom });
  if (dateTo) dealFilterConditions.push({ field: 'createdAt', operator: 'lte', value: dateTo });
  if (expectedCloseFrom) dealFilterConditions.push({ field: 'expectedCloseDate', operator: 'gte', value: expectedCloseFrom });
  if (expectedCloseTo) dealFilterConditions.push({ field: 'expectedCloseDate', operator: 'lte', value: expectedCloseTo });

  // Auto-select first pipeline
  React.useEffect(() => {
    if (pipelines.length > 0 && !selectedPipelineId) {
      setSelectedPipelineId(String(pipelines[0]!.id));
    }
  }, [pipelines, selectedPipelineId]);

  React.useEffect(() => {
    setRowSelection({});
  }, [selectedPipelineId, viewMode]);

  const { data: pipelineData } = trpc.pipelines.getWithStages.useQuery(
    { id: selectedPipelineId },
    { enabled: !!selectedPipelineId }
  );

  const stages: Stage[] = ((pipelineData?.stages as Stage[]) ?? []).sort((a, b) => a.position - b.position);

  function handleAddDeal(stageId: string) {
    setCreateStageId(stageId);
    setCreateOpen(true);
  }

  if (pipelinesLoading) {
    return (
      <div className="flex h-full items-start gap-3 bg-[var(--surface-page)] p-4">
        <div className="w-[282px] rounded-[14px] border border-white/80 bg-[rgba(255,255,255,0.55)] p-3 shadow-sm backdrop-blur-md">
          <div className="skeleton mb-4 h-3.5 w-32" />
          <div className="space-y-2">
            <div className="skeleton h-24 w-full rounded-[10px]" />
            <div className="skeleton h-24 w-full rounded-[10px]" />
            <div className="skeleton h-24 w-full rounded-[10px]" />
          </div>
        </div>
      </div>
    );
  }

  if (pipelines.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--surface-page)]">
        <div className="text-center">
          <LayoutGrid className="mx-auto mb-3 h-10 w-10 text-[var(--color-border-strong)]" />
          <p className="font-medium text-[var(--color-text-2)]">No pipelines found</p>
          <p className="mt-1 text-sm text-[var(--color-text-3)]">Create a pipeline in Settings to get started.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--surface-page)]">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--surface-card)] px-6 py-3 shadow-[0_1px_0_var(--border-subtle),_0_2px_6px_rgba(15,20,40,0.04)]">
        <div className="flex items-center gap-4">
          {/* Pipeline tabs */}
          <div className="pipeline-tab-bar flex items-center gap-1 rounded-[9px] border border-[var(--border-default)] bg-[var(--surface-input)] p-[3px]">
            {pipelines.map((pipeline) => (
              <button
                key={String(pipeline.id)}
                className={`pipeline-tab h-[30px] rounded-[7px] px-3.5 text-[12.5px] font-medium transition-all duration-150 ease-[var(--ease-spring)] whitespace-nowrap ${
                  selectedPipelineId === String(pipeline.id)
                    ? 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-[0_1px_3px_rgba(15,20,40,0.10),_0_1px_2px_rgba(15,20,40,0.06)] font-semibold'
                    : 'text-[var(--text-tertiary)] hover:bg-[rgba(255,255,255,0.7)] hover:text-[var(--text-secondary)]'
                }`}
                onClick={() => setSelectedPipelineId(String(pipeline.id))}
              >
                {pipeline.name as string}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center rounded-[9px] border border-[var(--border-default)] bg-[var(--surface-input)] p-[3px]">
            <button
              onClick={() => setViewMode('kanban')}
              className={`rounded-[7px] p-1.5 transition-all ${viewMode === 'kanban' ? 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'}`}
              title="Kanban view"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`rounded-[7px] p-1.5 transition-all ${viewMode === 'table' ? 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'}`}
              title="Table view"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>

          <Button size="sm" variant="outline" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="w-4 h-4" />
            {(debouncedSearch || ownerFilter || statusFilter || stageFilter || companyFilter || contactFilter || partnerFilter || serviceFilter || filterTags.length > 0 || expectedCloseFrom || expectedCloseTo || dateFrom || dateTo) ? 'Filters •' : 'Filters'}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setBackfillOpen(true)} title="Re-link contacts & companies from a previous import CSV">
            <Link2 className="w-4 h-4" />
            Re-link
          </Button>
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4" />
            Import
          </Button>
          <Button size="sm" onClick={() => { setCreateStageId(stages[0]?.id ?? ''); setCreateOpen(true); }}>
            <Plus className="w-4 h-4" />
            Add Deal
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      {showFilters && (
        <div className="flex flex-shrink-0 flex-wrap items-center gap-3 border-b border-[var(--border-subtle)] bg-[var(--surface-page)] px-6 py-2.5">
          <div className="relative min-w-[240px] flex-1 max-w-[320px]">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-3)]" />
            <Input
              placeholder="Search deals, contacts, companies..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 bg-[var(--color-surface)] pl-8 text-base"
            />
          </div>
          <select
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            className="h-7 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm text-[var(--color-text-2)]"
          >
            <option value="">All owners</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-7 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm text-[var(--color-text-2)]"
          >
            <option value="">All statuses</option>
            {DEAL_STATUSES.map((status) => (
              <option key={status.value} value={status.value}>{status.label}</option>
            ))}
          </select>
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="h-7 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm text-[var(--color-text-2)]"
          >
            <option value="">All stages</option>
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>{stage.name}</option>
            ))}
          </select>
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="h-7 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm text-[var(--color-text-2)]"
          >
            <option value="">All companies</option>
            {companies.map((company) => (
              <option key={String(company.id)} value={String(company.id)}>{String(company.name ?? 'Unnamed company')}</option>
            ))}
          </select>
          <select
            value={contactFilter}
            onChange={(e) => setContactFilter(e.target.value)}
            className="h-7 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm text-[var(--color-text-2)]"
          >
            <option value="">All contacts</option>
            {contacts.map((contact) => (
              <option key={String(contact.id)} value={String(contact.id)}>
                {String(contact.firstName ?? '')} {String(contact.lastName ?? '')}
              </option>
            ))}
          </select>
          <select
            value={partnerFilter}
            onChange={(e) => setPartnerFilter(e.target.value)}
            className="h-7 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm text-[var(--color-text-2)]"
          >
            <option value="">All partners</option>
            {partnerCompanies.map((company) => (
              <option key={String(company.id)} value={String(company.id)}>{String(company.name ?? 'Unnamed partner')}</option>
            ))}
          </select>
          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            className="h-7 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm text-[var(--color-text-2)]"
          >
            <option value="">All services</option>
            {DEAL_SERVICE_OPTIONS.map((service) => (
              <option key={service} value={service}>{service}</option>
            ))}
          </select>
          <div className="min-w-[220px] max-w-[320px]">
            <TagInput value={filterTags} onChange={setFilterTags} placeholder="Filter by tags..." />
          </div>
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
                className="h-7 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 font-mono text-sm text-[var(--color-text-2)]"
              title="Created from"
            />
            <span className="text-xs text-[var(--color-text-3)]">–</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-7 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 font-mono text-sm text-[var(--color-text-2)]"
              title="Created to"
            />
          </div>
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={expectedCloseFrom}
              onChange={(e) => setExpectedCloseFrom(e.target.value)}
              className="h-7 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 font-mono text-sm text-[var(--color-text-2)]"
              title="Expected close from"
            />
            <span className="text-xs text-[var(--color-text-3)]">–</span>
            <input
              type="date"
              value={expectedCloseTo}
              onChange={(e) => setExpectedCloseTo(e.target.value)}
              className="h-7 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 font-mono text-sm text-[var(--color-text-2)]"
              title="Expected close to"
            />
          </div>
          {(search || ownerFilter || statusFilter || stageFilter || companyFilter || contactFilter || partnerFilter || serviceFilter || filterTags.length > 0 || dateFrom || dateTo || expectedCloseFrom || expectedCloseTo) && (
            <button
              onClick={() => {
                setSearch('');
                setOwnerFilter('');
                setStatusFilter('');
                setStageFilter('');
                setCompanyFilter('');
                setContactFilter('');
                setPartnerFilter('');
                setServiceFilter('');
                setFilterTags([]);
                setDateFrom('');
                setDateTo('');
                setExpectedCloseFrom('');
                setExpectedCloseTo('');
              }}
              className="text-sm text-[var(--color-text-3)] hover:text-[var(--color-text-2)]"
            >
              Clear All
            </button>
          )}
        </div>
      )}

      {selectedDealIds.length > 0 && (
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-accent-soft)] px-6 py-2">
          <span className="text-sm font-medium text-[var(--color-accent)]">{selectedDealIds.length} selected</span>
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
            <option value="">Change lead type / status</option>
            <option value="open">Open</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
            <option value="abandoned">Abandoned</option>
          </select>
          <div className="min-w-[240px] max-w-[320px]">
            <TagInput value={bulkTagsToAdd} onChange={setBulkTagsToAdd} placeholder="Add tags to selected..." />
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={bulkUpdateDeals.isPending || (!bulkOwnerId && !bulkStatus && bulkTagsToAdd.length === 0)}
            onClick={() => bulkUpdateDeals.mutate({
              ids: selectedDealIds,
              data: {
                ...(bulkOwnerId ? { ownerId: bulkOwnerId === '__unassigned__' ? null : bulkOwnerId } : {}),
                ...(bulkStatus ? { status: bulkStatus as 'open' | 'won' | 'lost' | 'abandoned' } : {}),
                ...(bulkTagsToAdd.length > 0 ? { tagIdsToAdd: bulkTagsToAdd.map((tag) => tag.id) } : {}),
              },
            })}
          >
            Apply
          </Button>
          <button onClick={() => setRowSelection({})} className="ml-auto text-sm text-[var(--color-text-2)] hover:text-[var(--color-text-1)]">
            Clear selection
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden bg-[var(--surface-page)]">
        {!selectedPipelineId ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-3)]">
            Select a pipeline
          </div>
        ) : viewMode === 'kanban' ? (
          stages.length > 0 ? (
            <KanbanBoard
              pipelineId={selectedPipelineId}
              stages={stages}
              search={debouncedSearch || undefined}
              extraFilters={dealFilterConditions.length > 0 ? dealFilterConditions : undefined}
              onAddDeal={handleAddDeal}
              onDealClick={(deal) => setSelectedDealId(String(deal.id))}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-3)]">
              No stages in this pipeline.
            </div>
          )
        ) : (
          <DealTable
            pipelineId={selectedPipelineId}
            onDealClick={(dealId) => setSelectedDealId(dealId)}
            search={debouncedSearch || undefined}
            extraFilters={dealFilterConditions.length > 0 ? dealFilterConditions : undefined}
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
          />
        )}
      </div>

      {/* Create Deal */}
      <SlideOverPanel open={createOpen} onClose={() => setCreateOpen(false)} title="Add Deal" width="md">
        <div className="p-6">
          {selectedPipelineId && (
            <DealForm
              pipelineId={selectedPipelineId}
              stageId={createStageId}
              onSuccess={() => setCreateOpen(false)}
              onCancel={() => setCreateOpen(false)}
            />
          )}
        </div>
      </SlideOverPanel>

      {/* Import Wizard */}
      <SlideOverPanel open={importOpen} onClose={() => setImportOpen(false)} title="Import Deals" width="lg">
        {importOpen && (
          <ImportWizard
            entityType="deal"
            pipelineId={selectedPipelineId}
            pipelineName={String(pipelines.find((p) => String(p.id) === selectedPipelineId)?.name ?? '')}
            onClose={() => setImportOpen(false)}
          />
        )}
      </SlideOverPanel>

      {/* Backfill / Re-link Wizard */}
      <SlideOverPanel open={backfillOpen} onClose={() => setBackfillOpen(false)} title="Re-link Contacts & Companies" width="lg">
        {backfillOpen && (
          <BackfillDealLinksWizard
            pipelineId={selectedPipelineId}
            pipelineName={String(pipelines.find((p) => String(p.id) === selectedPipelineId)?.name ?? '')}
            onClose={() => setBackfillOpen(false)}
          />
        )}
      </SlideOverPanel>

      {/* Deal Detail */}
      {selectedDealId && (
        <DealDetail
          dealId={selectedDealId}
          open={!!selectedDealId}
          onClose={() => setSelectedDealId('')}
        />
      )}
    </div>
  );
}

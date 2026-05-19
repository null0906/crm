'use client';

import React from 'react';
import { Search, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useSession } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { dealCreateSchema } from '@/server/lib/validators';
import { CustomFieldRenderer } from '@/components/custom-fields/CustomFieldRenderer';
import { DEAL_SERVICE_OPTIONS } from '@/lib/constants';
import { isDeliveryPipeline } from '@/lib/pipeline-utils';
import type { z } from 'zod';

type FormData = z.infer<typeof dealCreateSchema>;

interface DealFormProps {
  pipelineId: string;
  stageId?: string;
  onSuccess?: (deal: Record<string, unknown>) => void;
  onCancel?: () => void;
  mode?: 'create' | 'edit';
  dealId?: string;
  defaultValues?: Partial<FormData>;
}

export function DealForm({ pipelineId, stageId, onSuccess, onCancel, mode = 'create', dealId, defaultValues }: DealFormProps) {
  const utils = trpc.useUtils();
  const { data: session } = useSession();
  const currentUserId = (session?.user as Record<string, unknown> | undefined)?.id as string | undefined;

  const [customFieldValues, setCustomFieldValues] = React.useState<Record<string, unknown>>({});
  const [contactSearch, setContactSearch] = React.useState('');
  const [companySearch, setCompanySearch] = React.useState('');
  const debouncedContactSearch = React.useDeferredValue(contactSearch.trim());
  const debouncedCompanySearch = React.useDeferredValue(companySearch.trim());

  const { data: pipelineData } = trpc.pipelines.getWithStages.useQuery({ id: pipelineId });
  const { data: customFields = [] } = trpc.customFields.list.useQuery({ entityType: 'deal' });
  const { data: users = [] } = trpc.users.list.useQuery();

  const stages = pipelineData?.stages ?? [];
  const defaultStageId = stageId ?? stages[0]?.id ?? '';
  const pipelineName = String(pipelineData?.name ?? '').toLowerCase();
  const pipelineType = String(pipelineData?.pipelineType ?? (pipelineName.includes('active') ? 'active_delivery' : pipelineName.includes('sales') ? 'sales' : ''));
  const isSalesPipeline = pipelineType === 'sales' || pipelineName.includes('sales');
  const showProjectFields = isDeliveryPipeline(pipelineType);
  const visibleCustomFields = customFields.filter((field) => {
    const section = String((field as Record<string, unknown>).section ?? '');
    const isComplianceSpecific = section === 'SOC 2 Details' || section === 'DPDP Details';
    return !isComplianceSpecific || pipelineType === 'compliance';
  });

  const createDeal = trpc.deals.create.useMutation({
    onSuccess: (data) => {
      toast.success('Prospect created', { description: data.title as string });
      void utils.deals.list.invalidate();
      void utils.deals.byStage.invalidate({ pipelineId });
      onSuccess?.(data as Record<string, unknown>);
    },
    onError: (err) => toast.error('Failed to create prospect', { description: err.message }),
  });

  const updateDeal = trpc.deals.update.useMutation({
    onSuccess: (data) => {
      toast.success('Prospect updated');
      void utils.deals.list.invalidate();
      void utils.deals.byStage.invalidate({ pipelineId });
      if (dealId) void utils.deals.getById.invalidate({ id: dealId });
      onSuccess?.(data as Record<string, unknown>);
    },
    onError: (err) => toast.error('Failed to update prospect', { description: err.message }),
  });

  const form = useForm<FormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(dealCreateSchema) as any,
    defaultValues: {
      pipelineId,
      stageId: defaultStageId,
      currency: 'INR',
      probability: 0,
      status: 'open',
      services: [],
      customFields: {},
      tagIds: [],
      ownerId: currentUserId ?? '',
      ...defaultValues,
    },
  });

  React.useEffect(() => {
    if (mode === 'create' && currentUserId && !defaultValues?.ownerId) {
      form.setValue('ownerId', currentUserId);
    }
  }, [currentUserId, mode, defaultValues?.ownerId, form]);

  // Keep stageId updated when stages load
  React.useEffect(() => {
    if (defaultStageId && !form.getValues('stageId')) {
      form.setValue('stageId', defaultStageId);
    }
  }, [defaultStageId, form]);

  async function onSubmit(data: FormData) {
    if (mode === 'edit' && dealId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await updateDeal.mutateAsync({ id: dealId, data: { ...data, customFields: customFieldValues } as any });
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await createDeal.mutateAsync({ ...data, customFields: customFieldValues } as any);
    }
  }

  const isPending = createDeal.isPending || updateDeal.isPending;
  const selectedServices = form.watch('services') ?? [];
  const showOtherServiceInput = selectedServices.includes('Other');
  const selectedPrimaryContactId = form.watch('primaryContactId');
  const selectedCompanyId = form.watch('companyId');
  const selectedPartnerCompanyId = form.watch('partnerCompanyId');
  const selectedReferredByPartnerId = form.watch('referredByPartnerId');

  const { data: contactsData } = trpc.contacts.list.useQuery({
    search: debouncedContactSearch || undefined,
    pagination: { limit: 50 },
  });
  const { data: companiesData } = trpc.companies.list.useQuery({
    search: debouncedCompanySearch || undefined,
    pagination: { limit: 50 },
  });
  const { data: selectedPrimaryContactData } = trpc.contacts.getById.useQuery(
    { id: String(selectedPrimaryContactId) },
    { enabled: Boolean(selectedPrimaryContactId) }
  );
  const { data: selectedCompanyData } = trpc.companies.getById.useQuery(
    { id: String(selectedCompanyId) },
    { enabled: Boolean(selectedCompanyId) }
  );
  const { data: selectedPartnerCompanyData } = trpc.companies.getById.useQuery(
    { id: String(selectedPartnerCompanyId) },
    { enabled: Boolean(selectedPartnerCompanyId) }
  );
  const { data: selectedReferredPartnerData } = trpc.companies.getById.useQuery(
    { id: String(selectedReferredByPartnerId) },
    { enabled: Boolean(selectedReferredByPartnerId) }
  );

  const contactItems = React.useMemo(() => {
    const items = (contactsData?.items ?? []) as Array<Record<string, unknown>>;
    const merged = [...items];
    if (selectedPrimaryContactData) {
      const alreadyIncluded = items.some((contact) => String(contact.id) === String(selectedPrimaryContactData.id));
      if (!alreadyIncluded) merged.unshift(selectedPrimaryContactData as Record<string, unknown>);
    }
    return merged;
  }, [contactsData?.items, selectedPrimaryContactData]);
  const filteredContactItems = contactItems;
  const selectedPrimaryContact = contactItems.find((contact) => String(contact.id) === String(selectedPrimaryContactId ?? ''));
  const companyItems = React.useMemo(() => {
    const items = (companiesData?.items ?? []) as Array<Record<string, unknown>>;
    const merged = [...items];
    for (const selectedItem of [selectedCompanyData, selectedPartnerCompanyData, selectedReferredPartnerData]) {
      if (!selectedItem) continue;
      const alreadyIncluded = merged.some((company) => String(company.id) === String(selectedItem.id));
      if (!alreadyIncluded) merged.unshift(selectedItem as Record<string, unknown>);
    }
    return merged;
  }, [companiesData?.items, selectedCompanyData, selectedPartnerCompanyData, selectedReferredPartnerData]);
  const filteredCompanyItems = companyItems;
  const selectedCompany = companyItems.find((company) => String(company.id) === String(selectedCompanyId ?? ''));
  const partnerItems = companyItems.filter((company) => String(company.companyType ?? '') === 'partner');
  const selectedPartnerCompany = partnerItems.find((company) => String(company.id) === String(selectedPartnerCompanyId ?? ''));
  const selectedReferredPartner = partnerItems.find((company) => String(company.id) === String(selectedReferredByPartnerId ?? ''));

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="title">Prospect Title *</Label>
        <Input id="title" {...form.register('title')} placeholder="SecComply Enterprise License" />
        {form.formState.errors.title && (
          <p className="text-xs text-red-500">{form.formState.errors.title.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="stageId">Stage</Label>
        <select
          id="stageId"
          {...form.register('stageId')}
          className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {stages.map((s: Record<string, unknown>) => (
            <option key={s.id as string} value={s.id as string}>{s.name as string}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="amount">Prospect Value (₹)</Label>
          <Input
            id="amount"
            type="number"
            min={0}
            step={0.01}
            {...form.register('amount', { valueAsNumber: true })}
            placeholder="500000"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="probability">Probability (%)</Label>
          <Input
            id="probability"
            type="number"
            min={0}
            max={100}
            {...form.register('probability', { valueAsNumber: true })}
            placeholder="50"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="expectedCloseDate">Expected Close Date</Label>
        <Input
          id="expectedCloseDate"
          type="date"
          {...form.register('expectedCloseDate')}
        />
      </div>

      {showProjectFields && (
        <div className="space-y-3 rounded-lg border border-blue-100 bg-blue-50/50 p-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Project Delivery</p>
            <p className="mt-0.5 text-xs text-slate-500">Shown only for Active Delivery and Compliance pipelines.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="projectStartDate">Project Start</Label>
              <Input id="projectStartDate" type="date" {...form.register('projectStartDate')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="projectEndDate">Project End</Label>
              <Input id="projectEndDate" type="date" {...form.register('projectEndDate')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="projectProgressPercent">Progress (%)</Label>
              <Input
                id="projectProgressPercent"
                type="number"
                min={0}
                max={100}
                {...form.register('projectProgressPercent', { valueAsNumber: true })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="revisedEndDate">Revised End</Label>
              <Input id="revisedEndDate" type="date" {...form.register('revisedEndDate')} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              {...form.register('isDelayed')}
              className="h-4 w-4 rounded border-slate-300 text-blue-600"
            />
            Mark project as delayed
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="delayReason">Delay Reason</Label>
            <Textarea id="delayReason" {...form.register('delayReason')} rows={2} placeholder="Why is this delayed?" />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label>Services</Label>
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          {DEAL_SERVICE_OPTIONS.map((service) => {
            const checked = selectedServices.includes(service);
            return (
              <label
                key={service}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${checked ? 'border-blue-200 bg-blue-50 text-blue-900' : 'border-slate-200 bg-white text-slate-700'}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...selectedServices, service]
                      : selectedServices.filter((value) => value !== service);
                    form.setValue('services', next, { shouldDirty: true });
                    if (service === 'Other' && !e.target.checked) {
                      form.setValue('serviceOther', '', { shouldDirty: true });
                    }
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>{service}</span>
              </label>
            );
          })}
        </div>
        {showOtherServiceInput && (
          <div className="space-y-1.5">
            <Label htmlFor="serviceOther">Custom Service</Label>
            <Input
              id="serviceOther"
              {...form.register('serviceOther')}
              placeholder="Add a custom service name"
            />
            {form.formState.errors.serviceOther && (
              <p className="text-xs text-red-500">{form.formState.errors.serviceOther.message}</p>
            )}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="primaryContactId">Primary Contact</Label>
        <input type="hidden" {...form.register('primaryContactId')} />
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <Input
              value={contactSearch}
              onChange={(e) => setContactSearch(e.target.value)}
              placeholder="Search contacts by name or email..."
              className="pl-8 bg-white"
            />
          </div>

          {selectedPrimaryContact && (
            <div className="flex items-center justify-between rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
              <span>
                Selected: {String(selectedPrimaryContact.firstName ?? '')} {String(selectedPrimaryContact.lastName ?? '')}
              </span>
              <button
                type="button"
                onClick={() => form.setValue('primaryContactId', '', { shouldDirty: true })}
                className="text-blue-500 hover:text-blue-700"
                title="Clear selected contact"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="max-h-44 overflow-y-auto rounded-md border border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => form.setValue('primaryContactId', '', { shouldDirty: true })}
              className={`w-full px-3 py-2 text-left text-sm border-b border-slate-100 hover:bg-slate-50 ${!selectedPrimaryContactId ? 'bg-slate-50 font-medium text-slate-900' : 'text-slate-600'}`}
            >
              No primary contact
            </button>
            {filteredContactItems.map((contact) => {
              const isSelected = String(selectedPrimaryContactId ?? '') === String(contact.id);
              return (
                <button
                  key={String(contact.id)}
                  type="button"
                  onClick={() => form.setValue('primaryContactId', String(contact.id), { shouldDirty: true })}
                  className={`w-full px-3 py-2 text-left text-sm border-b border-slate-100 last:border-0 hover:bg-slate-50 ${isSelected ? 'bg-blue-50 text-blue-900 font-medium' : 'text-slate-700'}`}
                >
                  <div>{String(contact.firstName ?? '')} {String(contact.lastName ?? '')}</div>
                  {Boolean(contact.email) && (
                    <div className="text-xs text-slate-400">{String(contact.email ?? '')}</div>
                  )}
                </button>
              );
            })}
            {filteredContactItems.length === 0 && (
              <div className="px-3 py-3 text-sm text-slate-400">No contacts match your search.</div>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="companyId">Company</Label>
        <input type="hidden" {...form.register('companyId')} />
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <Input
              value={companySearch}
              onChange={(e) => setCompanySearch(e.target.value)}
              placeholder="Search companies by name, domain, or industry..."
              className="pl-8 bg-white"
            />
          </div>

          {selectedCompany && (
            <div className="flex items-center justify-between rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
              <span>
                Selected: {String(selectedCompany.name ?? '')}
              </span>
              <button
                type="button"
                onClick={() => form.setValue('companyId', '', { shouldDirty: true })}
                className="text-blue-500 hover:text-blue-700"
                title="Clear selected company"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="max-h-44 overflow-y-auto rounded-md border border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => form.setValue('companyId', '', { shouldDirty: true })}
              className={`w-full px-3 py-2 text-left text-sm border-b border-slate-100 hover:bg-slate-50 ${!selectedCompanyId ? 'bg-slate-50 font-medium text-slate-900' : 'text-slate-600'}`}
            >
              No company
            </button>
            {filteredCompanyItems.map((company) => {
              const isSelected = String(selectedCompanyId ?? '') === String(company.id);
              return (
                <button
                  key={String(company.id)}
                  type="button"
                  onClick={() => form.setValue('companyId', String(company.id), { shouldDirty: true })}
                  className={`w-full px-3 py-2 text-left text-sm border-b border-slate-100 last:border-0 hover:bg-slate-50 ${isSelected ? 'bg-blue-50 text-blue-900 font-medium' : 'text-slate-700'}`}
                >
                  <div>{String(company.name ?? '')}</div>
                  {Boolean(company.domain || company.industry) && (
                    <div className="text-xs text-slate-400">
                      {[String(company.domain ?? ''), String(company.industry ?? '')].filter(Boolean).join(' • ')}
                    </div>
                  )}
                </button>
              );
            })}
            {filteredCompanyItems.length === 0 && (
              <div className="px-3 py-3 text-sm text-slate-400">No companies match your search.</div>
            )}
          </div>
        </div>
      </div>

      {isSalesPipeline && (
        <div className="space-y-1.5">
          <Label htmlFor="partnerCompanyId">Partner</Label>
          <input type="hidden" {...form.register('partnerCompanyId')} />
          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            {selectedPartnerCompany && (
              <div className="flex items-center justify-between rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900">
                <span>Selected partner: {String(selectedPartnerCompany.name ?? '')}</span>
                <button
                  type="button"
                  onClick={() => form.setValue('partnerCompanyId', '', { shouldDirty: true })}
                  className="text-violet-500 hover:text-violet-700"
                  title="Clear selected partner"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => form.setValue('partnerCompanyId', '', { shouldDirty: true })}
                className={`w-full px-3 py-2 text-left text-sm border-b border-slate-100 hover:bg-slate-50 ${!selectedPartnerCompanyId ? 'bg-slate-50 font-medium text-slate-900' : 'text-slate-600'}`}
              >
                No partner
              </button>
              {partnerItems.map((company) => {
                const isSelected = String(selectedPartnerCompanyId ?? '') === String(company.id);
                return (
                  <button
                    key={String(company.id)}
                    type="button"
                    onClick={() => form.setValue('partnerCompanyId', String(company.id), { shouldDirty: true })}
                    className={`w-full px-3 py-2 text-left text-sm border-b border-slate-100 last:border-0 hover:bg-slate-50 ${isSelected ? 'bg-violet-50 text-violet-900 font-medium' : 'text-slate-700'}`}
                  >
                    <div>{String(company.name ?? '')}</div>
                    {Boolean(company.domain) && (
                      <div className="text-xs text-slate-400">{String(company.domain ?? '')}</div>
                    )}
                  </button>
                );
              })}
              {partnerItems.length === 0 && (
                <div className="px-3 py-3 text-sm text-slate-400">No partner companies found.</div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="referredByPartnerId">Referred by Partner</Label>
        <input type="hidden" {...form.register('referredByPartnerId')} />
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          {selectedReferredPartner && (
            <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              <span>Referral partner: {String(selectedReferredPartner.name ?? '')}</span>
              <button
                type="button"
                onClick={() => form.setValue('referredByPartnerId', '', { shouldDirty: true })}
                className="text-emerald-600 hover:text-emerald-700"
                title="Clear referral partner"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => form.setValue('referredByPartnerId', '', { shouldDirty: true })}
              className={`w-full px-3 py-2 text-left text-sm border-b border-slate-100 hover:bg-slate-50 ${!selectedReferredByPartnerId ? 'bg-slate-50 font-medium text-slate-900' : 'text-slate-600'}`}
            >
              No referral partner
            </button>
            {partnerItems.map((company) => {
              const isSelected = String(selectedReferredByPartnerId ?? '') === String(company.id);
              return (
                <button
                  key={String(company.id)}
                  type="button"
                  onClick={() => form.setValue('referredByPartnerId', String(company.id), { shouldDirty: true })}
                  className={`w-full px-3 py-2 text-left text-sm border-b border-slate-100 last:border-0 hover:bg-slate-50 ${isSelected ? 'bg-emerald-50 text-emerald-900 font-medium' : 'text-slate-700'}`}
                >
                  <div>{String(company.name ?? '')}</div>
                  {Boolean(company.domain) && (
                    <div className="text-xs text-slate-400">{String(company.domain ?? '')}</div>
                  )}
                </button>
              );
            })}
            {partnerItems.length === 0 && (
              <div className="px-3 py-3 text-sm text-slate-400">No partner companies found.</div>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ownerId">Owner</Label>
        <select
          id="ownerId"
          {...form.register('ownerId')}
          className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <option value="">Unassigned</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Notes</Label>
        <Textarea
          id="description"
          {...form.register('description')}
          rows={3}
          placeholder="Notes about this prospect..."
        />
      </div>

      {visibleCustomFields.length > 0 && (
        <CustomFieldRenderer
          fields={visibleCustomFields as Parameters<typeof CustomFieldRenderer>[0]['fields']}
          values={customFieldValues}
          onChange={(slug, val) => setCustomFieldValues((prev) => ({ ...prev, [slug]: val }))}
        />
      )}

      <div className="flex items-center gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
        )}
        <Button type="submit" disabled={isPending} className="flex-1">
          {isPending ? (mode === 'edit' ? 'Saving...' : 'Creating...') : (mode === 'edit' ? 'Save Changes' : 'Create Prospect')}
        </Button>
      </div>
    </form>
  );
}

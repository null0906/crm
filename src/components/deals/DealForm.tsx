'use client';

import React from 'react';
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

  const { data: pipelineData } = trpc.pipelines.getWithStages.useQuery({ id: pipelineId });
  const { data: customFields = [] } = trpc.customFields.list.useQuery({ entityType: 'deal' });
  const { data: contactsData } = trpc.contacts.list.useQuery({ pagination: { limit: 200 } });
  const { data: companiesData } = trpc.companies.list.useQuery({ pagination: { limit: 200 } });
  const { data: users = [] } = trpc.users.list.useQuery();

  const stages = pipelineData?.stages ?? [];
  const defaultStageId = stageId ?? stages[0]?.id ?? '';

  const createDeal = trpc.deals.create.useMutation({
    onSuccess: (data) => {
      toast.success('Deal created', { description: data.title as string });
      void utils.deals.list.invalidate();
      void utils.deals.byStage.invalidate({ pipelineId });
      onSuccess?.(data as Record<string, unknown>);
    },
    onError: (err) => toast.error('Failed to create deal', { description: err.message }),
  });

  const updateDeal = trpc.deals.update.useMutation({
    onSuccess: (data) => {
      toast.success('Deal updated');
      void utils.deals.list.invalidate();
      void utils.deals.byStage.invalidate({ pipelineId });
      if (dealId) void utils.deals.getById.invalidate({ id: dealId });
      onSuccess?.(data as Record<string, unknown>);
    },
    onError: (err) => toast.error('Failed to update deal', { description: err.message }),
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

  const contactItems = (contactsData?.items ?? []) as Array<Record<string, unknown>>;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="title">Deal Title *</Label>
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
          <Label htmlFor="amount">Deal Value (₹)</Label>
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

      <div className="space-y-1.5">
        <Label htmlFor="primaryContactId">Primary Contact</Label>
        <select
          id="primaryContactId"
          {...form.register('primaryContactId')}
          className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <option value="">None</option>
          {contactItems.map((c) => (
            <option key={c.id as string} value={c.id as string}>
              {c.firstName as string} {c.lastName as string}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="companyId">Company</Label>
        <select
          id="companyId"
          {...form.register('companyId')}
          className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <option value="">None</option>
          {(companiesData?.items ?? []).map((c) => {
            const company = c as Record<string, unknown>;
            return (
              <option key={company.id as string} value={company.id as string}>{company.name as string}</option>
            );
          })}
        </select>
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
          placeholder="Notes about this deal..."
        />
      </div>

      {customFields.length > 0 && (
        <CustomFieldRenderer
          fields={customFields as Parameters<typeof CustomFieldRenderer>[0]['fields']}
          values={customFieldValues}
          onChange={(slug, val) => setCustomFieldValues((prev) => ({ ...prev, [slug]: val }))}
        />
      )}

      <div className="flex items-center gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
        )}
        <Button type="submit" disabled={isPending} className="flex-1">
          {isPending ? (mode === 'edit' ? 'Saving...' : 'Creating...') : (mode === 'edit' ? 'Save Changes' : 'Create Deal')}
        </Button>
      </div>
    </form>
  );
}

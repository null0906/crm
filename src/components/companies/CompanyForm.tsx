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
import { TagInput } from '@/components/tags/TagInput';
import { CustomFieldRenderer } from '@/components/custom-fields/CustomFieldRenderer';
import { companyCreateSchema } from '@/server/lib/validators';
import type { z } from 'zod';
import { COMPANY_TYPES, COMPANY_SIZES } from '@/lib/constants';

type FormData = z.infer<typeof companyCreateSchema>;

interface CompanyFormProps {
  onSuccess?: (company: Record<string, unknown>) => void;
  onCancel?: () => void;
  defaultValues?: Partial<FormData>;
  mode?: 'create' | 'edit';
  companyId?: string;
  existingTags?: { id: string; name: string; color: string }[];
}

export function CompanyForm({ onSuccess, onCancel, defaultValues, mode = 'create', companyId, existingTags }: CompanyFormProps) {
  const utils = trpc.useUtils();
  const { data: session } = useSession();
  const currentUserId = (session?.user as Record<string, unknown> | undefined)?.id as string | undefined;
  const [tags, setTags] = React.useState<{ id: string; name: string; color: string }[]>(existingTags ?? []);
  const [customFieldValues, setCustomFieldValues] = React.useState<Record<string, unknown>>({});

  const { data: users = [] } = trpc.users.list.useQuery();
  const { data: customFields = [] } = trpc.customFields.list.useQuery({ entityType: 'company' });

  const createCompany = trpc.companies.create.useMutation({
    onSuccess: (data) => {
      toast.success('Company created', { description: `${data.name as string} has been added` });
      void utils.companies.list.invalidate();
      onSuccess?.(data as Record<string, unknown>);
    },
    onError: (err) => toast.error('Failed to create company', { description: err.message }),
  });

  const updateCompany = trpc.companies.update.useMutation({
    onSuccess: (data) => {
      toast.success('Company updated');
      void utils.companies.list.invalidate();
      if (companyId) void utils.companies.getById.invalidate({ id: companyId });
      onSuccess?.(data as Record<string, unknown>);
    },
    onError: (err) => toast.error('Failed to update company', { description: err.message }),
  });

  const addTags = trpc.companies.addTags.useMutation();
  const removeTags = trpc.companies.removeTags.useMutation();

  const form = useForm<FormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(companyCreateSchema) as any,
    defaultValues: {
      companyType: 'prospect',
      status: 'active',
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

  async function onSubmit(data: FormData) {
    if (mode === 'edit' && companyId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await updateCompany.mutateAsync({ id: companyId, data: { ...data, customFields: customFieldValues } as any });
      const existingIds = new Set((existingTags ?? []).map((t) => t.id));
      const newIds = new Set(tags.map((t) => t.id));
      const toAdd = tags.filter((t) => !existingIds.has(t.id)).map((t) => t.id);
      const toRemove = (existingTags ?? []).filter((t) => !newIds.has(t.id)).map((t) => t.id);
      if (toAdd.length) await addTags.mutateAsync({ id: companyId, tagIds: toAdd });
      if (toRemove.length) await removeTags.mutateAsync({ id: companyId, tagIds: toRemove });
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await createCompany.mutateAsync({ ...data, customFields: customFieldValues, tagIds: tags.map((t) => t.id) } as any);
    }
  }

  const isPending = createCompany.isPending || updateCompany.isPending;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">Company Name *</Label>
        <Input id="name" {...form.register('name')} placeholder="Acme Corp" />
        {form.formState.errors.name && (
          <p className="text-xs text-red-500">{form.formState.errors.name.message}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="companyType">Type</Label>
          <select
            id="companyType"
            {...form.register('companyType')}
            className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {COMPANY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="companySize">Company Size</Label>
          <select
            id="companySize"
            {...form.register('companySize')}
            className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <option value="">Select size</option>
            {COMPANY_SIZES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="domain">Domain</Label>
          <Input id="domain" {...form.register('domain')} placeholder="acme.com" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="website">Website</Label>
          <Input id="website" {...form.register('website')} placeholder="https://acme.com" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="industry">Industry</Label>
          <Input id="industry" {...form.register('industry')} placeholder="Financial Services" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" {...form.register('phone')} placeholder="+91 80 1234 5678" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="city">City</Label>
          <Input id="city" {...form.register('city')} placeholder="Mumbai" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="country">Country</Label>
          <Input id="country" {...form.register('country')} placeholder="India" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="annualRevenueRange">Annual Revenue Range</Label>
        <Input
          id="annualRevenueRange"
          {...form.register('annualRevenueRange')}
          placeholder="e.g. ₹1Cr – ₹10Cr"
        />
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
        <Label>Tags</Label>
        <TagInput value={tags} onChange={setTags} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Notes</Label>
        <Textarea
          id="description"
          {...form.register('description')}
          rows={3}
          placeholder="Notes about this company..."
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
          <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isPending} className="flex-1">
          {isPending ? (mode === 'edit' ? 'Saving...' : 'Creating...') : (mode === 'edit' ? 'Save Changes' : 'Create Company')}
        </Button>
      </div>
    </form>
  );
}

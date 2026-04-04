'use client';

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { TagInput } from '@/components/tags/TagInput';
import { CustomFieldRenderer } from '@/components/custom-fields/CustomFieldRenderer';
import { contactCreateSchema } from '@/server/lib/validators';
import type { z as ZodType } from 'zod';

type FormData = ZodType.infer<typeof contactCreateSchema>;

interface ContactFormProps {
  onSuccess?: (contact: Record<string, unknown>) => void;
  onCancel?: () => void;
  defaultValues?: Partial<FormData>;
  compact?: boolean;
  mode?: 'create' | 'edit';
  contactId?: string;
  existingTags?: { id: string; name: string; color: string }[];
}

export function ContactForm({ onSuccess, onCancel, defaultValues, compact = false, mode = 'create', contactId, existingTags }: ContactFormProps) {
  const utils = trpc.useUtils();
  const [tags, setTags] = React.useState<{ id: string; name: string; color: string }[]>(existingTags ?? []);
  const [customFieldValues, setCustomFieldValues] = React.useState<Record<string, unknown>>({});

  const { data: users = [] } = trpc.users.list.useQuery();
  const { data: customFields = [] } = trpc.customFields.list.useQuery({ entityType: 'contact' });

  const createContact = trpc.contacts.create.useMutation({
    onSuccess: (data) => {
      toast.success('Contact created', {
        description: `${data.firstName} ${data.lastName} has been added`,
      });
      void utils.contacts.list.invalidate();
      onSuccess?.(data as Record<string, unknown>);
    },
    onError: (err) => {
      toast.error('Failed to create contact', { description: err.message });
    },
  });

  const updateContact = trpc.contacts.update.useMutation({
    onSuccess: (data) => {
      toast.success('Contact updated');
      void utils.contacts.list.invalidate();
      if (contactId) void utils.contacts.getById.invalidate({ id: contactId });
      onSuccess?.(data as Record<string, unknown>);
    },
    onError: (err) => {
      toast.error('Failed to update contact', { description: err.message });
    },
  });

  const addTags = trpc.contacts.addTags.useMutation();
  const removeTags = trpc.contacts.removeTags.useMutation();

  const form = useForm<FormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(contactCreateSchema) as any,
    defaultValues: {
      status: 'new',
      leadScore: 0,
      customFields: {},
      tagIds: [],
      ...defaultValues,
    },
  });

  async function onSubmit(data: FormData) {
    if (mode === 'edit' && contactId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await updateContact.mutateAsync({ id: contactId, data: { ...data, customFields: customFieldValues } as any });
      // Sync tags: add new ones, remove removed ones
      const existingIds = new Set((existingTags ?? []).map((t) => t.id));
      const newIds = new Set(tags.map((t) => t.id));
      const toAdd = tags.filter((t) => !existingIds.has(t.id)).map((t) => t.id);
      const toRemove = (existingTags ?? []).filter((t) => !newIds.has(t.id)).map((t) => t.id);
      if (toAdd.length) await addTags.mutateAsync({ id: contactId, tagIds: toAdd });
      if (toRemove.length) await removeTags.mutateAsync({ id: contactId, tagIds: toRemove });
    } else {
      await createContact.mutateAsync({
        ...data,
        customFields: customFieldValues,
        tagIds: tags.map((t) => t.id),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    }
  }

  const isPending = createContact.isPending || updateContact.isPending;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      {/* Core fields */}
      <div className={compact ? 'space-y-3' : 'grid grid-cols-2 gap-4'}>
        <div className="space-y-1.5">
          <Label htmlFor="firstName">First Name *</Label>
          <Input
            id="firstName"
            {...form.register('firstName')}
            placeholder="John"
          />
          {form.formState.errors.firstName && (
            <p className="text-xs text-red-500">{form.formState.errors.firstName.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="lastName">Last Name *</Label>
          <Input
            id="lastName"
            {...form.register('lastName')}
            placeholder="Doe"
          />
          {form.formState.errors.lastName && (
            <p className="text-xs text-red-500">{form.formState.errors.lastName.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          {...form.register('email')}
          placeholder="john@company.com"
        />
        {form.formState.errors.email && (
          <p className="text-xs text-red-500">{form.formState.errors.email.message}</p>
        )}
      </div>

      <div className={compact ? 'space-y-3' : 'grid grid-cols-2 gap-4'}>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" {...form.register('phone')} placeholder="+91 98765 43210" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="jobTitle">Job Title</Label>
          <Input id="jobTitle" {...form.register('jobTitle')} placeholder="CISO" />
        </div>
      </div>

      {!compact && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="status">Status</Label>
            <select
              id="status"
              {...form.register('status')}
              className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <option value="new">New</option>
              <option value="contacted">Contacted</option>
              <option value="qualified">Qualified</option>
              <option value="unqualified">Unqualified</option>
              <option value="nurturing">Nurturing</option>
              <option value="converted">Converted</option>
              <option value="lost">Lost</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="source">Source</Label>
            <select
              id="source"
              {...form.register('source')}
              className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <option value="">Select source</option>
              <option value="apollo">Apollo.io</option>
              <option value="manual">Manual</option>
              <option value="website">Website</option>
              <option value="referral">Referral</option>
              <option value="event">Event</option>
              <option value="cold_outreach">Cold Outreach</option>
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
            <Label>Tags</Label>
            <TagInput value={tags} onChange={setTags} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Notes</Label>
            <Textarea id="description" {...form.register('description')} rows={3} placeholder="Any notes about this contact..." />
          </div>
        </>
      )}

      {!compact && customFields.length > 0 && (
        <CustomFieldRenderer
          fields={customFields as Parameters<typeof CustomFieldRenderer>[0]['fields']}
          values={customFieldValues}
          onChange={(slug, val) => setCustomFieldValues((prev) => ({ ...prev, [slug]: val }))}
        />
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isPending} className="flex-1">
          {isPending ? (mode === 'edit' ? 'Saving...' : 'Creating...') : (mode === 'edit' ? 'Save Changes' : 'Create Contact')}
        </Button>
      </div>
    </form>
  );
}

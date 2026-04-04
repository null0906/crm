'use client';

import React, { useState } from 'react';
import { ChevronLeft, Plus, Trash2, FileText } from 'lucide-react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { SlideOverPanel } from '@/components/shared/SlideOverPanel';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { customFieldDefinitionSchema } from '@/server/lib/validators';
import type { z } from 'zod';

type CreateFieldForm = z.infer<typeof customFieldDefinitionSchema>;

const ENTITY_TYPES = ['contact', 'company', 'deal'] as const;
const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Text Area' },
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Dropdown' },
  { value: 'multi_select', label: 'Multi-select' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'url', label: 'URL' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
] as const;

export default function CustomFieldsSettingsPage() {
  const utils = trpc.useUtils();
  const [entityType, setEntityType] = useState<'contact' | 'company' | 'deal'>('contact');
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: fields = [], isLoading } = trpc.customFields.list.useQuery({ entityType });

  const createField = trpc.customFields.create.useMutation({
    onSuccess: () => {
      toast.success('Custom field created');
      setCreateOpen(false);
      void utils.customFields.list.invalidate({ entityType });
    },
    onError: (err) => toast.error('Failed to create field', { description: err.message }),
  });

  const deleteField = trpc.customFields.delete.useMutation({
    onSuccess: () => {
      toast.success('Field deleted');
      setDeleteOpen(false);
      void utils.customFields.list.invalidate({ entityType });
    },
    onError: (err) => toast.error('Failed to delete field', { description: err.message }),
  });

  const form = useForm<CreateFieldForm>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(customFieldDefinitionSchema) as any,
    defaultValues: {
      entityType,
      fieldType: 'text',
      config: {},
      isRequired: false,
      isVisibleInTable: true,
      isVisibleInForm: true,
      isFilterable: true,
      isSearchable: false,
      position: 0,
    },
  });

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/settings" className="text-slate-400 hover:text-slate-600">
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Custom Fields</h1>
            <p className="text-sm text-slate-500">Add fields to contacts, companies, and deals.</p>
          </div>
        </div>
        <Button size="sm" onClick={() => { form.setValue('entityType', entityType); setCreateOpen(true); }}>
          <Plus className="w-4 h-4" />
          Add Field
        </Button>
      </div>

      {/* Entity type tabs */}
      <div className="flex items-center gap-1 px-6 py-3 bg-white border-b border-slate-200">
        {ENTITY_TYPES.map((et) => (
          <button
            key={et}
            className={`text-sm px-3 py-1.5 rounded-md transition-colors capitalize ${entityType === et ? 'bg-blue-500 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            onClick={() => setEntityType(et)}
          >
            {et}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {isLoading ? (
          <div className="text-sm text-slate-400">Loading...</div>
        ) : fields.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48">
            <FileText className="w-8 h-8 text-slate-300 mb-2" />
            <p className="text-sm text-slate-400">No custom fields for {entityType}s yet.</p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
            {(fields as Array<Record<string, unknown>>).map((field) => (
              <div key={field.id as string} className="flex items-center gap-4 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-800">{field.name as string}</p>
                    {!!field.isRequired && <Badge variant="destructive" className="text-xs">Required</Badge>}
                  </div>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">{field.slug as string}</p>
                </div>
                <Badge variant="secondary" className="text-xs">{field.fieldType as string}</Badge>
                <button
                  onClick={() => { setDeleteId(field.id as string); setDeleteOpen(true); }}
                  className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create field panel */}
      <SlideOverPanel open={createOpen} onClose={() => setCreateOpen(false)} title="Add Custom Field" width="md">
        <div className="p-6">
          <form onSubmit={form.handleSubmit((data) => createField.mutate(data))} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Entity Type</Label>
              <select
                {...form.register('entityType')}
                className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {ENTITY_TYPES.map((et) => (
                  <option key={et} value={et} className="capitalize">{et}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>Field Name *</Label>
              <Input {...form.register('name')} placeholder="e.g. Contract Value" />
              {form.formState.errors.name && (
                <p className="text-xs text-red-500">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Field Type</Label>
              <select
                {...form.register('fieldType')}
                className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {FIELD_TYPES.map((ft) => (
                  <option key={ft.value} value={ft.value}>{ft.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input {...form.register('description')} placeholder="Optional description" />
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input type="checkbox" {...form.register('isRequired')} className="rounded" />
                Required
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input type="checkbox" {...form.register('isVisibleInTable')} className="rounded" />
                Show in table
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input type="checkbox" {...form.register('isFilterable')} className="rounded" />
                Filterable
              </label>
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={createField.isPending}>
                {createField.isPending ? 'Creating...' : 'Add Field'}
              </Button>
            </div>
          </form>
        </div>
      </SlideOverPanel>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete custom field?"
        description="This will remove the field and its data from all records. This cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={deleteField.isPending}
        onConfirm={() => deleteField.mutate({ id: deleteId })}
      />
    </div>
  );
}

'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface CustomFieldDef {
  id: string;
  name: string;
  slug: string;
  fieldType: string;
  isRequired: boolean;
  config: Record<string, unknown> | null;
  description: string | null;
}

interface CustomFieldRendererProps {
  fields: CustomFieldDef[];
  values: Record<string, unknown>;
  onChange: (slug: string, value: unknown) => void;
}

export function CustomFieldRenderer({ fields, values, onChange }: CustomFieldRendererProps) {
  if (fields.length === 0) return null;

  return (
    <div className="space-y-3 pt-2 border-t border-slate-100">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Custom Fields</p>
      {fields.map((field) => (
        <CustomFieldInput
          key={field.id}
          field={field}
          value={values[field.slug]}
          onChange={(val) => onChange(field.slug, val)}
        />
      ))}
    </div>
  );
}

interface CustomFieldInputProps {
  field: CustomFieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
}

function CustomFieldInput({ field, value, onChange }: CustomFieldInputProps) {
  const id = `cf_${field.slug}`;
  const config = field.config ?? {};
  // Options can be stored as plain strings OR as {value, label} objects — normalize both
  const rawOptions = (config.options as Array<string | { value: string; label: string }> | undefined) ?? [];
  const options = rawOptions.map((opt) =>
    typeof opt === 'string' ? { value: opt, label: opt } : opt
  );

  const label = (
    <Label htmlFor={id} className="text-sm">
      {field.name}
      {field.isRequired && <span className="text-red-500 ml-0.5">*</span>}
    </Label>
  );

  const description = field.description ? (
    <p className="text-xs text-slate-400 mt-0.5">{field.description}</p>
  ) : null;

  switch (field.fieldType) {
    case 'text':
    case 'email':
    case 'phone':
    case 'url':
      return (
        <div className="space-y-1">
          {label}
          <Input
            id={id}
            type={field.fieldType === 'email' ? 'email' : field.fieldType === 'url' ? 'url' : 'text'}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            required={field.isRequired}
          />
          {description}
        </div>
      );

    case 'textarea':
      return (
        <div className="space-y-1">
          {label}
          <Textarea
            id={id}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
            required={field.isRequired}
            className="resize-none"
          />
          {description}
        </div>
      );

    case 'number':
    case 'currency':
    case 'percentage':
    case 'rating':
      return (
        <div className="space-y-1">
          {label}
          <Input
            id={id}
            type="number"
            min={field.fieldType === 'rating' ? 1 : undefined}
            max={field.fieldType === 'rating' ? 5 : field.fieldType === 'percentage' ? 100 : undefined}
            value={(value as number) ?? ''}
            onChange={(e) => onChange(e.target.valueAsNumber || null)}
            required={field.isRequired}
          />
          {description}
        </div>
      );

    case 'date':
      return (
        <div className="space-y-1">
          {label}
          <Input
            id={id}
            type="date"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            required={field.isRequired}
          />
          {description}
        </div>
      );

    case 'datetime':
      return (
        <div className="space-y-1">
          {label}
          <Input
            id={id}
            type="datetime-local"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            required={field.isRequired}
          />
          {description}
        </div>
      );

    case 'checkbox':
      return (
        <div className="flex items-center gap-2">
          <input
            id={id}
            type="checkbox"
            checked={!!(value as boolean)}
            onChange={(e) => onChange(e.target.checked)}
            className="rounded border-slate-300 w-4 h-4"
            required={field.isRequired}
          />
          {label}
          {description}
        </div>
      );

    case 'select':
      return (
        <div className="space-y-1">
          {label}
          <select
            id={id}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            required={field.isRequired}
            className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <option value="">Select...</option>
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {description}
        </div>
      );

    case 'multi_select': {
      const selected = ((value as string[]) ?? []);
      return (
        <div className="space-y-1">
          {label}
          <div className="flex flex-wrap gap-1.5 p-2 border border-slate-200 rounded-md min-h-[36px]">
            {options.map((opt) => {
              const isSelected = selected.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    const next = isSelected
                      ? selected.filter((s) => s !== opt.value)
                      : [...selected, opt.value];
                    onChange(next);
                  }}
                  className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                    isSelected
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
            {options.length === 0 && (
              <span className="text-xs text-slate-400">No options configured</span>
            )}
          </div>
          {description}
        </div>
      );
    }

    default:
      return (
        <div className="space-y-1">
          {label}
          <Input
            id={id}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
          />
          {description}
        </div>
      );
  }
}

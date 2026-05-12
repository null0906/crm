'use client';

import { Button } from '@/components/ui/button';

export type ClarificationOption = {
  id?: string;
  label: string;
  count?: number;
};

export function ClarificationOptions({
  options,
  onOptionSelect,
  disabled,
}: {
  options: ClarificationOption[];
  onOptionSelect: (label: string) => void;
  disabled?: boolean;
}) {
  if (!options.length) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {options.map((option) => (
        <Button
          key={option.id ?? option.label}
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={() => onOptionSelect(option.label)}
          className="h-8 rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200"
        >
          {option.label}
          {typeof option.count === 'number' ? ` (${option.count})` : ''}
        </Button>
      ))}
    </div>
  );
}

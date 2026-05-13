'use client';

import React, { useState, useRef } from 'react';
import { Plus, Search } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { TagBadge } from './TagBadge';
import { cn } from '@/lib/utils';

interface TagOption {
  id: string;
  name: string;
  color: string;
  categoryId?: string | null;
}

interface TagInputProps {
  value: TagOption[];
  onChange: (tags: TagOption[]) => void;
  placeholder?: string;
  className?: string;
}

export function TagInput({ value, onChange, placeholder = 'Add tag...', className }: TagInputProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: allTags = [] } = trpc.tags.list.useQuery({ search: query || undefined });

  const selectedIds = new Set(value.map((t) => t.id));

  const filteredTags = allTags.filter((t) => !selectedIds.has(t.id));

  function addTag(tag: TagOption) {
    onChange([...value, tag]);
    setQuery('');
    inputRef.current?.focus();
  }

  function removeTag(id: string) {
    onChange(value.filter((t) => t.id !== id));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !query && value.length > 0) {
      removeTag(value[value.length - 1]!.id);
    }
    if (e.key === 'Escape') setOpen(false);
  }

  return (
    <div className={cn('relative', className)}>
      <div
        className="flex min-h-7 cursor-text flex-wrap gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 focus-within:border-[var(--color-border-focus)] focus-within:bg-[var(--color-surface)]"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag) => (
          <TagBadge
            key={tag.id}
            name={tag.name}
            color={tag.color}
            onRemove={() => removeTag(tag.id)}
          />
        ))}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ''}
          className="min-w-20 flex-1 bg-transparent text-sm text-[var(--color-text-1)] outline-none placeholder:text-[var(--color-text-3)]"
        />
      </div>

      {open && (query || filteredTags.length > 0) && (
        <div className="dropdown-panel absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto">
          {filteredTags.length === 0 && (
            <div className="px-3 py-2 text-sm text-[var(--color-text-3)]">
              {query ? `No tags matching "${query}"` : 'No tags available'}
            </div>
          )}
          {filteredTags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              className="dropdown-item w-full text-left"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addTag({ id: tag.id, name: tag.name, color: tag.color ?? 'var(--color-neutral)', categoryId: tag.categoryId })}
            >
              <span
                className="h-2 w-2 flex-shrink-0 rounded-full"
                style={{ backgroundColor: tag.color ?? 'var(--color-neutral)' }}
              />
              {tag.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
        className="flex flex-wrap gap-1 min-h-9 px-2 py-1.5 rounded-md border border-slate-200 bg-white cursor-text focus-within:ring-2 focus-within:ring-blue-500"
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
          className="flex-1 min-w-20 text-xs outline-none bg-transparent placeholder:text-slate-400"
        />
      </div>

      {open && (query || filteredTags.length > 0) && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-y-auto">
          {filteredTags.length === 0 && (
            <div className="px-3 py-2 text-xs text-slate-500">
              {query ? `No tags matching "${query}"` : 'No tags available'}
            </div>
          )}
          {filteredTags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-slate-50 text-left"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addTag({ id: tag.id, name: tag.name, color: tag.color ?? '#6B7280', categoryId: tag.categoryId })}
            >
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: tag.color ?? '#6B7280' }}
              />
              {tag.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Users, Building2, TrendingUp, Search, ArrowRight } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const debouncedQuery = useDebounce(query, 200);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { data: results } = trpc.search.global.useQuery(
    { query: debouncedQuery },
    { enabled: debouncedQuery.length >= 1 }
  );

  const allItems = [
    ...(results?.contacts ?? []).map(c => ({ id: c.id, type: 'contact', title: String(c.title), subtitle: String(c.subtitle ?? '') })),
    ...(results?.companies ?? []).map(c => ({ id: c.id, type: 'company', title: String(c.title), subtitle: String(c.subtitle ?? '') })),
    ...(results?.deals ?? []).map(d => ({ id: d.id, type: 'deal', title: String(d.title), subtitle: String(d.subtitle ?? '') })),
  ];

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 10);
      setQuery('');
      setFocusedIndex(-1);
    }
  }, [open]);

  useEffect(() => {
    setFocusedIndex(-1);
  }, [debouncedQuery]);

  function getEntityHref(type: string, id: string) {
    if (type === 'company') return `/companies/${id}`;
    if (type === 'contact') return `/contacts/${id}`;
    if (type === 'deal') return `/deals/${id}`;
    return '/dashboard';
  }

  function handleSelect(type: string, id: string) {
    onOpenChange(false);
    setQuery('');
    router.push(getEntityHref(type, id));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      onOpenChange(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex(i => Math.min(i + 1, allItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && focusedIndex >= 0) {
      const item = allItems[focusedIndex];
      if (item) handleSelect(item.type, item.id);
    }
  }

  if (!open) return null;

  const contacts = (results?.contacts ?? []).map(c => ({ id: c.id, type: 'contact', title: String(c.title), subtitle: String(c.subtitle ?? '') }));
  const companies = (results?.companies ?? []).map(c => ({ id: c.id, type: 'company', title: String(c.title), subtitle: String(c.subtitle ?? '') }));
  const deals = (results?.deals ?? []).map(d => ({ id: d.id, type: 'deal', title: String(d.title), subtitle: String(d.subtitle ?? '') }));

  const contactsOffset = 0;
  const companiesOffset = contacts.length;
  const dealsOffset = contacts.length + companies.length;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-[3px] animate-fade-in"
        onClick={() => onOpenChange(false)}
      />

      {/* Panel */}
      <div
        className={cn(
          'relative w-full max-w-xl mx-4',
          'bg-white rounded-2xl overflow-hidden',
          'border border-slate-200/60',
          'shadow-[0_32px_80px_rgba(16,24,40,0.18),_0_8px_24px_rgba(16,24,40,0.10)]',
          'animate-scale-in',
        )}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 border-b border-slate-100">
          <Search className="w-4 h-4 text-slate-400 flex-shrink-0" strokeWidth={2} />
          <input
            ref={inputRef}
            className="flex-1 py-4 text-[15px] outline-none placeholder:text-slate-400 bg-transparent text-slate-900 tracking-tight"
            placeholder="Search contacts, companies, deals..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-[11px] text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded-md transition-colors"
            >
              Clear
            </button>
          )}
          <kbd className="text-[10px] bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 text-slate-400 shadow-[0_1px_0_#CDD2DA] leading-none hidden sm:block">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[360px] overflow-y-auto">
          {!debouncedQuery && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Search className="w-8 h-8 text-slate-200 mb-3" />
              <p className="text-[13px] text-slate-400">Search across contacts, companies, and deals</p>
              <p className="text-[11px] text-slate-300 mt-1">Type at least 1 character to start</p>
            </div>
          )}

          {debouncedQuery && results && results.total === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <p className="text-[13px] text-slate-500">No results for <span className="font-medium text-slate-700">"{debouncedQuery}"</span></p>
              <p className="text-[11px] text-slate-400 mt-1">Try a different search term</p>
            </div>
          )}

          {contacts.length > 0 && (
            <ResultGroup
              title="Contacts"
              icon={<Users className="w-3 h-3" strokeWidth={2} />}
              items={contacts}
              onSelect={handleSelect}
              focusedIndex={focusedIndex}
              indexOffset={contactsOffset}
            />
          )}

          {companies.length > 0 && (
            <ResultGroup
              title="Companies"
              icon={<Building2 className="w-3 h-3" strokeWidth={2} />}
              items={companies}
              onSelect={handleSelect}
              focusedIndex={focusedIndex}
              indexOffset={companiesOffset}
            />
          )}

          {deals.length > 0 && (
            <ResultGroup
              title="Deals"
              icon={<TrendingUp className="w-3 h-3" strokeWidth={2} />}
              items={deals}
              onSelect={handleSelect}
              focusedIndex={focusedIndex}
              indexOffset={dealsOffset}
            />
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-4 py-2.5 flex items-center gap-4 bg-slate-50/60">
          <div className="flex items-center gap-3 text-[10px] text-slate-400">
            <span className="flex items-center gap-1"><kbd className="bg-white border border-slate-200 rounded px-1 py-0.5 shadow-[0_1px_0_#CDD2DA]">↑↓</kbd> navigate</span>
            <span className="flex items-center gap-1"><kbd className="bg-white border border-slate-200 rounded px-1 py-0.5 shadow-[0_1px_0_#CDD2DA]">↵</kbd> open</span>
            <span className="flex items-center gap-1"><kbd className="bg-white border border-slate-200 rounded px-1 py-0.5 shadow-[0_1px_0_#CDD2DA]">Esc</kbd> close</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultGroup({
  title,
  icon,
  items,
  onSelect,
  focusedIndex,
  indexOffset,
}: {
  title: string;
  icon: React.ReactNode;
  items: { id: string; type: string; title: string; subtitle: string }[];
  onSelect: (type: string, id: string) => void;
  focusedIndex: number;
  indexOffset: number;
}) {
  const typeIcon: Record<string, React.ReactNode> = {
    contact: <Users className="w-3.5 h-3.5 text-blue-500" strokeWidth={1.75} />,
    company: <Building2 className="w-3.5 h-3.5 text-indigo-500" strokeWidth={1.75} />,
    deal: <TrendingUp className="w-3.5 h-3.5 text-emerald-500" strokeWidth={1.75} />,
  };

  return (
    <div>
      <div className="flex items-center gap-2 px-4 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-[0.06em] bg-slate-50/80 border-b border-slate-100">
        {icon}
        {title}
      </div>
      {items.map((item, i) => {
        const globalIndex = indexOffset + i;
        const isFocused = focusedIndex === globalIndex;
        return (
          <button
            key={item.id}
            className={cn(
              'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors duration-75 border-b border-slate-50 last:border-0',
              isFocused ? 'bg-blue-50' : 'hover:bg-slate-50',
            )}
            onClick={() => onSelect(item.type, item.id)}
          >
            <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
              {typeIcon[item.type]}
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-[13px] font-medium text-slate-800 truncate">{item.title}</span>
              {item.subtitle && (
                <span className="text-[11px] text-slate-400 truncate">{item.subtitle}</span>
              )}
            </div>
            {isFocused && (
              <ArrowRight className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
            )}
          </button>
        );
      })}
    </div>
  );
}

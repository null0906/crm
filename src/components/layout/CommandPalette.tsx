'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, Building2, TrendingUp } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useDebounce } from '@/hooks/useDebounce';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 200);
  const router = useRouter();

  const { data: results } = trpc.search.global.useQuery(
    { query: debouncedQuery },
    { enabled: debouncedQuery.length >= 1 }
  );

  function handleSelect(type: string, id: string) {
    onOpenChange(false);
    setQuery('');
    router.push(`/${type}s/${id}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
        {/* Search input */}
        <div className="flex items-center border-b border-slate-200 px-4">
          <svg className="w-4 h-4 text-slate-400 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            className="flex-1 h-14 text-base outline-none placeholder:text-slate-400 bg-transparent text-slate-900"
            placeholder="Search contacts, companies, deals..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-slate-400 hover:text-slate-600 text-xs bg-slate-100 px-2 py-1 rounded">
              Clear
            </button>
          )}
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto">
          {!debouncedQuery && (
            <div className="p-8 text-center text-sm text-slate-500">
              Start typing to search across contacts, companies, and deals
            </div>
          )}

          {debouncedQuery && results && results.total === 0 && (
            <div className="p-8 text-center text-sm text-slate-500">
              No results found for "{debouncedQuery}"
            </div>
          )}

          {results && results.contacts.length > 0 && (
            <ResultGroup
              title="Contacts"
              icon={<Users className="w-3 h-3" />}
              items={results.contacts.map(c => ({
                id: c.id,
                type: 'contact',
                title: String(c.title),
                subtitle: String(c.subtitle ?? ''),
              }))}
              onSelect={handleSelect}
            />
          )}

          {results && results.companies.length > 0 && (
            <ResultGroup
              title="Companies"
              icon={<Building2 className="w-3 h-3" />}
              items={results.companies.map(c => ({
                id: c.id,
                type: 'company',
                title: String(c.title),
                subtitle: String(c.subtitle ?? ''),
              }))}
              onSelect={handleSelect}
            />
          )}

          {results && results.deals.length > 0 && (
            <ResultGroup
              title="Deals"
              icon={<TrendingUp className="w-3 h-3" />}
              items={results.deals.map(d => ({
                id: d.id,
                type: 'deal',
                title: String(d.title),
                subtitle: String(d.subtitle ?? ''),
              }))}
              onSelect={handleSelect}
            />
          )}
        </div>

        <div className="border-t border-slate-200 px-4 py-2 flex items-center gap-4 text-xs text-slate-400">
          <span>↑↓ Navigate</span>
          <span>↵ Open</span>
          <span>Esc Close</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResultGroup({
  title,
  icon,
  items,
  onSelect,
}: {
  title: string;
  icon: React.ReactNode;
  items: { id: string; type: string; title: string; subtitle: string }[];
  onSelect: (type: string, id: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-500 bg-slate-50 border-b border-slate-100">
        {icon}
        {title}
      </div>
      {items.map((item) => (
        <button
          key={item.id}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50 text-left transition-colors border-b border-slate-50 last:border-0"
          onClick={() => onSelect(item.type, item.id)}
        >
          <div className="flex flex-col">
            <span className="text-sm font-medium text-slate-900">{item.title}</span>
            {item.subtitle && (
              <span className="text-xs text-slate-500">{item.subtitle}</span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

'use client';

import { Sparkles } from 'lucide-react';

export function HighlightsBanner({ highlights }: { highlights: string[] }) {
  const items = highlights.length ? highlights : ['No major highlights detected for this period yet.'];

  return (
    <div className="rounded-2xl border border-[var(--accent-medium)] bg-[var(--accent-light)] p-4 print:border print:bg-white">
      <div className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-[0.08em] text-[var(--accent)]">
        <Sparkles className="h-4 w-4" />
        Highlights
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {items.map((item) => (
          <div
            key={item}
            className="flex shrink-0 items-center gap-2 rounded-full border border-white/80 bg-white/80 px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] shadow-sm"
          >
            <span className="h-1.5 w-1.5 rotate-45 bg-[var(--accent)]" />
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

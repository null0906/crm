'use client';

import { Sparkles } from 'lucide-react';

export function SuggestedQuestions({
  suggestions,
  onSelect,
  disabled,
}: {
  suggestions: string[];
  onSelect: (question: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
        <Sparkles className="h-5 w-5" />
      </div>
      <h2 className="text-sm font-semibold text-slate-900">Ask anything about your CRM data</h2>
      <p className="mt-1 text-xs text-slate-400">Here are some things you can ask:</p>
      <div className="mt-5 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(suggestion)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs leading-5 text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

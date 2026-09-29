'use client';

import type { SaveStatus as Status } from '@/hooks/useAutosave';

/**
 * What happened to the last edit, stated quietly.
 *
 * Deliberately small. Edits save themselves every couple of seconds, so
 * anything louder than this becomes the loudest thing on a screen full of
 * money. Failure is the exception and is reported by a toast as well, because a
 * write that silently did not happen to a financial record is the one outcome
 * nobody may miss.
 */
export function SaveStatus({ status }: { status: Status }) {
  if (status === 'idle') return null;

  if (status === 'error') {
    return <span className="text-[10px] font-medium text-red-600">Not saved</span>;
  }

  return (
    <span className="text-[10px] text-slate-400">
      {status === 'saving' ? 'Saving…' : 'Saved'}
    </span>
  );
}

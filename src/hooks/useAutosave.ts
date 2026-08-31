'use client';

import { useEffect, useRef, useState } from 'react';
import { useDebounce } from './useDebounce';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Whether a debounced draft is worth sending. Pure, and separated from the hook
 * so the rule can be tested without a DOM -- it is the whole point of the
 * feature, and "sends a request only when something changed" is not a claim to
 * take on trust.
 */
export function shouldSave({
  key,
  lastSaved,
  enabled,
  isSaving,
  valid,
}: {
  key: string;
  lastSaved: string;
  enabled: boolean;
  isSaving: boolean;
  valid: boolean;
}): boolean {
  if (!enabled) return false;
  // The whole rule: same value as last sent, nothing to send. This is what makes
  // mounting, an unrelated re-render, and the refetch that follows a save all
  // free rather than each costing a write.
  if (key === lastSaved) return false;
  // Deferred, not dropped -- the caller re-evaluates when the line frees.
  if (isSaving) return false;
  return valid;
}

/**
 * Persists a draft a couple of seconds after the last edit, and only when it
 * actually changed.
 *
 * The change check is the load-bearing part, not an optimisation. A draft is
 * compared by its serialised form against what was last sent, which is what
 * stops three separate ways of firing a pointless write:
 *
 *   - on mount, where the draft equals the server's copy by definition;
 *   - on an unrelated re-render, since a parent re-rendering does not mean the
 *     value moved;
 *   - and above all on the refetch that follows a successful save, whose
 *     response serialises identically to the request that caused it. Without
 *     the check that response would look like a fresh edit and save again,
 *     forever.
 *
 * Typing is not the only thing that must not trigger a write. An estimate is a
 * financial record, so a half-finished draft is never sent: `isValid` holds the
 * write until the value is one somebody would have chosen deliberately.
 */
export function useAutosave<T>({
  value,
  serialise,
  isValid,
  onSave,
  enabled = true,
  isSaving = false,
  isError = false,
  delay = 2000,
}: {
  value: T;
  /** The change key. Two values with the same key are the same edit. */
  serialise: (value: T) => string;
  /** Held back until this passes — a partly-typed number is not an edit yet. */
  isValid?: (value: T) => boolean;
  onSave: (value: T) => void;
  /** False for a frozen estimate: the server refuses, so do not ask. */
  enabled?: boolean;
  /** True while the previous write is in flight. */
  isSaving?: boolean;
  /** Whether the write that just finished failed. */
  isError?: boolean;
  delay?: number;
}): { status: SaveStatus; markSaved: () => void } {
  const key = serialise(value);
  const debouncedKey = useDebounce(key, delay);

  // Seeded with the value present on mount, so arriving at a screen never
  // writes to it.
  const lastSaved = useRef(key);
  const requested = useRef(false);
  const [status, setStatus] = useState<SaveStatus>('idle');

  // Read inside the effect rather than depended on, so that redefining either
  // on every render -- which callers will do -- cannot itself trigger a save.
  const latest = useRef({ value, onSave, isValid });
  latest.current = { value, onSave, isValid };

  useEffect(() => {
    const { value: current, onSave: save, isValid: valid } = latest.current;
    // Validity is checked against the live value rather than the debounced key,
    // because the key is only a fingerprint and validity is a property of the
    // value itself.
    const go = shouldSave({
      key: debouncedKey,
      lastSaved: lastSaved.current,
      enabled,
      isSaving,
      valid: valid ? valid(current) : true,
    });
    if (!go) return;

    // Recorded as sent before the result is known, deliberately. Rolling this
    // back on failure would re-send the same rejected value two seconds later
    // and keep doing so -- against a frozen estimate, forever. The failure is
    // toasted instead, and the next real edit changes the key and tries again.
    lastSaved.current = debouncedKey;
    requested.current = true;
    setStatus('saving');
    save(current);
  }, [debouncedKey, enabled, isSaving]);

  // Resolved on the falling edge of isSaving, not on its absence: the mutation
  // has not started yet in the commit where save() was called, so "not saving"
  // at that moment means "not started", not "finished".
  const wasSaving = useRef(isSaving);
  useEffect(() => {
    if (wasSaving.current && !isSaving && requested.current) {
      requested.current = false;
      setStatus(isError ? 'error' : 'saved');
    }
    wasSaving.current = isSaving;
  }, [isSaving, isError]);

  // 'error' is left on screen rather than faded: it is the one state worth
  // still seeing a minute later.
  useEffect(() => {
    if (status !== 'saved') return;
    const t = setTimeout(() => setStatus('idle'), 2500);
    return () => clearTimeout(t);
  }, [status]);

  return {
    status,
    /**
     * Adopt the current value as saved without writing it. For changes that
     * arrive from the server rather than from the person — seeding roles from a
     * baseline — where echoing them straight back would be a pointless write.
     */
    markSaved: () => {
      lastSaved.current = serialise(latest.current.value);
    },
  };
}

import { describe, expect, it } from 'vitest';
import { shouldSave } from './useAutosave';

/**
 * The rule that decides whether an edit becomes a request.
 *
 * Worth pinning on its own because the failure it prevents is invisible: a save
 * that fires when nothing changed costs a write to a financial record and, in
 * the refetch case, does it again on the response it just caused.
 */
const base = { key: 'b', lastSaved: 'a', enabled: true, isSaving: false, valid: true };

describe('shouldSave', () => {
  it('sends a changed, valid draft', () => {
    expect(shouldSave(base)).toBe(true);
  });

  it('sends nothing when the value is what was last sent', () => {
    // Mounting, and every re-render that does not move the value.
    expect(shouldSave({ ...base, key: 'a' })).toBe(false);
  });

  it('sends nothing when the value is edited and put back', () => {
    // 60 -> 80 -> 60 leaves the key where it started, so there is no edit.
    expect(shouldSave({ ...base, key: 'a', lastSaved: 'a' })).toBe(false);
  });

  it('does not re-send the response to its own save', () => {
    // The refetch after a write pushes the server's copy back down. It
    // serialises to what was just sent, so it must not look like a fresh edit —
    // otherwise each save causes the next, forever.
    const justSent = 'hours=80';
    expect(shouldSave({ ...base, key: justSent, lastSaved: justSent })).toBe(false);
  });

  it('holds an invalid draft rather than persisting it', () => {
    expect(shouldSave({ ...base, valid: false })).toBe(false);
  });

  it('waits while a write is already in flight', () => {
    expect(shouldSave({ ...base, isSaving: true })).toBe(false);
  });

  it('sends the deferred edit once the line frees', () => {
    // Same differing key, no longer saving: the edit made mid-flight is sent
    // rather than dropped.
    expect(shouldSave({ ...base, isSaving: false })).toBe(true);
  });

  it('never writes to a frozen estimate', () => {
    expect(shouldSave({ ...base, enabled: false })).toBe(false);
  });

  it('refuses on any single failing condition', () => {
    expect(shouldSave({ ...base, enabled: false, valid: false, isSaving: true })).toBe(false);
  });
});

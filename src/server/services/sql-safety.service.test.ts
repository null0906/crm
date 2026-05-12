import { describe, expect, it } from 'vitest';
import { validateGeneratedSql } from './sql-safety.service';

describe('validateGeneratedSql', () => {
  it('allows valid SELECT statements', () => {
    expect(validateGeneratedSql('SELECT id, first_name FROM contacts WHERE deleted_at IS NULL')).toEqual({ valid: true });
  });

  it('rejects mutation attempts', () => {
    expect(validateGeneratedSql('SELECT * FROM contacts; DELETE FROM contacts;')).toMatchObject({
      valid: false,
    });
  });

  it('rejects system table access', () => {
    expect(validateGeneratedSql('SELECT * FROM information_schema.tables')).toEqual({
      valid: false,
      reason: 'System table access not permitted',
    });
  });

  it('rejects password field access', () => {
    expect(validateGeneratedSql('SELECT password_hash FROM users')).toEqual({
      valid: false,
      reason: 'Sensitive field access not permitted',
    });
  });
});

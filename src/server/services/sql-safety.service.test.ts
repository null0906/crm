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

  it('rejects raw SQL against salary-derived cost tables', () => {
    expect(validateGeneratedSql('SELECT * FROM resource_cost_components')).toEqual({
      valid: false,
      reason: 'Cost and estimate data is not available through raw SQL',
    });
  });

  it('rejects cost tables reached through a join', () => {
    expect(
      validateGeneratedSql(
        'SELECT u.first_name, c.amount_per_week FROM users u JOIN resource_cost_components c ON c.user_id = u.id'
      )
    ).toMatchObject({ valid: false });
  });

  it('rejects cost tables reached through a CTE', () => {
    expect(
      validateGeneratedSql('WITH r AS (SELECT * FROM gnr_policies) SELECT * FROM r')
    ).toMatchObject({ valid: false });
  });

  it('rejects estimate tables', () => {
    expect(validateGeneratedSql('SELECT total_delivery_cost FROM estimates')).toMatchObject({
      valid: false,
    });
  });

  it('does not block unrelated tables whose names merely contain a restricted word', () => {
    // Word-boundary matching, not substring: `estimates` the table is blocked,
    // `estimated_value` the column is not.
    expect(validateGeneratedSql('SELECT estimated_value FROM deals')).toEqual({ valid: true });
  });

  it('still allows ordinary business queries', () => {
    expect(
      validateGeneratedSql("SELECT stage_id, COUNT(*) FROM deals WHERE status = 'open' GROUP BY stage_id")
    ).toEqual({ valid: true });
  });
});

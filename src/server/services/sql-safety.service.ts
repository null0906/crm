import { Parser } from 'node-sql-parser';
import { sql as drizzleSql, type SQLWrapper } from 'drizzle-orm';

type ExecutableDb = {
  execute: (query: string | SQLWrapper) => unknown;
};

const parser = new Parser();
const dangerousKeywords = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'TRUNCATE', 'ALTER', 'CREATE', 'GRANT', 'REVOKE'];
const systemTables = ['pg_', 'information_schema', 'auth.', 'nextauth'];

function normalizeSql(sql: string): string {
  return sql.trim();
}

function stripTrailingSemicolon(sql: string): string {
  return sql.replace(/;+\s*$/, '').trim();
}

export function validateGeneratedSql(sql: string): { valid: boolean; reason?: string } {
  const trimmedSql = normalizeSql(sql);
  const upperSql = trimmedSql.toUpperCase();
  const lowerSql = trimmedSql.toLowerCase();

  // WITH ... SELECT (CTEs) are a normal, safe read-only pattern the model reaches for
  // constantly (e.g. multi-step aggregations like win-rate calculations) — reject only if
  // the statement doesn't ultimately resolve to a single SELECT, which the AST check below
  // (and the keyword blacklist, which runs regardless of prefix) still enforce either way.
  if (!upperSql.startsWith('SELECT') && !upperSql.startsWith('WITH')) {
    return { valid: false, reason: 'Only SELECT queries are permitted' };
  }

  for (const keyword of dangerousKeywords) {
    if (new RegExp(`\\b${keyword}\\b`, 'i').test(trimmedSql)) {
      return { valid: false, reason: `Prohibited keyword: ${keyword}` };
    }
  }

  for (const table of systemTables) {
    if (lowerSql.includes(table)) {
      return { valid: false, reason: 'System table access not permitted' };
    }
  }

  if (lowerSql.includes('password')) {
    return { valid: false, reason: 'Sensitive field access not permitted' };
  }

  try {
    const ast = parser.astify(trimmedSql, { database: 'postgresql' });
    const statements = Array.isArray(ast) ? ast : [ast];
    if (statements.length !== 1 || statements.some((statement) => statement.type !== 'select')) {
      return { valid: false, reason: 'Only SELECT queries are permitted' };
    }
  } catch {
    return { valid: false, reason: 'SQL could not be parsed safely' };
  }

  return { valid: true };
}

const ROW_CAP = 500;

export interface SafeQueryResult {
  rows: any[];
  /** True if the result set was larger than ROW_CAP and got truncated. */
  truncated: boolean;
  /** The true matching row count. Only computed (and only trustworthy) when truncated is true. */
  totalCount?: number;
}

function extractRows(result: unknown): any[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === 'object' && 'rows' in result && Array.isArray((result as { rows: unknown }).rows)) {
    return (result as { rows: any[] }).rows;
  }
  return [];
}

export async function executeSafeQuery(db: ExecutableDb, sql: string): Promise<SafeQueryResult> {
  const strippedSql = stripTrailingSemicolon(sql);
  // Fetch one row past the cap so truncation can be detected, instead of silently reporting
  // a capped sample size as if it were the true total (e.g. "there are 500 leads" when the
  // real count is 921).
  const boundedSql = `SELECT * FROM (${strippedSql}) AS ai_safe_query LIMIT ${ROW_CAP + 1}`;

  await db.execute(drizzleSql.raw('SET statement_timeout = 5000'));

  try {
    const result = await db.execute(drizzleSql.raw(boundedSql));
    const fetchedRows = extractRows(result);
    const truncated = fetchedRows.length > ROW_CAP;
    const rows = truncated ? fetchedRows.slice(0, ROW_CAP) : fetchedRows;

    let totalCount: number | undefined;
    if (truncated) {
      try {
        const countResult = await db.execute(
          drizzleSql.raw(`SELECT COUNT(*)::int AS total FROM (${strippedSql}) AS ai_safe_query_count`)
        );
        const countRows = extractRows(countResult);
        const rawTotal = (countRows[0] as { total?: number } | undefined)?.total;
        totalCount = typeof rawTotal === 'number' ? rawTotal : undefined;
      } catch (error) {
        // Non-fatal — the caller falls back to "more than 500" phrasing when totalCount is missing.
        console.error('[SQL Safety] Failed to compute true total after truncation:', error);
      }
    }

    return { rows, truncated, totalCount };
  } finally {
    try {
      await db.execute(drizzleSql.raw('RESET statement_timeout'));
    } catch (error) {
      console.error('[SQL Safety] Failed to reset statement_timeout:', error);
    }
  }
}

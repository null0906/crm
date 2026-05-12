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

  if (!upperSql.startsWith('SELECT')) {
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

export async function executeSafeQuery(db: ExecutableDb, sql: string): Promise<any[]> {
  const strippedSql = stripTrailingSemicolon(sql);
  const boundedSql = `SELECT * FROM (${strippedSql}) AS ai_safe_query LIMIT 500`;

  await db.execute(drizzleSql.raw('SET statement_timeout = 5000'));

  try {
    const result = await db.execute(drizzleSql.raw(boundedSql));
    if (Array.isArray(result)) return result;
    if (result && typeof result === 'object' && 'rows' in result && Array.isArray((result as { rows: unknown }).rows)) {
      return (result as { rows: any[] }).rows;
    }
    return [];
  } finally {
    try {
      await db.execute(drizzleSql.raw('RESET statement_timeout'));
    } catch (error) {
      console.error('[SQL Safety] Failed to reset statement_timeout:', error);
    }
  }
}

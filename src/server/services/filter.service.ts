import { and, or, eq, ne, ilike, gt, gte, lt, lte, inArray, notInArray, isNull, isNotNull, SQL, sql } from 'drizzle-orm';
import type { FilterConfig, FilterCondition } from '@/lib/types';
import { contacts } from '@/server/db/schema/contacts';
import { companies } from '@/server/db/schema/companies';
import { deals } from '@/server/db/schema/deals';

type EntityTable = typeof contacts | typeof companies | typeof deals;

// Map table column names to their Drizzle column objects
const columnMaps: Record<string, Record<string, SQL | ((val: unknown) => SQL)>> = {};

function getColumn(entity: string, field: string): SQL | null {
  // Handle custom fields (jsonb path)
  if (field.startsWith('custom_fields.')) {
    const cfKey = field.replace('custom_fields.', '');
    const tableMap: Record<string, string> = { contact: 'contacts', company: 'companies', deal: 'deals' };
    const table = tableMap[entity] ?? entity;
    return sql.raw(`"${table}"."custom_fields"->>'${cfKey}'`);
  }

  // Map camelCase field names to column references
  const entityCols: Record<string, Record<string, SQL>> = {
    contact: {
      status: sql`contacts.status`,
      ownerId: sql`contacts.owner_id`,
      companyId: sql`contacts.company_id`,
      source: sql`contacts.source`,
      leadScore: sql`contacts.lead_score`,
      createdAt: sql`contacts.created_at`,
      lastContactedAt: sql`contacts.last_contacted_at`,
      firstName: sql`contacts.first_name`,
      lastName: sql`contacts.last_name`,
      email: sql`contacts.email`,
      country: sql`contacts.country`,
    },
    company: {
      status: sql`companies.status`,
      ownerId: sql`companies.owner_id`,
      industry: sql`companies.industry`,
      companyType: sql`companies.company_type`,
      companySize: sql`companies.company_size`,
      country: sql`companies.country`,
      createdAt: sql`companies.created_at`,
    },
    deal: {
      status: sql`deals.status`,
      ownerId: sql`deals.owner_id`,
      pipelineId: sql`deals.pipeline_id`,
      stageId: sql`deals.stage_id`,
      companyId: sql`deals.company_id`,
      partnerCompanyId: sql`deals.partner_company_id`,
      amount: sql`deals.amount`,
      probability: sql`deals.probability`,
      expectedCloseDate: sql`deals.expected_close_date`,
      createdAt: sql`deals.created_at`,
    },
  };

  return entityCols[entity]?.[field] ?? null;
}

function buildCondition(entity: string, condition: FilterCondition, userId?: string): SQL | null {
  const { field, operator, value } = condition;

  // Handle tags filter specially
  if (field === 'tags') {
    const junctionTable = `${entity}_tags`;
    if (operator === 'contains_any' && Array.isArray(value)) {
      const ids = value.map((v) => `'${v}'`).join(', ');
      return sql.raw(`EXISTS (SELECT 1 FROM ${junctionTable} WHERE ${junctionTable}.${entity}_id = ${entity}s.id AND ${junctionTable}.tag_id IN (${ids}))`);
    }
    if (operator === 'contains_all' && Array.isArray(value)) {
      const ids = value.map((v) => `'${v}'`).join(', ');
      return sql.raw(`(SELECT COUNT(*) FROM ${junctionTable} WHERE ${junctionTable}.${entity}_id = ${entity}s.id AND ${junctionTable}.tag_id IN (${ids})) = ${value.length}`);
    }
    if (operator === 'not_in' && Array.isArray(value)) {
      const ids = value.map((v) => `'${v}'`).join(', ');
      return sql.raw(`NOT EXISTS (SELECT 1 FROM ${junctionTable} WHERE ${junctionTable}.${entity}_id = ${entity}s.id AND ${junctionTable}.tag_id IN (${ids}))`);
    }
    if (operator === 'is_empty') {
      return sql.raw(`NOT EXISTS (SELECT 1 FROM ${junctionTable} WHERE ${junctionTable}.${entity}_id = ${entity}s.id)`);
    }
    if (operator === 'is_not_empty') {
      return sql.raw(`EXISTS (SELECT 1 FROM ${junctionTable} WHERE ${junctionTable}.${entity}_id = ${entity}s.id)`);
    }
    return null;
  }

  const col = getColumn(entity, field);
  if (!col) return null;

  const resolvedValue = operator === 'current_user' ? userId : value;

  switch (operator) {
    case 'eq':
    case 'current_user':
      return sql`${col} = ${resolvedValue}`;
    case 'neq':
      return sql`${col} != ${resolvedValue}`;
    case 'contains':
      return sql`${col} ILIKE ${'%' + String(resolvedValue) + '%'}`;
    case 'not_contains':
      return sql`${col} NOT ILIKE ${'%' + String(resolvedValue) + '%'}`;
    case 'starts_with':
      return sql`${col} ILIKE ${String(resolvedValue) + '%'}`;
    case 'ends_with':
      return sql`${col} ILIKE ${'%' + String(resolvedValue)}`;
    case 'gt':
      return sql`${col} > ${resolvedValue}`;
    case 'gte':
      return sql`${col} >= ${resolvedValue}`;
    case 'lt':
      return sql`${col} < ${resolvedValue}`;
    case 'lte':
      return sql`${col} <= ${resolvedValue}`;
    case 'in':
      if (Array.isArray(resolvedValue)) {
        const vals = resolvedValue.map((v) => sql`${v}`);
        return sql`${col} IN (${sql.join(vals, sql`, `)})`;
      }
      return null;
    case 'not_in':
      if (Array.isArray(resolvedValue)) {
        const vals = resolvedValue.map((v) => sql`${v}`);
        return sql`${col} NOT IN (${sql.join(vals, sql`, `)})`;
      }
      return null;
    case 'is_empty':
      return sql`${col} IS NULL`;
    case 'is_not_empty':
      return sql`${col} IS NOT NULL`;
    case 'between':
      if (Array.isArray(resolvedValue) && resolvedValue.length === 2) {
        return sql`${col} BETWEEN ${resolvedValue[0]} AND ${resolvedValue[1]}`;
      }
      return null;
    default:
      return null;
  }
}

export function buildFilterWhere(filters: FilterConfig, entity: string, userId?: string): SQL | null {
  const conditions = filters.conditions
    .map((c) => buildCondition(entity, c, userId))
    .filter((c): c is SQL => c !== null);

  if (!conditions.length) return null;

  if (filters.logic === 'OR') {
    return sql`(${sql.join(conditions, sql` OR `)})`;
  }
  return sql`(${sql.join(conditions, sql` AND `)})`;
}

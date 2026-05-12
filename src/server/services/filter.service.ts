import { SQL, sql } from 'drizzle-orm';
import type { FilterConfig, FilterCondition } from '@/lib/types';

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
      companyName: sql`contacts.company_name`,
      source: sql`contacts.source`,
      leadScore: sql`contacts.lead_score`,
      createdAt: sql`contacts.created_at`,
      lastContactedAt: sql`contacts.last_contacted_at`,
      firstName: sql`contacts.first_name`,
      lastName: sql`contacts.last_name`,
      email: sql`contacts.email`,
      phone: sql`contacts.phone`,
      mobile: sql`contacts.mobile`,
      jobTitle: sql`contacts.job_title`,
      department: sql`contacts.department`,
      city: sql`contacts.city`,
      state: sql`contacts.state`,
      postalCode: sql`contacts.postal_code`,
      country: sql`contacts.country`,
      location: sql`contacts.location`,
    },
    company: {
      status: sql`companies.status`,
      ownerId: sql`companies.owner_id`,
      name: sql`companies.name`,
      domain: sql`companies.domain`,
      industry: sql`companies.industry`,
      subIndustry: sql`companies.sub_industry`,
      companyType: sql`companies.company_type`,
      companySize: sql`companies.company_size`,
      annualRevenueRange: sql`companies.annual_revenue_range`,
      city: sql`companies.city`,
      state: sql`companies.state`,
      postalCode: sql`companies.postal_code`,
      country: sql`companies.country`,
      location: sql`companies.location`,
      createdAt: sql`companies.created_at`,
    },
    deal: {
      title: sql`deals.title`,
      status: sql`deals.status`,
      ownerId: sql`deals.owner_id`,
      pipelineId: sql`deals.pipeline_id`,
      stageId: sql`deals.stage_id`,
      companyId: sql`deals.company_id`,
      primaryContactId: sql`deals.primary_contact_id`,
      partnerCompanyId: sql`deals.partner_company_id`,
      amount: sql`deals.amount`,
      currency: sql`deals.currency`,
      probability: sql`deals.probability`,
      expectedCloseDate: sql`deals.expected_close_date`,
      createdAt: sql`deals.created_at`,
      services: sql`deals.services::text`,
    },
  };

  return entityCols[entity]?.[field] ?? null;
}

function buildTagSources(entity: string): SQL[] {
  switch (entity) {
    case 'contact':
      return [
        sql.raw(`SELECT contact_tags.tag_id AS tag_id FROM contact_tags WHERE contact_tags.contact_id = contacts.id`),
        sql.raw(`SELECT company_tags.tag_id AS tag_id FROM company_tags WHERE company_tags.company_id = contacts.company_id`),
        sql.raw(`SELECT deal_tags.tag_id AS tag_id FROM deals d INNER JOIN deal_tags ON deal_tags.deal_id = d.id WHERE d.primary_contact_id = contacts.id`),
        sql.raw(`SELECT deal_tags.tag_id AS tag_id FROM deal_contacts dc INNER JOIN deal_tags ON deal_tags.deal_id = dc.deal_id WHERE dc.contact_id = contacts.id`),
      ];
    case 'company':
      return [
        sql.raw(`SELECT company_tags.tag_id AS tag_id FROM company_tags WHERE company_tags.company_id = companies.id`),
        sql.raw(`SELECT contact_tags.tag_id AS tag_id FROM contacts c INNER JOIN contact_tags ON contact_tags.contact_id = c.id WHERE c.company_id = companies.id`),
        sql.raw(`SELECT deal_tags.tag_id AS tag_id FROM deals d INNER JOIN deal_tags ON deal_tags.deal_id = d.id WHERE d.company_id = companies.id OR d.partner_company_id = companies.id`),
      ];
    case 'deal':
      return [
        sql.raw(`SELECT deal_tags.tag_id AS tag_id FROM deal_tags WHERE deal_tags.deal_id = deals.id`),
        sql.raw(`SELECT company_tags.tag_id AS tag_id FROM company_tags WHERE company_tags.company_id = deals.company_id OR company_tags.company_id = deals.partner_company_id`),
        sql.raw(`SELECT contact_tags.tag_id AS tag_id FROM contact_tags WHERE contact_tags.contact_id = deals.primary_contact_id`),
        sql.raw(`SELECT contact_tags.tag_id AS tag_id FROM deal_contacts dc INNER JOIN contact_tags ON contact_tags.contact_id = dc.contact_id WHERE dc.deal_id = deals.id`),
      ];
    default: {
      const entityTableNames: Record<string, string> = {
        contact: 'contacts',
        company: 'companies',
        deal: 'deals',
      };
      const junctionTable = `${entity}_tags`;
      const entityTable = entityTableNames[entity] ?? `${entity}s`;
      return [
        sql.raw(`SELECT ${junctionTable}.tag_id AS tag_id FROM ${junctionTable} WHERE ${junctionTable}.${entity}_id = ${entityTable}.id`),
      ];
    }
  }
}

function buildTagRelation(entity: string): SQL {
  const sources = buildTagSources(entity);
  return sql`(${sql.join(sources, sql.raw(' UNION ALL '))}) AS tag_links`;
}

function buildCondition(entity: string, condition: FilterCondition, userId?: string): SQL | null {
  const { field, operator, value } = condition;

  // Handle tags filter specially
  if (field === 'tags') {
    const tagRelation = buildTagRelation(entity);
    if (operator === 'contains_any' && Array.isArray(value)) {
      const ids = value.map((v) => sql`${v}`);
      return sql`EXISTS (SELECT 1 FROM ${tagRelation} WHERE tag_links.tag_id IN (${sql.join(ids, sql`, `)}))`;
    }
    if (operator === 'contains_all' && Array.isArray(value)) {
      const uniqueValues = [...new Set(value)];
      const ids = uniqueValues.map((v) => sql`${v}`);
      return sql`(SELECT COUNT(DISTINCT tag_links.tag_id) FROM ${tagRelation} WHERE tag_links.tag_id IN (${sql.join(ids, sql`, `)})) = ${uniqueValues.length}`;
    }
    if (operator === 'not_in' && Array.isArray(value)) {
      const ids = value.map((v) => sql`${v}`);
      return sql`NOT EXISTS (SELECT 1 FROM ${tagRelation} WHERE tag_links.tag_id IN (${sql.join(ids, sql`, `)}))`;
    }
    if (operator === 'is_empty') {
      return sql`NOT EXISTS (SELECT 1 FROM ${tagRelation})`;
    }
    if (operator === 'is_not_empty') {
      return sql`EXISTS (SELECT 1 FROM ${tagRelation})`;
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

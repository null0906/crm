import { z } from 'zod';
import { tool, type ToolSet } from 'ai';
import { db as defaultDb } from '@/server/db';
import { executeSafeQuery, validateGeneratedSql } from '@/server/services/sql-safety.service';
import { writeAuditLog } from '@/server/services/audit.service';
import type { SessionUser } from '@/lib/types';

type DbClient = typeof defaultDb;

// Kept intentionally terse (table + key columns only, one line each) — this text is sent to
// the model on every single turn regardless of whether run_custom_query ends up used, and
// tool-schema token overhead is the dominant cost of each request against Groq's per-minute
// token caps. Full column-level detail isn't needed here: the model can infer standard columns
// (id, created_at, name-ish fields) and the curated tools cover the common cases anyway.
const SCHEMA_REFERENCE = `
contacts(id, first_name, last_name, email, company_id, source, status, lead_score, owner_id, deleted_at)
companies(id, name, domain, industry, company_type, owner_id, status, deleted_at)
deals="Prospects"(id, title, pipeline_id, stage_id, amount, currency, probability, status, primary_contact_id, company_id, owner_id, created_by, deleted_at)
deal_team_members(deal_id, user_id, role) — extra assigned users beyond owner; deal_contacts(deal_id, contact_id, role) — extra linked contacts
deals_with_value — view, use for ANY revenue/value query; effective_value coalesces onboarding amount with deals.amount
activities(id, activity_type, subject, contact_id, company_id, deal_id, performed_by, occurred_at, is_automated, deleted_at)
tags(id, name, category_id), tag_categories(id, name), contact_tags/company_tags/deal_tags(entity_id, tag_id)
users(id, first_name, last_name, email, role_id, status), roles(id, name, slug)
pipelines(id, name, pipeline_type, is_sales_pipeline), pipeline_stages(id, pipeline_id, name, position, stage_type)
deal_stage_history(deal_id, from_stage_id, to_stage_id, entered_at, exited_at, moved_by) — for time-in-stage/velocity questions
pipeline_benchmarks(pipeline_id, stage_id, avg_days_in_stage, sample_size) — precomputed stage velocity, check here first
onboardings(id, deal_id, stage, status, engagement_amount, engagement_currency, owner_id)
projects(id, name, company_id, owner_id, created_by, status, stage, start_date, end_date, deleted_at); project_members(project_id, user_id, role)
Only contacts/companies/activities/deals/projects have deleted_at.
`.trim();

/**
 * Last-resort raw-SQL tool for questions no curated tool covers. Reuses sql-safety.service.ts's
 * existing validator/executor (AST-checked SELECT-only, 500-row safety cap with real-count
 * fallback, 5s statement timeout) unchanged. Analyst-role scoping is enforced here via regex
 * injection into the WHERE clause, since arbitrary model-authored SQL can't be scoped by a
 * trusted service function the way the curated tools are.
 */
function applyProspectVisibilityToGeneratedSql(query: string, user: SessionUser): string {
  if (user.role.slug !== 'sales_rep' || !/\b(from|join)\s+deals\b/i.test(query)) return query;
  const filter = `(deals.owner_id = '${user.id}' OR deals.created_by = '${user.id}' OR deals.id IN (SELECT deal_id FROM deal_team_members WHERE user_id = '${user.id}'))`;
  if (/\bwhere\b/i.test(query)) return query.replace(/\bwhere\b/i, `WHERE ${filter} AND `);
  const boundary = query.match(/\b(group by|order by|having|limit)\b/i);
  return boundary ? query.replace(boundary[0], `WHERE ${filter} ${boundary[0]}`) : `${query} WHERE ${filter}`;
}

// Row-level ownership scoping (above) can't safely prevent an Analyst from writing an
// aggregate/value query (SUM(effective_value), deals_with_value, etc.) — unlike the curated
// get_pipeline_value/list_prospects/get_prospect tools, which have amount-masking baked into
// their own service functions, arbitrary model-authored SQL has no such guarantee. Block
// financial-keyword queries outright for Analysts rather than trying to regex-rewrite away
// dollar amounts, which can't be done reliably against arbitrary SQL.
const FINANCIAL_KEYWORD_PATTERN = /\b(amount|effective_value|engagement_amount|deals_with_value|weighted|revenue)\b/i;

function isForbiddenFinancialQuery(query: string, user: SessionUser): boolean {
  return user.role.slug === 'sales_rep' && FINANCIAL_KEYWORD_PATTERN.test(query);
}

export function createEscapeHatchTools(user: SessionUser, sessionId: string, db: DbClient = defaultDb): ToolSet {
  return {
    run_custom_query: tool({
      description: `Last resort: read-only SQL SELECT, only when no curated tool covers the question. SELECT/WITH only. Add deleted_at IS NULL for contacts/companies/activities/deals/projects. Use deals_with_value.effective_value, never deals.amount. Parenthesize mixed AND/OR: "a AND (b OR c)". Analyst callers are auto-scoped regardless of what you write. Errors are returned to you for one retry.
${SCHEMA_REFERENCE}`,
      inputSchema: z.object({
        sql: z.string().describe('One read-only SELECT or WITH...SELECT statement'),
        explanation: z.string().describe('One sentence: what this answers'),
      }),
      execute: async ({ sql, explanation }) => {
        if (isForbiddenFinancialQuery(sql, user)) {
          await writeAuditLog({
            userId: user.id,
            action: 'api_access',
            entityType: 'ai_chat',
            entityId: sessionId,
            entityName: 'Blocked Analyst financial query',
            metadata: { sql },
          });
          return {
            error: 'Prospect amounts, pipeline value, and revenue are restricted for your Analyst role. Use get_pipeline_value or list_prospects instead — they already exclude this data for you.',
            sql,
          };
        }

        const scopedSql = applyProspectVisibilityToGeneratedSql(sql, user);
        const validation = validateGeneratedSql(scopedSql);
        if (!validation.valid) {
          await writeAuditLog({
            userId: user.id,
            action: 'api_access',
            entityType: 'ai_chat',
            entityId: sessionId,
            entityName: 'Rejected AI SQL',
            metadata: { reason: validation.reason, sql: scopedSql },
          });
          return { error: `Query rejected: ${validation.reason}`, sql: scopedSql };
        }

        try {
          const { rows, truncated, totalCount } = await executeSafeQuery(db, scopedSql);
          return {
            explanation,
            rowCount: rows.length,
            truncated,
            trueTotalCount: truncated ? totalCount : undefined,
            rows: rows.slice(0, 100),
            sql: scopedSql,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await writeAuditLog({
            userId: user.id,
            action: 'api_access',
            entityType: 'ai_chat',
            entityId: sessionId,
            entityName: 'AI SQL execution failed',
            metadata: { reason: message, sql: scopedSql },
          });
          return { error: message, sql: scopedSql };
        }
      },
    }),
  };
}

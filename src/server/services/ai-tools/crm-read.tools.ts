import { z } from 'zod';
import { tool, type ToolSet } from 'ai';
import type { SessionUser, FilterConfig } from '@/lib/types';
import { listContacts, getContactsByCompany, getContactById } from '@/server/services/contact.service';
import { listCompanies, getCompanyById } from '@/server/services/company.service';
import { listDeals, getDealsByStage, getDealById, getDealsByContact, getDealsByCompany } from '@/server/services/deal.service';

const contactStatuses = ['new', 'contacted', 'qualified', 'unqualified', 'nurturing', 'converted', 'lost', 'archived'] as const;
const companyStatuses = ['active', 'inactive', 'churned', 'archived'] as const;
const companyTypes = ['prospect', 'customer', 'partner', 'vendor', 'competitor', 'other'] as const;
const dealStatuses = ['open', 'won', 'lost', 'abandoned'] as const;

function eqFilter(field: string, value: string): FilterConfig {
  return { conditions: [{ field, operator: 'eq', value }], logic: 'AND' };
}

// listDeals/getDealsByStage return ~40 columns per row (project-delivery fields, snapshot
// fields, etc.) meant for the full Prospect detail page. Feeding that width back to the model
// for every row in a list is a large, mostly-irrelevant token cost against Groq's per-minute
// budget — trim to what a conversational answer actually needs. get_prospect (single-record
// lookup) still returns the full row.
//
// listDeals/getDealsByStage's own maskDealAmountForUser only nulls `amount`, not
// `effectiveValue` — since this tool is a new consumer of `effectiveValue` (the existing UI
// doesn't render it outside one dashboard widget), mask it here too rather than assume the
// upstream function already covers a field it was never exercised against for Analyst users.
function pickDealSummary(row: Record<string, unknown>, user: SessionUser): Record<string, unknown> {
  const { id, title, effectiveValue, currency, probability, status, expectedCloseDate, companyName, stageName, ownerName, primaryContactName, createdAt } = row;
  const hideAmounts = user.role.slug === 'sales_rep';
  return { id, title, effectiveValue: hideAmounts ? null : effectiveValue, currency, probability, status, expectedCloseDate, companyName, stageName, ownerName, primaryContactName, createdAt };
}

function pickContactSummary(row: Record<string, unknown>): Record<string, unknown> {
  const { id, firstName, lastName, email, phone, jobTitle, status, companyName, ownerFirstName, ownerLastName, lastContactedAt, createdAt } = row;
  return { id, firstName, lastName, email, phone, jobTitle, status, companyName, ownerFirstName, ownerLastName, lastContactedAt, createdAt };
}

/**
 * Every tool here closes over `user` and calls the same RBAC-scoped service functions the
 * REST/tRPC routers use — ownership filtering, "own" vs "team" vs "all" read levels, and
 * (for prospects) Analyst amount-masking are all enforced inside the wrapped function itself,
 * not re-implemented here. `user` is never a tool parameter the model can set.
 */
export function createCrmReadTools(user: SessionUser): ToolSet {
  return {
    list_contacts: tool({
      description: 'List/search contacts (people), filterable by status or company.',
      inputSchema: z.object({
        search: z.string().nullish().describe('name/email/phone/title search'),
        status: z.enum(contactStatuses).nullish(),
        companyId: z.string().uuid().nullish(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
      execute: async ({ search, status, companyId, limit }) => {
        const conditions: FilterConfig['conditions'] = [];
        if (status) conditions.push({ field: 'status', operator: 'eq', value: status });
        if (companyId) conditions.push({ field: 'companyId', operator: 'eq', value: companyId });
        const filters = conditions.length ? { conditions, logic: 'AND' as const } : undefined;

        const result = await listContacts(user, { search: search ?? undefined, filters, pagination: { limit } });
        return { items: result.items.map(pickContactSummary), hasMore: result.hasMore, count: result.items.length };
      },
    }),

    get_contact: tool({
      description: 'Get full details for one contact by ID.',
      inputSchema: z.object({ contactId: z.string().uuid() }),
      execute: async ({ contactId }) => {
        const contact = await getContactById(user, contactId);
        return contact ?? { found: false, reason: 'No contact with that ID, or you do not have access to it.' };
      },
    }),

    get_contacts_by_company: tool({
      description: 'List contacts at a specific company.',
      inputSchema: z.object({ companyId: z.string().uuid() }),
      execute: async ({ companyId }) => {
        const items = await getContactsByCompany(user, companyId);
        return { items, count: items.length };
      },
    }),

    list_companies: tool({
      description: 'List/search companies, filterable by status or type.',
      inputSchema: z.object({
        search: z.string().nullish().describe('name/domain/industry search'),
        status: z.enum(companyStatuses).nullish(),
        companyType: z.enum(companyTypes).nullish(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
      execute: async ({ search, status, companyType, limit }) => {
        const conditions: FilterConfig['conditions'] = [];
        if (status) conditions.push({ field: 'status', operator: 'eq', value: status });
        if (companyType) conditions.push({ field: 'companyType', operator: 'eq', value: companyType });
        const filters = conditions.length ? { conditions, logic: 'AND' as const } : undefined;

        const result = await listCompanies(user, { search: search ?? undefined, filters, pagination: { limit } });
        return { items: result.items, hasMore: result.hasMore, count: result.items.length };
      },
    }),

    get_company: tool({
      description: 'Get full details for one company by ID, including roll-up metrics.',
      inputSchema: z.object({ companyId: z.string().uuid() }),
      execute: async ({ companyId }) => {
        const company = await getCompanyById(user, companyId);
        return company ?? { found: false, reason: 'No company with that ID, or you do not have access to it.' };
      },
    }),

    list_prospects: tool({
      description: 'List/search Prospects (deals/pipeline records — say "Prospect" not "deal"), filterable by status or pipeline. Analyst callers auto-scoped to their own, amounts auto-hidden.',
      inputSchema: z.object({
        search: z.string().nullish().describe('title/company/contact search'),
        status: z.enum(dealStatuses).nullish(),
        pipelineId: z.string().uuid().nullish(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
      execute: async ({ search, status, pipelineId, limit }) => {
        const filters = status ? eqFilter('status', status) : undefined;
        const result = await listDeals(user, { search: search ?? undefined, filters, pagination: { limit }, pipelineId: pipelineId ?? undefined });
        return { items: result.items.map((row) => pickDealSummary(row, user)), hasMore: result.hasMore, count: result.items.length };
      },
    }),

    get_prospect: tool({
      description: 'Get full details for one Prospect by ID.',
      inputSchema: z.object({ prospectId: z.string().uuid() }),
      execute: async ({ prospectId }) => {
        const deal = await getDealById(user, prospectId);
        return deal ?? { found: false, reason: 'No prospect with that ID, or you do not have access to it.' };
      },
    }),

    get_prospects_by_stage: tool({
      description: 'Get Prospects in a pipeline grouped by stage (funnel view).',
      inputSchema: z.object({
        pipelineId: z.string().uuid(),
        search: z.string().nullish(),
      }),
      execute: async ({ pipelineId, search }) => {
        const grouped = await getDealsByStage(user, pipelineId, { search: search ?? undefined });
        const stages = Object.fromEntries(
          Object.entries(grouped).map(([stageId, rows]) => [stageId, rows.map((row) => pickDealSummary(row as Record<string, unknown>, user))])
        );
        return { stages };
      },
    }),

    get_prospects_by_company: tool({
      description: 'List Prospects for a specific company.',
      inputSchema: z.object({ companyId: z.string().uuid() }),
      execute: async ({ companyId }) => {
        const items = await getDealsByCompany(user, companyId);
        return { items, count: items.length };
      },
    }),

    get_prospects_by_contact: tool({
      description: 'List Prospects for a specific contact.',
      inputSchema: z.object({ contactId: z.string().uuid() }),
      execute: async ({ contactId }) => {
        const items = await getDealsByContact(user, contactId);
        return { items, count: items.length };
      },
    }),
  };
}

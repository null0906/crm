import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../router';
import { db } from '@/server/db';
import { companies, contacts, deals, pipelineStages, pipelines } from '@/server/db/schema';
import { and, asc, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { getProspectVisibilityFilter } from '@/server/lib/visibility-filters';

const SALES_PIPELINE_KEYWORDS = ['sales'];

function maskDealAmountsForRole<T extends Record<string, unknown>>(roleSlug: string | undefined, rows: T[]): T[] {
  if (roleSlug !== 'sales_rep') return rows;
  return rows.map((row) => ({ ...row, amount: null }));
}

function salesPipelineCondition() {
  return or(...SALES_PIPELINE_KEYWORDS.map((keyword) => ilike(pipelines.name, `%${keyword}%`)))!;
}

export const partnerRouter = router({
  dealsByPartner: protectedProcedure
    .input(z.object({ partnerCompanyId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await db
        .select({
          id: deals.id,
          title: deals.title,
          amount: deals.amount,
          currency: deals.currency,
          status: deals.status,
          companyId: deals.companyId,
          companyName: companies.name,
          stageName: pipelineStages.name,
          partnerCompanyId: deals.partnerCompanyId,
          createdAt: deals.createdAt,
        })
        .from(deals)
        .innerJoin(pipelines, eq(deals.pipelineId, pipelines.id))
        .leftJoin(companies, eq(deals.companyId, companies.id))
        .leftJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
        .where(and(
          isNull(deals.deletedAt),
          eq(deals.partnerCompanyId, input.partnerCompanyId),
          salesPipelineCondition(),
          getProspectVisibilityFilter(ctx.user),
        ))
        .orderBy(desc(deals.createdAt));
      return maskDealAmountsForRole(ctx.user.role.slug, rows);
    }),

  contactsByPartner: protectedProcedure
    .input(z.object({ partnerCompanyId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return db
        .select({
          id: contacts.id,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
          jobTitle: contacts.jobTitle,
        })
        .from(contacts)
        .where(and(
          isNull(contacts.deletedAt),
          eq(contacts.companyId, input.partnerCompanyId),
        ))
        .orderBy(asc(contacts.firstName), asc(contacts.lastName));
    }),

  availableSalesDeals: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      partnerCompanyId: z.string().uuid().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const conditions = [
        isNull(deals.deletedAt),
        salesPipelineCondition(),
        getProspectVisibilityFilter(ctx.user),
      ];

      if (input.search?.trim()) {
        const q = `%${input.search.trim()}%`;
        conditions.push(or(
          ilike(deals.title, q),
          sql`${deals.id}::text ILIKE ${q}`,
        )!);
      }

      const rows = await db
        .select({
          id: deals.id,
          title: deals.title,
          amount: deals.amount,
          currency: deals.currency,
          status: deals.status,
          companyName: companies.name,
          stageName: pipelineStages.name,
          partnerCompanyId: deals.partnerCompanyId,
        })
        .from(deals)
        .innerJoin(pipelines, eq(deals.pipelineId, pipelines.id))
        .leftJoin(companies, eq(deals.companyId, companies.id))
        .leftJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
        .where(and(...conditions))
        .orderBy(desc(deals.createdAt))
        .limit(50);

      return maskDealAmountsForRole(ctx.user.role.slug, rows.filter((row) =>
        !row.partnerCompanyId || row.partnerCompanyId === input.partnerCompanyId
      ));
    }),

  attachDeal: protectedProcedure
    .input(z.object({
      partnerCompanyId: z.string().uuid(),
      dealId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [partnerCompany] = await db
        .select({
          id: companies.id,
          companyType: companies.companyType,
          deletedAt: companies.deletedAt,
        })
        .from(companies)
        .where(eq(companies.id, input.partnerCompanyId))
        .limit(1);

      if (!partnerCompany || partnerCompany.deletedAt) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Partner company not found' });
      }

      if (partnerCompany.companyType !== 'partner') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only partner companies can own partner-linked prospects' });
      }

      const [dealRow] = await db
        .select({
          id: deals.id,
          deletedAt: deals.deletedAt,
          pipelineName: pipelines.name,
          partnerCompanyId: deals.partnerCompanyId,
        })
        .from(deals)
        .innerJoin(pipelines, eq(deals.pipelineId, pipelines.id))
        .where(and(eq(deals.id, input.dealId), getProspectVisibilityFilter(ctx.user)))
        .limit(1);

      if (!dealRow || dealRow.deletedAt) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Prospect not found' });
      }

      if (!dealRow.pipelineName.toLowerCase().includes('sales')) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only sales pipeline prospects can be attached to a partner' });
      }

      if (dealRow.partnerCompanyId && dealRow.partnerCompanyId !== input.partnerCompanyId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This prospect is already attached to another partner' });
      }

      const [updated] = await db
        .update(deals)
        .set({
          partnerCompanyId: input.partnerCompanyId,
          updatedAt: new Date(),
        })
        .where(eq(deals.id, input.dealId))
        .returning();

      return updated;
    }),

  referredLeads: protectedProcedure
    .input(z.object({ partnerCompanyId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Contacts referred by this partner
      const referredContacts = await db
        .select({
          id: contacts.id,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
          jobTitle: contacts.jobTitle,
          status: contacts.status,
          referralDate: contacts.referralDate,
          companyName: companies.name,
          companyId: contacts.companyId,
        })
        .from(contacts)
        .leftJoin(companies, eq(contacts.companyId, companies.id))
        .where(and(
          isNull(contacts.deletedAt),
          eq(contacts.referredByPartnerId, input.partnerCompanyId),
        ))
        .orderBy(desc(contacts.createdAt));

      // Deals referred by this partner
      const referredDeals = await db
        .select({
          id: deals.id,
          title: deals.title,
          amount: deals.amount,
          currency: deals.currency,
          status: deals.status,
          stageName: pipelineStages.name,
          companyName: companies.name,
          createdAt: deals.createdAt,
        })
        .from(deals)
        .leftJoin(companies, eq(deals.companyId, companies.id))
        .leftJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
        .where(and(
          isNull(deals.deletedAt),
          eq(deals.referredByPartnerId, input.partnerCompanyId),
          getProspectVisibilityFilter(ctx.user),
        ))
        .orderBy(desc(deals.createdAt));

      return { contacts: referredContacts, deals: maskDealAmountsForRole(ctx.user.role.slug, referredDeals) };
    }),

  attributionStats: protectedProcedure
    .input(z.object({ partnerCompanyId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [contactStats] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(contacts)
        .where(and(
          isNull(contacts.deletedAt),
          eq(contacts.referredByPartnerId, input.partnerCompanyId),
        ));

      const dealRows = await db
        .select({
          status: deals.status,
          amount: sql<string>`COALESCE((SELECT o.engagement_amount FROM onboardings o WHERE o.deal_id = ${deals.id} AND o.status != 'cancelled' LIMIT 1), ${deals.amount}, 0)::text`,
          currency: deals.currency,
        })
        .from(deals)
        .where(and(
          isNull(deals.deletedAt),
          eq(deals.referredByPartnerId, input.partnerCompanyId),
          getProspectVisibilityFilter(ctx.user),
        ));

      const openDeals  = dealRows.filter((d) => d.status === 'open');
      const wonDeals   = dealRows.filter((d) => d.status === 'won');
      const wonRevenue = wonDeals.reduce((sum, d) => sum + (parseFloat(String(d.amount ?? '0')) || 0), 0);
      const pipeline   = openDeals.reduce((sum, d) => sum + (parseFloat(String(d.amount ?? '0')) || 0), 0);
      const currency   = dealRows[0]?.currency ?? 'INR';

      return {
        referredLeads:   contactStats?.total ?? 0,
        openDeals:       openDeals.length,
        wonDeals:        wonDeals.length,
        wonRevenue: ctx.user.role.slug === 'sales_rep' ? null : wonRevenue,
        pipeline: ctx.user.role.slug === 'sales_rep' ? null : pipeline,
        currency,
      };
    }),
});

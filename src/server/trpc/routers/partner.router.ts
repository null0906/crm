import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../router';
import { db } from '@/server/db';
import { companies, contacts, deals, pipelineStages, pipelines } from '@/server/db/schema';
import { and, asc, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';

const SALES_PIPELINE_KEYWORDS = ['sales'];

function salesPipelineCondition() {
  return or(...SALES_PIPELINE_KEYWORDS.map((keyword) => ilike(pipelines.name, `%${keyword}%`)))!;
}

export const partnerRouter = router({
  dealsByPartner: protectedProcedure
    .input(z.object({ partnerCompanyId: z.string().uuid() }))
    .query(async ({ input }) => {
      return db
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
        ))
        .orderBy(desc(deals.createdAt));
    }),

  contactsByPartner: protectedProcedure
    .input(z.object({ partnerCompanyId: z.string().uuid() }))
    .query(async ({ input }) => {
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
    .query(async ({ input }) => {
      const conditions = [
        isNull(deals.deletedAt),
        salesPipelineCondition(),
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

      return rows.filter((row) =>
        !row.partnerCompanyId || row.partnerCompanyId === input.partnerCompanyId
      );
    }),

  attachDeal: protectedProcedure
    .input(z.object({
      partnerCompanyId: z.string().uuid(),
      dealId: z.string().uuid(),
    }))
    .mutation(async ({ input }) => {
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
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only partner companies can own partner-linked deals' });
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
        .where(eq(deals.id, input.dealId))
        .limit(1);

      if (!dealRow || dealRow.deletedAt) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Deal not found' });
      }

      if (!dealRow.pipelineName.toLowerCase().includes('sales')) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only sales pipeline deals can be attached to a partner' });
      }

      if (dealRow.partnerCompanyId && dealRow.partnerCompanyId !== input.partnerCompanyId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This deal is already attached to another partner' });
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
});

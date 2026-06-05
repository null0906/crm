import { z } from 'zod';
import { router, protectedProcedure } from '../router';
import { db } from '@/server/db';
import { contacts, companies, deals, activities } from '@/server/db/schema';
import { and, isNull, ilike, or, sql } from 'drizzle-orm';

export const searchRouter = router({
  global: protectedProcedure
    .input(z.object({ query: z.string().min(1).max(200) }))
    .query(async ({ ctx, input }) => {
      const canViewDealAmounts = ctx.user.role.slug !== 'sales_rep';
      const searchTokens = input.query
        .trim()
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean);

      const q = `%${input.query.trim()}%`;
      const contactTokenConditions = searchTokens.map((token) => {
        const tokenPattern = `%${token}%`;
        return or(
          ilike(contacts.firstName, tokenPattern),
          ilike(contacts.lastName, tokenPattern),
          ilike(contacts.email, tokenPattern),
          ilike(contacts.phone, tokenPattern),
          ilike(sql<string>`concat(${contacts.firstName}, ' ', ${contacts.lastName})`, tokenPattern)
        )!;
      });
      const companyTokenConditions = searchTokens.map((token) => {
        const tokenPattern = `%${token}%`;
        return or(
          ilike(companies.name, tokenPattern),
          ilike(companies.domain, tokenPattern),
          ilike(companies.industry, tokenPattern)
        )!;
      });
      const dealTokenConditions = searchTokens.map((token) => {
        const tokenPattern = `%${token}%`;
        return or(
          ilike(deals.title, tokenPattern),
          ilike(deals.status, tokenPattern),
          sql`${deals.id}::text ILIKE ${tokenPattern}`
        )!;
      });

      const [contactResults, companyResults, dealResults] = await Promise.all([
        db
          .select({
            id: contacts.id,
            type: sql<'contact'>`'contact'`,
            title: sql<string>`contacts.first_name || ' ' || contacts.last_name`,
            subtitle: contacts.email,
            meta: contacts.jobTitle,
          })
          .from(contacts)
          .where(
            and(
              isNull(contacts.deletedAt),
              ...(contactTokenConditions.length > 0
                ? [and(...contactTokenConditions)!]
                : [
                    or(
                      ilike(contacts.firstName, q),
                      ilike(contacts.lastName, q),
                      ilike(contacts.email, q),
                      ilike(contacts.phone, q),
                      ilike(sql<string>`concat(${contacts.firstName}, ' ', ${contacts.lastName})`, q)
                    )!,
                  ])
            )
          )
          .limit(5),

        db
          .select({
            id: companies.id,
            type: sql<'company'>`'company'`,
            title: companies.name,
            subtitle: companies.domain,
            meta: companies.industry,
          })
          .from(companies)
          .where(
            and(
              isNull(companies.deletedAt),
              ...(companyTokenConditions.length > 0
                ? [and(...companyTokenConditions)!]
                : [
                    or(
                      ilike(companies.name, q),
                      ilike(companies.domain, q),
                      ilike(companies.industry, q)
                    )!,
                  ])
            )
          )
          .limit(5),

        db
          .select({
            id: deals.id,
            type: sql<'deal'>`'deal'`,
            title: deals.title,
            subtitle: deals.status,
            meta: deals.amount,
          })
          .from(deals)
          .where(
            and(
              isNull(deals.deletedAt),
              ...(dealTokenConditions.length > 0
                ? [and(...dealTokenConditions)!]
                : [ilike(deals.title, q)])
            )
          )
          .limit(5),
      ]);

      return {
        contacts: contactResults,
        companies: companyResults,
        deals: canViewDealAmounts
          ? dealResults
          : dealResults.map((deal) => ({ ...deal, meta: null })),
        total: contactResults.length + companyResults.length + dealResults.length,
      };
    }),
});

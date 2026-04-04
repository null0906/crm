import { z } from 'zod';
import { router, protectedProcedure } from '../router';
import { db } from '@/server/db';
import { contacts, companies, deals, activities } from '@/server/db/schema';
import { and, isNull, ilike, or, sql } from 'drizzle-orm';

export const searchRouter = router({
  global: protectedProcedure
    .input(z.object({ query: z.string().min(1).max(200) }))
    .query(async ({ input }) => {
      const q = `%${input.query.trim()}%`;

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
              or(
                ilike(contacts.firstName, q),
                ilike(contacts.lastName, q),
                ilike(contacts.email, q),
                ilike(contacts.phone, q)
              )
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
              or(
                ilike(companies.name, q),
                ilike(companies.domain, q)
              )
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
              ilike(deals.title, q)
            )
          )
          .limit(5),
      ]);

      return {
        contacts: contactResults,
        companies: companyResults,
        deals: dealResults,
        total: contactResults.length + companyResults.length + dealResults.length,
      };
    }),
});

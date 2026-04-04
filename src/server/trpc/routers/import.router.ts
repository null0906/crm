import { z } from 'zod';
import { router, protectedProcedure } from '../router';
import * as contactService from '@/server/services/contact.service';
import * as companyService from '@/server/services/company.service';
import { db } from '@/server/db';
import { contacts } from '@/server/db/schema';
import { eq } from 'drizzle-orm';

const contactRowSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  jobTitle: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  status: z.enum(['new', 'contacted', 'qualified', 'unqualified', 'nurturing', 'converted', 'lost', 'archived']).default('new'),
  source: z.enum(['apollo', 'manual', 'website', 'referral', 'event', 'cold_outreach']).optional(),
  description: z.string().optional().nullable(),
});

const companyRowSchema = z.object({
  name: z.string().min(1),
  domain: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  industry: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  companyType: z.enum(['prospect', 'customer', 'partner', 'vendor', 'competitor', 'other']).optional().nullable(),
  description: z.string().optional().nullable(),
});

export const importRouter = router({
  contacts: protectedProcedure
    .input(z.object({
      rows: z.array(z.record(z.string(), z.string())).min(1).max(1000),
      columnMap: z.record(z.string(), z.string()), // csvHeader -> contactField
      skipDuplicates: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      let created = 0;
      let skipped = 0;
      const errors: Array<{ row: number; message: string }> = [];

      for (let i = 0; i < input.rows.length; i++) {
        const raw = input.rows[i]!;
        // Map CSV columns to contact fields
        const mapped: Record<string, string> = {};
        for (const [csvCol, contactField] of Object.entries(input.columnMap)) {
          if (raw[csvCol] !== undefined) mapped[contactField] = raw[csvCol]!;
        }

        const parsed = contactRowSchema.safeParse({
          firstName: mapped.firstName ?? '',
          lastName: mapped.lastName ?? '',
          email: mapped.email || null,
          phone: mapped.phone || null,
          jobTitle: mapped.jobTitle || null,
          department: mapped.department || null,
          city: mapped.city || null,
          country: mapped.country || null,
          status: mapped.status || 'new',
          source: (mapped.source as 'manual') || 'manual',
          description: mapped.description || null,
        });

        if (!parsed.success) {
          errors.push({ row: i + 2, message: parsed.error.issues[0]?.message ?? 'Invalid data' });
          skipped++;
          continue;
        }

        // Duplicate check on email
        if (input.skipDuplicates && parsed.data.email) {
          const existing = await db
            .select({ id: contacts.id })
            .from(contacts)
            .where(eq(contacts.email, parsed.data.email))
            .limit(1);
          if (existing.length > 0) {
            skipped++;
            continue;
          }
        }

        try {
          await contactService.createContact(ctx.user!, {
            ...parsed.data,
            customFields: {},
          });
          created++;
        } catch (err) {
          errors.push({ row: i + 2, message: err instanceof Error ? err.message : 'Unknown error' });
          skipped++;
        }
      }

      return { created, skipped, errors };
    }),

  companies: protectedProcedure
    .input(z.object({
      rows: z.array(z.record(z.string(), z.string())).min(1).max(1000),
      columnMap: z.record(z.string(), z.string()),
      skipDuplicates: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      let created = 0;
      let skipped = 0;
      const errors: Array<{ row: number; message: string }> = [];

      for (let i = 0; i < input.rows.length; i++) {
        const raw = input.rows[i]!;
        const mapped: Record<string, string> = {};
        for (const [csvCol, companyField] of Object.entries(input.columnMap)) {
          if (raw[csvCol] !== undefined) mapped[companyField] = raw[csvCol]!;
        }

        const parsed = companyRowSchema.safeParse({
          name: mapped.name ?? '',
          domain: mapped.domain || null,
          website: mapped.website || null,
          industry: mapped.industry || null,
          city: mapped.city || null,
          country: mapped.country || null,
          phone: mapped.phone || null,
          companyType: (mapped.companyType as 'prospect') || null,
          description: mapped.description || null,
        });

        if (!parsed.success) {
          errors.push({ row: i + 2, message: parsed.error.issues[0]?.message ?? 'Invalid data' });
          skipped++;
          continue;
        }

        try {
          await companyService.createCompany(ctx.user!, {
            ...parsed.data,
            status: 'active',
            customFields: {},
          });
          created++;
        } catch (err) {
          errors.push({ row: i + 2, message: err instanceof Error ? err.message : 'Unknown error' });
          skipped++;
        }
      }

      return { created, skipped, errors };
    }),

  exportContacts: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(5000).default(1000),
    }))
    .query(async ({ ctx, input }) => {
      const result = await contactService.listContacts(ctx.user!, {
        pagination: { limit: input.limit },
      });
      return { rows: result.items };
    }),
});

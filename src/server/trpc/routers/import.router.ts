import { z } from 'zod';
import { router, protectedProcedure } from '../router';
import * as contactService from '@/server/services/contact.service';
import * as companyService from '@/server/services/company.service';
import * as dealService from '@/server/services/deal.service';
import { db } from '@/server/db';
import { contacts, companies, pipelineStages } from '@/server/db/schema';
import { eq, ilike, and, asc } from 'drizzle-orm';

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

  deals: protectedProcedure
    .input(z.object({
      rows: z.array(z.record(z.string(), z.string())).min(1).max(1000),
      columnMap: z.record(z.string(), z.string()),
      pipelineId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      let created = 0;
      let skipped = 0;
      const errors: Array<{ row: number; message: string }> = [];

      // Pre-fetch all stages for this pipeline once
      const allStages = await db
        .select({ id: pipelineStages.id, name: pipelineStages.name, position: pipelineStages.position, defaultProbability: pipelineStages.defaultProbability })
        .from(pipelineStages)
        .where(eq(pipelineStages.pipelineId, input.pipelineId))
        .orderBy(asc(pipelineStages.position));

      if (allStages.length === 0) {
        return { created: 0, skipped: input.rows.length, errors: [{ row: 0, message: 'Pipeline has no stages' }] };
      }

      const defaultStage = allStages[0]!;

      for (let i = 0; i < input.rows.length; i++) {
        const raw = input.rows[i]!;
        const mapped: Record<string, string> = {};
        for (const [csvCol, dealField] of Object.entries(input.columnMap)) {
          if (raw[csvCol] !== undefined) mapped[dealField] = raw[csvCol]!;
        }

        const title = mapped.title?.trim();
        if (!title) {
          errors.push({ row: i + 2, message: 'Title is required' });
          skipped++;
          continue;
        }

        // Resolve stage by name (case-insensitive), fall back to first stage
        let resolvedStageId = defaultStage.id;
        let resolvedProbability = defaultStage.defaultProbability ?? 0;
        if (mapped.stageName?.trim()) {
          const match = allStages.find(
            (s) => s.name.toLowerCase() === mapped.stageName!.trim().toLowerCase()
          );
          if (match) {
            resolvedStageId = match.id;
            resolvedProbability = match.defaultProbability ?? 0;
          }
        }

        // Resolve company by name (case-insensitive), optional
        let resolvedCompanyId: string | undefined;
        if (mapped.companyName?.trim()) {
          const [found] = await db
            .select({ id: companies.id })
            .from(companies)
            .where(ilike(companies.name, mapped.companyName.trim()))
            .limit(1);
          if (found) resolvedCompanyId = found.id;
        }

        // Resolve primary contact by full name (case-insensitive), optional
        let resolvedContactId: string | undefined;
        if (mapped.contactName?.trim()) {
          const parts = mapped.contactName.trim().split(/\s+/);
          const firstName = parts[0] ?? '';
          const lastName = parts.slice(1).join(' ');
          const [found] = await db
            .select({ id: contacts.id })
            .from(contacts)
            .where(and(
              ilike(contacts.firstName, firstName),
              lastName ? ilike(contacts.lastName, lastName) : ilike(contacts.firstName, firstName)
            ))
            .limit(1);
          if (found) resolvedContactId = found.id;
        }

        // Parse amount
        const amountRaw = mapped.amount?.replace(/[^0-9.]/g, '');
        const amount = amountRaw ? parseFloat(amountRaw) : undefined;

        // Parse probability
        const probabilityRaw = mapped.probability ? parseInt(mapped.probability, 10) : undefined;
        const probability = probabilityRaw !== undefined && !isNaN(probabilityRaw)
          ? Math.min(100, Math.max(0, probabilityRaw))
          : resolvedProbability;

        // Parse close date
        const expectedCloseDate = mapped.expectedCloseDate?.trim() || undefined;

        try {
          await dealService.createDeal(ctx.user!, {
            title,
            pipelineId: input.pipelineId,
            stageId: resolvedStageId,
            amount: amount !== undefined ? String(amount) : undefined,
            currency: (mapped.currency?.trim() || 'INR') as string,
            probability,
            expectedCloseDate: expectedCloseDate ?? null,
            status: 'open',
            companyId: resolvedCompanyId ?? null,
            primaryContactId: resolvedContactId ?? null,
            description: mapped.description?.trim() || null,
            customFields: {},
          } as Parameters<typeof dealService.createDeal>[1]);
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

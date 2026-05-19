import { z } from 'zod';
import { router, protectedProcedure } from '../router';
import { filterConfigSchema, sortSchema } from '@/server/lib/validators';
import * as contactService from '@/server/services/contact.service';
import * as companyService from '@/server/services/company.service';
import * as dealService from '@/server/services/deal.service';
import { db } from '@/server/db';
import { contacts, companies, pipelineStages, deals } from '@/server/db/schema';
import { eq, ilike, and, asc, isNull, sql, or } from 'drizzle-orm';

const contactRowSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional().nullable(),
  secondaryEmail: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  mobile: z.string().optional().nullable(),
  companyName: z.string().optional().nullable(),
  jobTitle: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  linkedinUrl: z.string().optional().nullable(),
  leadScore: z.number().int().min(0).max(100).optional().nullable(),
  addressLine1: z.string().optional().nullable(),
  addressLine2: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
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
      // 'skip' = ignore duplicates, 'update' = fill in missing fields, 'overwrite' = replace all fields from CSV, 'create' = always create new
      duplicateMode: z.enum(['skip', 'update', 'overwrite', 'create']).default('skip'),
    }))
    .mutation(async ({ ctx, input }) => {
      let created = 0;
      let updated = 0;
      let skipped = 0;
      const errors: Array<{ row: number; message: string }> = [];

      for (let i = 0; i < input.rows.length; i++) {
        const raw = input.rows[i]!;
        // Map CSV columns to contact fields
        const mapped: Record<string, string> = {};
        for (const [csvCol, contactField] of Object.entries(input.columnMap)) {
          if (raw[csvCol] !== undefined) mapped[contactField] = raw[csvCol]!;
        }

        const leadScoreRaw = mapped.leadScore ? parseInt(mapped.leadScore, 10) : undefined;
        const parsed = contactRowSchema.safeParse({
          firstName: mapped.firstName ?? '',
          lastName: mapped.lastName ?? '',
          email: mapped.email || null,
          secondaryEmail: mapped.secondaryEmail || null,
          phone: mapped.phone || null,
          mobile: mapped.mobile || null,
          companyName: mapped.companyName || null,
          jobTitle: mapped.jobTitle || null,
          department: mapped.department || null,
          linkedinUrl: mapped.linkedinUrl || null,
          leadScore: !isNaN(leadScoreRaw as number) ? leadScoreRaw : null,
          addressLine1: mapped.addressLine1 || null,
          addressLine2: mapped.addressLine2 || null,
          city: mapped.city || null,
          state: mapped.state || null,
          postalCode: mapped.postalCode || null,
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

        if (input.duplicateMode !== 'create') {
          // Match by email first, then by first+last name
          const matchConditions = [];
          if (parsed.data.email) {
            matchConditions.push(eq(contacts.email, parsed.data.email));
          }
          matchConditions.push(
            and(
              ilike(contacts.firstName, parsed.data.firstName),
              ilike(contacts.lastName, parsed.data.lastName),
              isNull(contacts.deletedAt),
            )!
          );

          const existingRows = await db
            .select({
              id: contacts.id,
              email: contacts.email,
              phone: contacts.phone,
              mobile: contacts.mobile,
              secondaryEmail: contacts.secondaryEmail,
              jobTitle: contacts.jobTitle,
              department: contacts.department,
              linkedinUrl: contacts.linkedinUrl,
              companyName: contacts.companyName,
              addressLine1: contacts.addressLine1,
              addressLine2: contacts.addressLine2,
              city: contacts.city,
              state: contacts.state,
              postalCode: contacts.postalCode,
              country: contacts.country,
              description: contacts.description,
              leadScore: contacts.leadScore,
            })
            .from(contacts)
            .where(and(isNull(contacts.deletedAt), or(...matchConditions)))
            .limit(1);

          if (existingRows.length > 0) {
            if (input.duplicateMode === 'skip') {
              skipped++;
              continue;
            }

            const existing = existingRows[0]!;
            const patch: Record<string, unknown> = {};

            if (input.duplicateMode === 'overwrite') {
              // Replace every non-empty field from CSV
              if (parsed.data.email) patch.email = parsed.data.email;
              if (parsed.data.secondaryEmail) patch.secondaryEmail = parsed.data.secondaryEmail;
              if (parsed.data.phone) patch.phone = parsed.data.phone;
              if (parsed.data.mobile) patch.mobile = parsed.data.mobile;
              if (parsed.data.jobTitle) patch.jobTitle = parsed.data.jobTitle;
              if (parsed.data.department) patch.department = parsed.data.department;
              if (parsed.data.linkedinUrl) patch.linkedinUrl = parsed.data.linkedinUrl;
              if (parsed.data.companyName) patch.companyName = parsed.data.companyName;
              if (parsed.data.addressLine1) patch.addressLine1 = parsed.data.addressLine1;
              if (parsed.data.addressLine2) patch.addressLine2 = parsed.data.addressLine2;
              if (parsed.data.city) patch.city = parsed.data.city;
              if (parsed.data.state) patch.state = parsed.data.state;
              if (parsed.data.postalCode) patch.postalCode = parsed.data.postalCode;
              if (parsed.data.country) patch.country = parsed.data.country;
              if (parsed.data.description) patch.description = parsed.data.description;
              if (parsed.data.leadScore != null) patch.leadScore = parsed.data.leadScore;
            } else {
              // 'update': fill in only null/empty fields
              if (!existing.email && parsed.data.email) patch.email = parsed.data.email;
              if (!existing.secondaryEmail && parsed.data.secondaryEmail) patch.secondaryEmail = parsed.data.secondaryEmail;
              if (!existing.phone && parsed.data.phone) patch.phone = parsed.data.phone;
              if (!existing.mobile && parsed.data.mobile) patch.mobile = parsed.data.mobile;
              if (!existing.jobTitle && parsed.data.jobTitle) patch.jobTitle = parsed.data.jobTitle;
              if (!existing.department && parsed.data.department) patch.department = parsed.data.department;
              if (!existing.linkedinUrl && parsed.data.linkedinUrl) patch.linkedinUrl = parsed.data.linkedinUrl;
              if (!existing.companyName && parsed.data.companyName) patch.companyName = parsed.data.companyName;
              if (!existing.addressLine1 && parsed.data.addressLine1) patch.addressLine1 = parsed.data.addressLine1;
              if (!existing.addressLine2 && parsed.data.addressLine2) patch.addressLine2 = parsed.data.addressLine2;
              if (!existing.city && parsed.data.city) patch.city = parsed.data.city;
              if (!existing.state && parsed.data.state) patch.state = parsed.data.state;
              if (!existing.postalCode && parsed.data.postalCode) patch.postalCode = parsed.data.postalCode;
              if (!existing.country && parsed.data.country) patch.country = parsed.data.country;
              if (!existing.description && parsed.data.description) patch.description = parsed.data.description;
              if ((existing.leadScore == null || existing.leadScore === 0) && parsed.data.leadScore != null) patch.leadScore = parsed.data.leadScore;
            }

            if (Object.keys(patch).length > 0) {
              await db
                .update(contacts)
                .set({ ...patch, updatedAt: new Date() })
                .where(eq(contacts.id, existing.id));
              updated++;
            } else {
              skipped++;
            }
            continue;
          }
        }

        try {
          await contactService.createContact(ctx.user!, {
            ...parsed.data,
            ownerId: mapped.ownerId || ctx.user!.id,
            customFields: {},
          });
          created++;
        } catch (err) {
          errors.push({ row: i + 2, message: err instanceof Error ? err.message : 'Unknown error' });
          skipped++;
        }
      }

      return { created, updated, skipped, errors };
    }),

  companies: protectedProcedure
    .input(z.object({
      rows: z.array(z.record(z.string(), z.string())).min(1).max(1000),
      columnMap: z.record(z.string(), z.string()),
      duplicateMode: z.enum(['skip', 'update', 'create']).default('skip'),
    }))
    .mutation(async ({ ctx, input }) => {
      let created = 0;
      let updated = 0;
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

        if (input.duplicateMode !== 'create') {
          // Match by name (case-insensitive)
          const [existingCompany] = await db
            .select({
              id: companies.id,
              domain: companies.domain,
              website: companies.website,
              industry: companies.industry,
              city: companies.city,
              country: companies.country,
              phone: companies.phone,
              description: companies.description,
            })
            .from(companies)
            .where(and(ilike(companies.name, parsed.data.name), isNull(companies.deletedAt)))
            .limit(1);

          if (existingCompany) {
            if (input.duplicateMode === 'skip') {
              skipped++;
              continue;
            }

            // mode === 'update': fill in only null/empty fields
            const patch: Record<string, string | null> = {};
            if (!existingCompany.domain && parsed.data.domain) patch.domain = parsed.data.domain;
            if (!existingCompany.website && parsed.data.website) patch.website = parsed.data.website;
            if (!existingCompany.industry && parsed.data.industry) patch.industry = parsed.data.industry;
            if (!existingCompany.phone && parsed.data.phone) patch.phone = parsed.data.phone;
            if (!existingCompany.city && parsed.data.city) patch.city = parsed.data.city;
            if (!existingCompany.country && parsed.data.country) patch.country = parsed.data.country;
            if (!existingCompany.description && parsed.data.description) patch.description = parsed.data.description;

            if (Object.keys(patch).length > 0) {
              await db
                .update(companies)
                .set({ ...patch, updatedAt: new Date() })
                .where(eq(companies.id, existingCompany.id));
              updated++;
            } else {
              skipped++;
            }
            continue;
          }
        }

        try {
          await companyService.createCompany(ctx.user!, {
            ...parsed.data,
            status: 'active',
            ownerId: mapped.ownerId || ctx.user!.id,
            customFields: {},
          });
          created++;
        } catch (err) {
          errors.push({ row: i + 2, message: err instanceof Error ? err.message : 'Unknown error' });
          skipped++;
        }
      }

      return { created, updated, skipped, errors };
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

        // Resolve or auto-create company by name
        let resolvedCompanyId: string | undefined;
        if (mapped.companyName?.trim()) {
          const [found] = await db
            .select({ id: companies.id })
            .from(companies)
            .where(ilike(companies.name, mapped.companyName.trim()))
            .limit(1);
          if (found) {
            resolvedCompanyId = found.id;
          } else {
            // Auto-create company
            const created = await companyService.createCompany(ctx.user!, {
              name: mapped.companyName.trim(),
              companyType: 'prospect',
              status: 'active',
              customFields: {},
            });
            resolvedCompanyId = created.id as string;
          }
        }

        // Resolve or auto-create primary contact by full name
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
          if (found) {
            resolvedContactId = found.id;
          } else if (firstName) {
            // Auto-create contact, linked to the resolved company if any
            const created = await contactService.createContact(ctx.user!, {
              firstName,
              lastName: lastName || '',
              companyId: resolvedCompanyId ?? null,
              companyName: mapped.companyName?.trim() || null,
              status: 'new',
              customFields: {},
            });
            resolvedContactId = created.id as string;
          }
        }

        // Parse amount — reject if it contains non-numeric characters (letters etc)
        if (mapped.amount?.trim() && /[a-zA-Z]/.test(mapped.amount.trim())) {
          errors.push({ row: i + 2, message: `Amount must be digits only, got "${mapped.amount.trim()}"` });
          skipped++;
          continue;
        }
        const amountRaw = mapped.amount?.replace(/[^0-9.]/g, '');
        const amount = amountRaw ? parseFloat(amountRaw) : undefined;
        if (amount !== undefined && isNaN(amount)) {
          errors.push({ row: i + 2, message: `Amount "${mapped.amount}" is not a valid number` });
          skipped++;
          continue;
        }

        // Parse probability
        const probabilityRaw = mapped.probability ? parseInt(mapped.probability, 10) : undefined;
        if (mapped.probability?.trim() && (probabilityRaw === undefined || isNaN(probabilityRaw))) {
          errors.push({ row: i + 2, message: `Probability "${mapped.probability}" must be a number between 0 and 100` });
          skipped++;
          continue;
        }
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
            ownerId: mapped.ownerId?.trim() || ctx.user!.id,
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

  // Backfill: given the same deals CSV, find-or-create companies/contacts and
  // patch the FK links on existing deals (matched by title). No new deals created.
  backfillDealLinks: protectedProcedure
    .input(z.object({
      rows: z.array(z.record(z.string(), z.string())).min(1).max(1000),
      columnMap: z.record(z.string(), z.string()), // csvHeader -> dealField
      pipelineId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      let linked = 0;
      let companiesCreated = 0;
      let contactsCreated = 0;
      let skipped = 0;
      const errors: Array<{ row: number; message: string }> = [];

      for (let i = 0; i < input.rows.length; i++) {
        const raw = input.rows[i]!;
        const mapped: Record<string, string> = {};
        for (const [csvCol, dealField] of Object.entries(input.columnMap)) {
          if (raw[csvCol] !== undefined) mapped[dealField] = raw[csvCol]!;
        }

        const title = mapped.title?.trim();
        if (!title) {
          errors.push({ row: i + 2, message: 'Title is required to match existing prospect' });
          skipped++;
          continue;
        }

        // Find existing deal by title + pipeline (case-insensitive)
        const [existingDeal] = await db
          .select({ id: deals.id, companyId: deals.companyId, primaryContactId: deals.primaryContactId })
          .from(deals)
          .where(and(
            ilike(deals.title, title),
            eq(deals.pipelineId, input.pipelineId),
            isNull(deals.deletedAt),
          ))
          .limit(1);

        if (!existingDeal) {
          errors.push({ row: i + 2, message: `No deal found with title "${title}"` });
          skipped++;
          continue;
        }

        try {
          // Resolve or create company
          let resolvedCompanyId: string | null = existingDeal.companyId ?? null;
          if (mapped.companyName?.trim()) {
            const [foundCompany] = await db
              .select({ id: companies.id })
              .from(companies)
              .where(ilike(companies.name, mapped.companyName.trim()))
              .limit(1);
            if (foundCompany) {
              resolvedCompanyId = foundCompany.id;
            } else {
              const created = await companyService.createCompany(ctx.user!, {
                name: mapped.companyName.trim(),
                companyType: 'partner',
                status: 'active',
                customFields: {},
              });
              resolvedCompanyId = created.id as string;
              companiesCreated++;
            }
          }

          // Resolve or create contact
          let resolvedContactId: string | null = existingDeal.primaryContactId ?? null;
          if (mapped.contactName?.trim()) {
            const parts = mapped.contactName.trim().split(/\s+/);
            const firstName = parts[0] ?? '';
            const lastName = parts.slice(1).join(' ');
            const [foundContact] = await db
              .select({ id: contacts.id })
              .from(contacts)
              .where(and(
                ilike(contacts.firstName, firstName),
                lastName ? ilike(contacts.lastName, lastName) : ilike(contacts.firstName, firstName),
              ))
              .limit(1);
            if (foundContact) {
              resolvedContactId = foundContact.id;
            } else if (firstName) {
              const created = await contactService.createContact(ctx.user!, {
                firstName,
                lastName: lastName || '',
                companyId: resolvedCompanyId,
                companyName: mapped.companyName?.trim() || null,
                status: 'new',
                customFields: {},
              });
              resolvedContactId = created.id as string;
              contactsCreated++;
            }
          }

          // Patch the deal with resolved FKs
          const needsUpdate =
            resolvedCompanyId !== existingDeal.companyId ||
            resolvedContactId !== existingDeal.primaryContactId;

          if (needsUpdate) {
            await db
              .update(deals)
              .set({
                ...(resolvedCompanyId !== existingDeal.companyId ? { companyId: resolvedCompanyId } : {}),
                ...(resolvedContactId !== existingDeal.primaryContactId ? { primaryContactId: resolvedContactId } : {}),
                updatedAt: new Date(),
              })
              .where(eq(deals.id, existingDeal.id));
            linked++;
          } else {
            skipped++;
          }
        } catch (err) {
          errors.push({ row: i + 2, message: err instanceof Error ? err.message : 'Unknown error' });
          skipped++;
        }
      }

      return { linked, companiesCreated, contactsCreated, skipped, errors };
    }),

  // One-click: scan existing DB data and link contacts → companies automatically
  relinkContactCompanies: protectedProcedure
    .mutation(async ({ ctx }) => {
      let contactsLinkedByName = 0;
      let contactsLinkedByDeal = 0;
      let companiesCreated = 0;

      // ── Phase 1: contacts that have companyName text but no companyId FK ──
      const unlinkedByName = await db
        .select({
          id: contacts.id,
          companyName: contacts.companyName,
          status: contacts.status,
          source: contacts.source,
        })
        .from(contacts)
        .where(
          and(
            isNull(contacts.deletedAt),
            isNull(contacts.companyId),
            sql`${contacts.companyName} IS NOT NULL AND TRIM(${contacts.companyName}) <> ''`
          )
        );

      for (const contact of unlinkedByName) {
        const name = contact.companyName!.trim();
        const [found] = await db
          .select({ id: companies.id })
          .from(companies)
          .where(and(ilike(companies.name, name), isNull(companies.deletedAt)))
          .limit(1);

        let companyId: string;
        if (found) {
          companyId = found.id;
        } else {
          const created = await companyService.createCompany(ctx.user!, {
            name,
            companyType: 'prospect',
            status: 'active',
            customFields: {},
          });
          companyId = created.id as string;
          companiesCreated++;
        }

        await db
          .update(contacts)
          .set({ companyId, updatedAt: new Date() })
          .where(eq(contacts.id, contact.id));

        contactsLinkedByName++;
      }

      // ── Phase 2: contacts that still have no companyId but appear as
      //    primaryContactId on a deal that does have a companyId ──
      const stillUnlinked = await db
        .select({
          contactId: deals.primaryContactId,
          companyId: deals.companyId,
        })
        .from(deals)
        .where(
          and(
            isNull(deals.deletedAt),
            sql`${deals.primaryContactId} IS NOT NULL`,
            sql`${deals.companyId} IS NOT NULL`
          )
        );

      for (const row of stillUnlinked) {
        if (!row.contactId || !row.companyId) continue;
        // Only patch if contact currently has no companyId
        const [contact] = await db
          .select({ id: contacts.id, companyId: contacts.companyId })
          .from(contacts)
          .where(and(eq(contacts.id, row.contactId), isNull(contacts.deletedAt)))
          .limit(1);

        if (!contact || contact.companyId) continue;

        await db
          .update(contacts)
          .set({ companyId: row.companyId, updatedAt: new Date() })
          .where(eq(contacts.id, row.contactId));

        contactsLinkedByDeal++;
      }

      return { contactsLinkedByName, contactsLinkedByDeal, companiesCreated };
    }),

  exportContacts: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(5000).default(1000),
      search: z.string().optional(),
      filters: filterConfigSchema.optional(),
      sort: sortSchema.optional(),
    }))
    .query(async ({ ctx, input }) => {
      const rows: Record<string, unknown>[] = [];
      let cursor: string | undefined;

      while (rows.length < input.limit) {
        const result = await contactService.listContacts(ctx.user!, {
          search: input.search,
          filters: input.filters,
          sort: input.sort,
          pagination: {
            cursor,
            limit: Math.min(500, input.limit - rows.length),
          },
        });

        rows.push(...result.items);

        if (!result.hasMore || !result.nextCursor) break;
        cursor = result.nextCursor;
      }

      return { rows, truncated: rows.length >= input.limit };
    }),
});

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { financialProcedure, protectedProcedure, router } from '../router';
import { db } from '@/server/db';
import {
  deliveryRoles,
  effortBaselineLines,
  effortBaselines,
} from '@/server/db/schema';
import { writeAuditLog } from '@/server/services/audit.service';
import { canSeeFinancials, redactFinancials } from '@/server/lib/financial-access';
import { fromLegacy, serviceLineLabel } from '@/lib/service-lines';

/**
 * The effort catalog (FR-P4-01 to FR-P4-07).
 *
 * Baselines describe effort, not money, so reads are open to any authenticated
 * user — the estimate builder needs them. Writes are gated, because a baseline
 * is what every future price rests on.
 *
 * `idealCost` is the one exception on the read side. It is what a standard
 * engagement costs to deliver, sitting on an otherwise open payload, so every
 * baseline read passes through `redactFinancials` — which nulls it for callers
 * without the entitlement while leaving the roles and confidence visible.
 */

const baselineLine = z.object({
  deliveryRoleId: z.string().uuid(),
  deliveryStage: z.string().trim().max(40).nullish(),
  resourceCount: z.number().int().positive().max(200),
  hours: z.number().positive().max(20800),
});

async function loadLines(baselineIds: string[]) {
  if (!baselineIds.length) return [];
  return db
    .select({
      id: effortBaselineLines.id,
      baselineId: effortBaselineLines.baselineId,
      deliveryRoleId: effortBaselineLines.deliveryRoleId,
      deliveryRoleName: deliveryRoles.name,
      deliveryStage: effortBaselineLines.deliveryStage,
      resourceCount: effortBaselineLines.resourceCount,
      hours: effortBaselineLines.hours,
      position: effortBaselineLines.position,
    })
    .from(effortBaselineLines)
    .leftJoin(deliveryRoles, eq(deliveryRoles.id, effortBaselineLines.deliveryRoleId))
    .where(inArray(effortBaselineLines.baselineId, baselineIds))
    .orderBy(asc(effortBaselineLines.position));
}

export const catalogRouter = router({
  listBaselines: protectedProcedure
    .input(
      z
        .object({
          serviceLine: z.string().trim().max(50).optional(),
          includeInactive: z.boolean().default(false),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const conditions = [];
      if (input?.serviceLine) conditions.push(eq(effortBaselines.serviceLine, input.serviceLine));
      if (!input?.includeInactive) conditions.push(eq(effortBaselines.isActive, true));

      const rows = await db
        .select()
        .from(effortBaselines)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(asc(effortBaselines.serviceLine), desc(effortBaselines.version));

      const lines = await loadLines(rows.map((r) => r.id));
      const baselines = rows.map((r) => ({
        ...r,
        idealCost: r.idealCost === null ? null : Number(r.idealCost),
        lines: lines.filter((l) => l.baselineId === r.id),
      }));

      return redactFinancials(ctx.user, baselines);
    }),

  getBaseline: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [baseline] = await db
        .select()
        .from(effortBaselines)
        .where(eq(effortBaselines.id, input.id))
        .limit(1);
      if (!baseline) throw new TRPCError({ code: 'NOT_FOUND', message: 'Baseline not found.' });

      return redactFinancials(ctx.user, {
        ...baseline,
        idealCost: baseline.idealCost === null ? null : Number(baseline.idealCost),
        lines: await loadLines([baseline.id]),
        canSeeIdealCost: canSeeFinancials(ctx.user),
      });
    }),

  createBaseline: financialProcedure
    .input(
      z.object({
        serviceLine: z.string().trim().min(2).max(50),
        segment: z.string().trim().max(50).default('standard'),
        name: z.string().trim().min(2).max(150),
        notes: z.string().trim().nullish(),
        /** What a standard (x1) engagement of this service ought to cost. */
        idealCost: z.number().nonnegative().max(999_999_999_999.99).nullish(),
        lines: z.array(baselineLine).min(1, 'A baseline needs at least one role.'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [{ maxVersion } = { maxVersion: 0 }] = await tx
          .select({ maxVersion: sql<number>`COALESCE(MAX(${effortBaselines.version}), 0)::int` })
          .from(effortBaselines)
          .where(
            and(
              eq(effortBaselines.serviceLine, input.serviceLine),
              eq(effortBaselines.segment, input.segment)
            )
          );

        const [created] = await tx
          .insert(effortBaselines)
          .values({
            serviceLine: input.serviceLine,
            segment: input.segment,
            name: input.name,
            version: Number(maxVersion) + 1,
            notes: input.notes ?? null,
            idealCost: input.idealCost?.toString() ?? null,
            createdBy: ctx.user.id,
          })
          .returning();

        await tx.insert(effortBaselineLines).values(
          input.lines.map((line, i) => ({
            baselineId: created!.id,
            deliveryRoleId: line.deliveryRoleId,
            deliveryStage: line.deliveryStage ?? null,
            resourceCount: line.resourceCount,
            hours: line.hours.toString(),
            position: i,
          }))
        );

        await writeAuditLog({
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          action: 'create',
          entityType: 'effort_baseline',
          entityId: created!.id,
          entityName: `${created!.name} v${created!.version}`,
        });
        return created;
      });
    }),

  /**
   * Revising a baseline creates a new version and deactivates the old one
   * (FR-P4-03). Estimates keep pointing at the version they were built from,
   * which is what makes a historic estimate reproducible.
   */
  reviseBaseline: financialProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().trim().min(2).max(150).optional(),
        notes: z.string().trim().nullish(),
        lines: z.array(baselineLine).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [previous] = await db
        .select()
        .from(effortBaselines)
        .where(eq(effortBaselines.id, input.id))
        .limit(1);
      if (!previous) throw new TRPCError({ code: 'NOT_FOUND', message: 'Baseline not found.' });

      return db.transaction(async (tx) => {
        const [created] = await tx
          .insert(effortBaselines)
          .values({
            serviceLine: previous.serviceLine,
            segment: previous.segment,
            name: input.name ?? previous.name,
            version: previous.version + 1,
            confidence: previous.confidence,
            sampleSize: previous.sampleSize,
            observedSpreadPercent: previous.observedSpreadPercent,
            isJudgementBased: previous.isJudgementBased,
            // Carried forward with the rest of the provenance. Revising the
            // roles says nothing about what the engagement ought to cost, and
            // dropping it here would silently blank the benchmark on every
            // future estimate for this service line.
            idealCost: previous.idealCost,
            notes: input.notes ?? previous.notes,
            createdBy: ctx.user.id,
          })
          .returning();

        await tx.insert(effortBaselineLines).values(
          input.lines.map((line, i) => ({
            baselineId: created!.id,
            deliveryRoleId: line.deliveryRoleId,
            deliveryStage: line.deliveryStage ?? null,
            resourceCount: line.resourceCount,
            hours: line.hours.toString(),
            position: i,
          }))
        );

        await tx
          .update(effortBaselines)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(effortBaselines.id, previous.id));

        await writeAuditLog({
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          action: 'update',
          entityType: 'effort_baseline',
          entityId: created!.id,
          entityName: `${created!.name} v${created!.version}`,
          changes: { version: { old: previous.version, new: created!.version } },
        });
        return created;
      });
    }),

  /**
   * What a standard engagement of this service ought to cost.
   *
   * Audited, because this figure benchmarks every future estimate on the
   * service line: an estimate whose engine cost sits well below it looks
   * cheap, and moving the ideal quietly would move that judgement for
   * everybody. Null clears the benchmark rather than setting it to free.
   */
  setIdealCost: financialProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        idealCost: z.number().nonnegative().max(999_999_999_999.99).nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await db
        .update(effortBaselines)
        .set({ idealCost: input.idealCost?.toString() ?? null, updatedAt: new Date() })
        .where(eq(effortBaselines.id, input.id))
        .returning();
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Baseline not found.' });

      await writeAuditLog({
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        action: 'update',
        entityType: 'effort_baseline',
        entityId: input.id,
        entityName: updated.name,
        metadata: { idealCost: input.idealCost, financialWrite: true },
      });
      return updated;
    }),

  /**
   * Confidence is evidence, so setting it requires stating the evidence
   * (FR-P4-02). Clearing `isJudgementBased` without a sample size is refused.
   */
  setConfidence: financialProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        confidence: z.enum(['low', 'medium', 'high']),
        sampleSize: z.number().int().min(0),
        observedSpreadPercent: z.number().min(0).max(999).nullish(),
        isJudgementBased: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!input.isJudgementBased && input.sampleSize < 1) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            'A baseline can only stop being judgement-based once at least one completed engagement supports it.',
        });
      }

      const [updated] = await db
        .update(effortBaselines)
        .set({
          confidence: input.confidence,
          sampleSize: input.sampleSize,
          observedSpreadPercent: input.observedSpreadPercent?.toString() ?? null,
          isJudgementBased: input.isJudgementBased,
          updatedAt: new Date(),
        })
        .where(eq(effortBaselines.id, input.id))
        .returning();
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Baseline not found.' });

      await writeAuditLog({
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        action: 'update',
        entityType: 'effort_baseline',
        entityId: updated.id,
        entityName: updated.name,
        metadata: { confidence: input.confidence, sampleSize: input.sampleSize },
      });
      return updated;
    }),

  deactivateBaseline: financialProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(effortBaselines)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(effortBaselines.id, input.id));
      await writeAuditLog({
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        action: 'update',
        entityType: 'effort_baseline',
        entityId: input.id,
        metadata: { deactivated: true },
      });
      return { id: input.id };
    }),

  /**
   * Service lines being sold with no baseline behind them (FR-P4-07).
   * Reads the services recorded on open prospects.
   *
   * The comparison happens here rather than in SQL because the two sides speak
   * different languages: prospects record what the sales team picked from its
   * own list ('SOC 2'), baselines record a canonical slug ('soc2_type2'). The
   * old query compared them lowercased, which matched nothing and reported
   * every service as uncovered — including the one service that did have a
   * baseline.
   */
  coverageGaps: protectedProcedure.query(async () => {
    const rows = await db.execute(sql`
      SELECT service, COUNT(*)::int AS open_deals
      FROM (
        SELECT jsonb_array_elements_text(COALESCE(d.services, '[]'::jsonb)) AS service
        FROM deals d
        WHERE d.deleted_at IS NULL AND d.status = 'open'
      ) s
      GROUP BY service
    `);
    const extract = (r: unknown): { service: string; open_deals: number }[] =>
      Array.isArray(r) ? r : ((r as { rows?: unknown[] })?.rows as never) ?? [];

    const covered = new Set(
      (
        await db
          .select({ serviceLine: effortBaselines.serviceLine })
          .from(effortBaselines)
          .where(eq(effortBaselines.isActive, true))
      )
        .map((b) => fromLegacy(b.serviceLine))
        .filter((s): s is string => s !== null)
    );

    // A service nobody can map is uncovered by definition — there is no slug to
    // hang a baseline off. Reported under its raw name so it is still findable.
    const gaps = new Map<string, { serviceLine: string; label: string; openDeals: number }>();
    for (const row of extract(rows)) {
      const slug = fromLegacy(row.service);
      if (slug !== null && covered.has(slug)) continue;
      const key = slug ?? row.service;
      const existing = gaps.get(key);
      if (existing) {
        existing.openDeals += row.open_deals;
      } else {
        gaps.set(key, {
          serviceLine: key,
          label: slug ? serviceLineLabel(slug) : row.service,
          openDeals: row.open_deals,
        });
      }
    }

    return [...gaps.values()].sort((a, b) => b.openDeals - a.openDeals);
  }),
});

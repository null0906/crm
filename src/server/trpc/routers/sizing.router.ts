import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { asc, eq, inArray, isNull, lte, or, sql, and } from 'drizzle-orm';
import { financialProcedure, protectedProcedure, router } from '../router';
import { db } from '@/server/db';
import { sizingDriverOptions, sizingDrivers, sizingPolicies } from '@/server/db/schema';
import { writeAuditLog } from '@/server/services/audit.service';
import { composeMultiplier } from '@/server/services/sizing.service';

/**
 * The sizing model (FR-P4-08 to FR-P4-13).
 *
 * Drivers describe effort, not money, so reads are open — the scoping
 * questionnaire needs them. Editing weights is gated: a driver weight moves
 * every future price.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

const driverAnswer = z.object({
  driverId: z.string().uuid(),
  optionId: z.string().uuid().nullish(),
  numericValue: z.number().min(0).max(1_000_000).nullish(),
  source: z.string().trim().max(60).nullish(),
  answerConfidence: z.enum(['low', 'medium', 'high']).nullish(),
});

export const sizingRouter = router({
  listDrivers: protectedProcedure
    .input(z.object({ includeInactive: z.boolean().default(false) }).optional())
    .query(async ({ input }) => {
      const drivers = await db
        .select()
        .from(sizingDrivers)
        .where(input?.includeInactive ? sql`true` : eq(sizingDrivers.isActive, true))
        .orderBy(asc(sizingDrivers.position), asc(sizingDrivers.name));

      const options = drivers.length
        ? await db
            .select()
            .from(sizingDriverOptions)
            .where(inArray(sizingDriverOptions.driverId, drivers.map((d) => d.id)))
            .orderBy(asc(sizingDriverOptions.position))
        : [];

      return drivers.map((d) => ({
        ...d,
        options: options.filter((o) => o.driverId === d.id),
      }));
    }),

  createDriver: financialProcedure
    .input(
      z
        .object({
          slug: z
            .string()
            .trim()
            .min(2)
            .max(60)
            .regex(/^[a-z0-9_]+$/, 'Lowercase letters, digits and underscores only'),
          name: z.string().trim().min(2).max(120),
          description: z.string().trim().nullish(),
          valueType: z.enum(['select', 'number']),
          appliesTo: z.enum(['weeks', 'team', 'both']).default('weeks'),
          multiplierPerUnit: z.number().min(0).max(10).nullish(),
          unitBaseline: z.number().int().min(0).default(0),
          position: z.number().int().min(0).default(0),
        })
        .refine((v) => v.valueType !== 'number' || v.multiplierPerUnit != null, {
          message: 'A numeric driver needs a multiplier per unit.',
          path: ['multiplierPerUnit'],
        })
    )
    .mutation(async ({ ctx, input }) => {
      const [created] = await db
        .insert(sizingDrivers)
        .values({
          ...input,
          multiplierPerUnit: input.multiplierPerUnit?.toString() ?? null,
          createdBy: ctx.user.id,
        })
        .returning();

      await writeAuditLog({
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        action: 'create',
        entityType: 'sizing_driver',
        entityId: created!.id,
        entityName: created!.name,
      });
      return created;
    }),

  updateDriver: financialProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().trim().min(2).max(120).optional(),
        description: z.string().trim().nullish(),
        appliesTo: z.enum(['weeks', 'team', 'both']).optional(),
        multiplierPerUnit: z.number().min(0).max(10).nullish(),
        unitBaseline: z.number().int().min(0).optional(),
        position: z.number().int().min(0).optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, multiplierPerUnit, ...rest } = input;
      const [updated] = await db
        .update(sizingDrivers)
        .set({
          ...rest,
          ...(multiplierPerUnit !== undefined
            ? { multiplierPerUnit: multiplierPerUnit?.toString() ?? null }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(sizingDrivers.id, id))
        .returning();
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Driver not found.' });

      await writeAuditLog({
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        action: 'update',
        entityType: 'sizing_driver',
        entityId: id,
        entityName: updated.name,
      });
      return updated;
    }),

  upsertOption: financialProcedure
    .input(
      z.object({
        driverId: z.string().uuid(),
        value: z.string().trim().min(1).max(60),
        label: z.string().trim().min(1).max(120),
        multiplier: z.number().positive().max(10),
        position: z.number().int().min(0).default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .insert(sizingDriverOptions)
        .values({ ...input, multiplier: input.multiplier.toString() })
        .onConflictDoUpdate({
          target: [sizingDriverOptions.driverId, sizingDriverOptions.value],
          set: {
            label: input.label,
            multiplier: input.multiplier.toString(),
            position: input.position,
          },
        })
        .returning();

      await writeAuditLog({
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        action: 'update',
        entityType: 'sizing_driver_option',
        entityId: row!.id,
        entityName: `${input.label} (x${input.multiplier})`,
      });
      return row;
    }),

  deleteOption: financialProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(sizingDriverOptions).where(eq(sizingDriverOptions.id, input.id));
      await writeAuditLog({
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        action: 'delete',
        entityType: 'sizing_driver_option',
        entityId: input.id,
      });
      return { id: input.id };
    }),

  getPolicy: protectedProcedure
    .input(z.object({ asOf: isoDate.optional() }).optional())
    .query(async ({ input }) => {
      const asOf = input?.asOf ?? new Date().toISOString().slice(0, 10);
      const [policy] = await db
        .select()
        .from(sizingPolicies)
        .where(
          and(
            lte(sizingPolicies.effectiveFrom, asOf),
            or(isNull(sizingPolicies.effectiveTo), sql`${sizingPolicies.effectiveTo} >= ${asOf}`)
          )
        )
        .orderBy(sql`${sizingPolicies.effectiveFrom} DESC`, sql`${sizingPolicies.version} DESC`)
        .limit(1);
      return policy ?? null;
    }),

  /** A new ceiling is a new version, so historic estimates keep their rules. */
  setPolicy: financialProcedure
    .input(
      z.object({
        name: z.string().trim().min(2).max(100).default('Standard sizing policy'),
        maxMultiplier: z.number().min(1).max(20),
        composition: z.enum(['multiplicative', 'additive']).default('multiplicative'),
        effectiveFrom: isoDate,
        notes: z.string().trim().nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [{ maxVersion } = { maxVersion: 0 }] = await db
        .select({ maxVersion: sql<number>`COALESCE(MAX(${sizingPolicies.version}), 0)::int` })
        .from(sizingPolicies)
        .where(eq(sizingPolicies.name, input.name));

      const [created] = await db
        .insert(sizingPolicies)
        .values({
          name: input.name,
          version: Number(maxVersion) + 1,
          maxMultiplier: input.maxMultiplier.toString(),
          composition: input.composition,
          effectiveFrom: input.effectiveFrom,
          notes: input.notes ?? null,
          createdBy: ctx.user.id,
        })
        .returning();

      await writeAuditLog({
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        action: 'update',
        entityType: 'sizing_policy',
        entityId: created!.id,
        entityName: `${created!.name} v${created!.version}`,
        metadata: { maxMultiplier: input.maxMultiplier },
      });
      return created;
    }),

  /**
   * Composes answers without saving, so the questionnaire can show the effect
   * of a driver as it is answered. Carries no money.
   */
  previewMultiplier: protectedProcedure
    .input(z.object({ answers: z.array(driverAnswer), asOf: isoDate.optional() }))
    .query(async ({ input }) => {
      return composeMultiplier(
        input.answers,
        input.asOf ?? new Date().toISOString().slice(0, 10)
      );
    }),
});

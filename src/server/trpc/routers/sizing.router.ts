import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { asc, eq, inArray, isNull, lte, or, sql, and } from 'drizzle-orm';
import { financialProcedure, protectedProcedure, router } from '../router';
import { db } from '@/server/db';
import {
  sizingDriverOptions,
  sizingDriverServiceLines,
  sizingDrivers,
  sizingPolicies,
} from '@/server/db/schema';
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
  /**
   * The questions to ask, optionally narrowed to one service line.
   *
   * A driver with no rows in `sizing_driver_service_lines` is global and asked
   * everywhere. That absence-means-everything rule is deliberate: it is what
   * made adding the link table safe, since every driver that predates it has no
   * rows and keeps appearing on every service exactly as before.
   */
  listDrivers: protectedProcedure
    .input(
      z
        .object({
          includeInactive: z.boolean().default(false),
          serviceLine: z.string().trim().max(50).nullish(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const scoped = input?.serviceLine
        ? sql`(
            EXISTS (
              SELECT 1 FROM ${sizingDriverServiceLines}
              WHERE ${sizingDriverServiceLines.driverId} = ${sizingDrivers.id}
                AND ${sizingDriverServiceLines.serviceLine} = ${input.serviceLine}
            )
            OR NOT EXISTS (
              SELECT 1 FROM ${sizingDriverServiceLines}
              WHERE ${sizingDriverServiceLines.driverId} = ${sizingDrivers.id}
            )
          )`
        : sql`true`;

      const drivers = await db
        .select()
        .from(sizingDrivers)
        .where(
          and(input?.includeInactive ? sql`true` : eq(sizingDrivers.isActive, true), scoped)
        )
        .orderBy(asc(sizingDrivers.position), asc(sizingDrivers.name));

      if (!drivers.length) return [];
      const driverIds = drivers.map((d) => d.id);

      const options = await db
        .select()
        .from(sizingDriverOptions)
        .where(inArray(sizingDriverOptions.driverId, driverIds))
        .orderBy(asc(sizingDriverOptions.position));

      // Returned so a caller can tell a question asked everywhere from one
      // asked here: editing a global driver changes every other service too,
      // and the editor has to be able to say so.
      const links = await db
        .select()
        .from(sizingDriverServiceLines)
        .where(inArray(sizingDriverServiceLines.driverId, driverIds));

      return drivers.map((d) => {
        const serviceLines = links.filter((l) => l.driverId === d.id).map((l) => l.serviceLine);
        return {
          ...d,
          options: options.filter((o) => o.driverId === d.id),
          serviceLines,
          isGlobal: serviceLines.length === 0,
        };
      });
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
          /** Empty means the question is asked on every service line. */
          serviceLines: z.array(z.string().trim().max(50)).default([]),
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
      const { serviceLines: scope, ...driver } = input;
      const created = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(sizingDrivers)
          .values({
            ...driver,
            multiplierPerUnit: driver.multiplierPerUnit?.toString() ?? null,
            createdBy: ctx.user.id,
          })
          .returning();

        if (scope.length) {
          await tx
            .insert(sizingDriverServiceLines)
            .values(scope.map((serviceLine) => ({ driverId: row!.id, serviceLine })));
        }
        return row;
      });

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
        /**
         * Replaces the whole scope when given. An empty array means the
         * question becomes global, which is a real choice and so cannot be
         * expressed as "leave it alone" — omitting the field is what does that.
         */
        serviceLines: z.array(z.string().trim().max(50)).optional(),
        multiplierPerUnit: z.number().min(0).max(10).nullish(),
        unitBaseline: z.number().int().min(0).optional(),
        position: z.number().int().min(0).optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, multiplierPerUnit, serviceLines: scope, ...rest } = input;
      const updated = await db.transaction(async (tx) => {
        const [row] = await tx
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
        if (!row) return null;

        if (scope !== undefined) {
          await tx
            .delete(sizingDriverServiceLines)
            .where(eq(sizingDriverServiceLines.driverId, id));
          if (scope.length) {
            await tx
              .insert(sizingDriverServiceLines)
              .values(scope.map((serviceLine) => ({ driverId: id, serviceLine })));
          }
        }
        return row;
      });
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

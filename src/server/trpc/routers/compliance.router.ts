import { z } from 'zod';
import { router, protectedProcedure } from '../router';
import { db } from '@/server/db';
import { pipelines, pipelineStages } from '@/server/db/schema';
import { and, asc, eq, ilike } from 'drizzle-orm';
import * as dealService from '@/server/services/deal.service';

const COMPLIANCE_PIPELINES = {
  soc2: {
    name: 'SOC 2 Workflow',
    description: 'Track clients through the SOC 2 audit and certification process',
    stages: [
      { name: 'Scoping',          color: '#6366f1', stageType: 'active' as const, defaultProbability: 10 },
      { name: 'Gap Assessment',   color: '#8b5cf6', stageType: 'active' as const, defaultProbability: 25 },
      { name: 'Remediation',      color: '#f59e0b', stageType: 'active' as const, defaultProbability: 50 },
      { name: 'Readiness Review', color: '#3b82f6', stageType: 'active' as const, defaultProbability: 75 },
      { name: 'Audit',            color: '#06b6d4', stageType: 'active' as const, defaultProbability: 90 },
      { name: 'Certified',        color: '#10b981', stageType: 'won'    as const, defaultProbability: 100 },
      { name: 'Not Pursued',      color: '#ef4444', stageType: 'lost'   as const, defaultProbability: 0 },
    ],
  },
  dpdp: {
    name: 'DPDP Workflow',
    description: 'Track clients through India Digital Personal Data Protection compliance',
    stages: [
      { name: 'Gap Assessment',    color: '#8b5cf6', stageType: 'active' as const, defaultProbability: 15 },
      { name: 'Data Mapping',      color: '#6366f1', stageType: 'active' as const, defaultProbability: 30 },
      { name: 'Policy Draft',      color: '#f59e0b', stageType: 'active' as const, defaultProbability: 50 },
      { name: 'Implementation',    color: '#3b82f6', stageType: 'active' as const, defaultProbability: 70 },
      { name: 'DPA Registration',  color: '#06b6d4', stageType: 'active' as const, defaultProbability: 85 },
      { name: 'Compliant',         color: '#10b981', stageType: 'won'    as const, defaultProbability: 100 },
      { name: 'Dropped',           color: '#ef4444', stageType: 'lost'   as const, defaultProbability: 0 },
    ],
  },
} as const;

export type ComplianceType = keyof typeof COMPLIANCE_PIPELINES;

export const complianceRouter = router({
  ensurePipeline: protectedProcedure
    .input(z.object({ type: z.enum(['soc2', 'dpdp']) }))
    .mutation(async ({ ctx, input }) => {
      const config = COMPLIANCE_PIPELINES[input.type];

      const [existing] = await db
        .select({ id: pipelines.id, name: pipelines.name })
        .from(pipelines)
        .where(and(
          ilike(pipelines.name, config.name),
          eq(pipelines.pipelineType, 'compliance'),
        ))
        .orderBy(asc(pipelines.createdAt))
        .limit(1);

      if (existing) {
        const stages = await db
          .select()
          .from(pipelineStages)
          .where(eq(pipelineStages.pipelineId, existing.id))
          .orderBy(asc(pipelineStages.position));
        return { id: existing.id, name: existing.name, stages };
      }


      const [pipeline] = await db
        .insert(pipelines)
        .values({
          name: config.name,
          description: config.description,
          pipelineType: 'compliance',
          isDefault: false,
          isActive: true,
          createdBy: ctx.user!.id,
        })
        .returning();

      const stages = [];
      for (let i = 0; i < config.stages.length; i++) {
        const s = config.stages[i]!;
        const [stage] = await db
          .insert(pipelineStages)
          .values({
            pipelineId: pipeline!.id,
            name: s.name,
            slug: s.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
            position: i,
            color: s.color,
            stageType: s.stageType,
            defaultProbability: s.defaultProbability,
          })
          .returning();
        stages.push(stage!);
      }

      return { id: pipeline!.id, name: pipeline!.name, stages };
    }),

  moveDealToWorkflow: protectedProcedure
    .input(z.object({
      dealId: z.string().uuid(),
      type: z.enum(['soc2', 'dpdp']),
    }))
    .mutation(async ({ ctx, input }) => {
      const config = COMPLIANCE_PIPELINES[input.type];

      // Get or create the compliance pipeline
      let [existing] = await db
        .select({ id: pipelines.id })
        .from(pipelines)
        .where(and(
          ilike(pipelines.name, config.name),
          eq(pipelines.pipelineType, 'compliance'),
        ))
        .limit(1);

      if (!existing) {
        const [pipeline] = await db
          .insert(pipelines)
          .values({
            name: config.name,
            description: config.description,
            pipelineType: 'compliance',
            isDefault: false,
            isActive: true,
            createdBy: ctx.user!.id,
          })
          .returning();

        for (let i = 0; i < config.stages.length; i++) {
          const s = config.stages[i]!;
          await db.insert(pipelineStages).values({
            pipelineId: pipeline!.id,
            name: s.name,
            slug: s.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
            position: i,
            color: s.color,
            stageType: s.stageType,
            defaultProbability: s.defaultProbability,
          });
        }
        existing = { id: pipeline!.id };
      }

      // Get the first active stage of the pipeline
      const [firstStage] = await db
        .select({ id: pipelineStages.id })
        .from(pipelineStages)
        .where(and(
          eq(pipelineStages.pipelineId, existing.id),
          eq(pipelineStages.stageType, 'active'),
        ))
        .orderBy(asc(pipelineStages.position))
        .limit(1);

      if (!firstStage) throw new Error('Compliance pipeline has no active stages');

      await dealService.updateDeal(ctx.user!, input.dealId, {
        pipelineId: existing.id,
        stageId: firstStage.id,
      });

      return { pipelineId: existing.id, stageId: firstStage.id, workflowName: config.name };
    }),
});

import { db } from '@/server/db';
import { automationSettings } from '@/server/db/schema';
import { desc, eq } from 'drizzle-orm';

export const ALLOWED_LEAD_INACTIVITY_PIPELINES = ['sales', 'partner', 'enterprise'] as const;
export type LeadInactivityPipeline = (typeof ALLOWED_LEAD_INACTIVITY_PIPELINES)[number];

export const DEFAULT_AUTOMATION_SETTINGS = {
  leadInactivityEnabled: true,
  leadInactivityDays: 3,
  leadInactivityCooldownHours: 24,
  leadInactivityPipelines: ['sales', 'partner', 'enterprise'] as LeadInactivityPipeline[],
};

function sanitizePipelines(pipelines: string[] | null | undefined): LeadInactivityPipeline[] {
  const values = (pipelines ?? []).filter((value): value is LeadInactivityPipeline =>
    ALLOWED_LEAD_INACTIVITY_PIPELINES.includes(value as LeadInactivityPipeline)
  );

  return values.length > 0 ? Array.from(new Set(values)) : DEFAULT_AUTOMATION_SETTINGS.leadInactivityPipelines;
}

export async function getAutomationSettings() {
  try {
    const [row] = await db
      .select()
      .from(automationSettings)
      .orderBy(desc(automationSettings.updatedAt))
      .limit(1);

    if (!row) {
      return DEFAULT_AUTOMATION_SETTINGS;
    }

    return {
      leadInactivityEnabled: row.leadInactivityEnabled,
      leadInactivityDays: row.leadInactivityDays,
      leadInactivityCooldownHours: row.leadInactivityCooldownHours,
      leadInactivityPipelines: sanitizePipelines(row.leadInactivityPipelines),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('automation_settings') || message.includes('does not exist')) {
      return DEFAULT_AUTOMATION_SETTINGS;
    }
    throw error;
  }
}

export async function updateAutomationSettings(
  userId: string,
  input: {
    leadInactivityEnabled: boolean;
    leadInactivityDays: number;
    leadInactivityCooldownHours: number;
    leadInactivityPipelines: string[];
  }
) {
  let existing;
  try {
    [existing] = await db
      .select({ id: automationSettings.id })
      .from(automationSettings)
      .orderBy(desc(automationSettings.updatedAt))
      .limit(1);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('automation_settings') || message.includes('does not exist')) {
      throw new Error('Automation settings table is missing. Run database migrations first.');
    }
    throw error;
  }

  const payload = {
    leadInactivityEnabled: input.leadInactivityEnabled,
    leadInactivityDays: input.leadInactivityDays,
    leadInactivityCooldownHours: input.leadInactivityCooldownHours,
    leadInactivityPipelines: sanitizePipelines(input.leadInactivityPipelines),
    updatedBy: userId,
    updatedAt: new Date(),
  };

  if (!existing) {
    await db.insert(automationSettings).values(payload);
  } else {
    await db
      .update(automationSettings)
      .set(payload)
      .where(eq(automationSettings.id, existing.id));
  }

  return getAutomationSettings();
}

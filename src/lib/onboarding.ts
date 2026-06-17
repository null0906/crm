import type { OnboardingStage } from '@/lib/types';

export const ONBOARDING_STAGE_LABELS: Record<OnboardingStage, string> = {
  documents_pending: 'Documents Pending',
  documents_sent: 'Documents Sent',
  documents_signed: 'Documents Signed',
  payment_pending: 'Payment Pending',
  payment_received: 'Payment Received',
  kickoff_scheduled: 'Kickoff Scheduled',
  completed: 'Onboarding Complete',
  cancelled: 'Cancelled',
};

export function getOnboardingStageLabel(stage: unknown): string {
  return ONBOARDING_STAGE_LABELS[stage as OnboardingStage] ?? String(stage ?? '');
}

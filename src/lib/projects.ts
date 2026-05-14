import type { ProjectServiceType, ProjectStage, ProjectStatus, ProjectTaskStatus } from './types';

export const PROJECT_STAGES: Array<{ key: ProjectStage; label: string; color: string }> = [
  { key: 'kickoff', label: 'Kickoff', color: '#6366F1' },
  { key: 'gap_assessment', label: 'Gap Assessment', color: '#F59E0B' },
  { key: 'internal_audit', label: 'Internal Audit', color: '#F97316' },
  { key: 'external_audit', label: 'External Audit', color: '#8B5CF6' },
  { key: 'certified', label: 'Certified', color: '#10B981' },
  { key: 'on_hold', label: 'On Hold', color: '#94A3B8' },
  { key: 'cancelled', label: 'Cancelled', color: '#EF4444' },
];

export const PROJECT_TASK_STATUSES: Array<{ key: ProjectTaskStatus; label: string }> = [
  { key: 'pending', label: 'Pending' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'not_applicable', label: 'N/A' },
];

export const SERVICE_TYPE_CONFIG: Record<ProjectServiceType, {
  label: string;
  bg: string;
  text: string;
  border: string;
}> = {
  soc2_type1: { label: 'SOC 2 Type I', bg: '#EEF2FF', text: '#3730A3', border: '#C7D2FE' },
  soc2_type2: { label: 'SOC 2 Type II', bg: '#EEF2FF', text: '#3730A3', border: '#C7D2FE' },
  iso27001: { label: 'ISO 27001', bg: '#F0FDF4', text: '#065F46', border: '#A7F3D0' },
  dpdp: { label: 'DPDP', bg: '#FFF7ED', text: '#92400E', border: '#FDE68A' },
  vapt: { label: 'VAPT', bg: '#FEF2F2', text: '#991B1B', border: '#FECACA' },
  cspm: { label: 'CSPM', bg: '#F5F3FF', text: '#5B21B6', border: '#DDD6FE' },
  ai_governance: { label: 'AI Governance', bg: '#ECFEFF', text: '#155E75', border: '#A5F3FC' },
  cert_in: { label: 'CERT-IN', bg: '#FDF4FF', text: '#7E22CE', border: '#E9D5FF' },
  custom: { label: 'Custom', bg: '#F8FAFC', text: '#475569', border: '#E2E8F0' },
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: 'Active',
  completed: 'Completed',
  on_hold: 'On Hold',
  cancelled: 'Cancelled',
};

export function getProjectStage(stage: string | null | undefined) {
  return PROJECT_STAGES.find((item) => item.key === stage) ?? PROJECT_STAGES[0];
}

export function getProjectStageColor(stage: string | null | undefined) {
  return getProjectStage(stage)?.color ?? '#94A3B8';
}

export function getServiceTypeConfig(type: string | null | undefined) {
  return SERVICE_TYPE_CONFIG[(type as ProjectServiceType | null) ?? 'custom'] ?? SERVICE_TYPE_CONFIG.custom;
}

export function formatServiceType(type: string | null | undefined) {
  return getServiceTypeConfig(type).label;
}

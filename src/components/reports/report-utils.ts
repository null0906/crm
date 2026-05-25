export const REPORT_PRESETS = [
  { value: 'this_week', label: 'This Week' },
  { value: 'last_week', label: 'Last Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'last_quarter', label: 'Last Quarter' },
  { value: 'till_date', label: 'Till Date' },
] as const;

export type ReportPreset = (typeof REPORT_PRESETS)[number]['value'];

export const REPORT_ACTIVITY_TYPES = [
  { value: 'call', label: 'Calls' },
  { value: 'email_sent', label: 'Sent emails' },
  { value: 'email_received', label: 'Received emails' },
  { value: 'meeting', label: 'Meetings' },
  { value: 'demo', label: 'Demos' },
  { value: 'note', label: 'Notes' },
  { value: 'task', label: 'Tasks' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'proposal', label: 'Proposals' },
] as const;

export const REPORT_CALL_OUTCOMES = [
  { value: 'connected', label: 'Connected' },
  { value: 'voicemail', label: 'Voicemail' },
  { value: 'no_answer', label: 'No answer' },
  { value: 'busy', label: 'Busy' },
  { value: 'wrong_number', label: 'Wrong number' },
] as const;

export const REPORT_DEMO_OUTCOMES = [
  { value: 'interested', label: 'Interested' },
  { value: 'not_interested', label: 'Not interested' },
  { value: 'follow_up', label: 'Follow up' },
  { value: 'proposal_requested', label: 'Proposal requested' },
  { value: 'unknown', label: 'Unknown' },
] as const;

export const REPORT_TASK_PRIORITIES = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
] as const;

export type ReportTagFilter = {
  id: string;
  name: string;
  color: string;
};

export type ReportFilters = {
  activityTypes?: string[];
  callOutcomes?: string[];
  demoOutcomes?: string[];
  taskPriorities?: string[];
  tags?: ReportTagFilter[];
  location?: string;
  search?: string;
};

export function hasReportFilters(filters: ReportFilters) {
  return Boolean(
    filters.activityTypes?.length ||
      filters.callOutcomes?.length ||
      filters.demoOutcomes?.length ||
      filters.taskPriorities?.length ||
      filters.tags?.length ||
      filters.location?.trim() ||
      filters.search?.trim()
  );
}

export function compactReportFilters(filters: ReportFilters): ReportFilters {
  return {
    activityTypes: filters.activityTypes?.filter(Boolean),
    callOutcomes: filters.callOutcomes?.filter(Boolean),
    demoOutcomes: filters.demoOutcomes?.filter(Boolean),
    taskPriorities: filters.taskPriorities?.filter(Boolean),
    tags: filters.tags?.filter((tag) => tag.id),
    location: filters.location?.trim() || undefined,
    search: filters.search?.trim() || undefined,
  };
}

export function formatINR(value: unknown) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

export function formatNumber(value: unknown) {
  return new Intl.NumberFormat('en-IN').format(Number(value ?? 0));
}

export function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

export function formatTime(value: Date | string) {
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function initials(firstName?: string | null, lastName?: string | null, fallback = 'U') {
  const value = `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase();
  return value || fallback;
}

export function activityLabel(type: string) {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

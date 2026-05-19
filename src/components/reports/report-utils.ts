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

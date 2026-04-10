export const APP_NAME = 'SecComply Command Center';
export const DEFAULT_CURRENCY = 'INR';
export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

export const CONTACT_STATUSES = [
  { value: 'new', label: 'New', color: '#6B7280' },
  { value: 'contacted', label: 'Contacted', color: '#3B82F6' },
  { value: 'qualified', label: 'Qualified', color: '#8B5CF6' },
  { value: 'unqualified', label: 'Unqualified', color: '#EF4444' },
  { value: 'nurturing', label: 'Nurturing', color: '#F59E0B' },
  { value: 'converted', label: 'Converted', color: '#10B981' },
  { value: 'lost', label: 'Lost', color: '#EF4444' },
  { value: 'archived', label: 'Archived', color: '#9CA3AF' },
] as const;

export const COMPANY_TYPES = [
  { value: 'prospect', label: 'Prospect', color: '#6B7280' },
  { value: 'customer', label: 'Customer', color: '#10B981' },
  { value: 'partner', label: 'Partner', color: '#3B82F6' },
  { value: 'vendor', label: 'Vendor', color: '#F59E0B' },
  { value: 'competitor', label: 'Competitor', color: '#EF4444' },
  { value: 'other', label: 'Other', color: '#9CA3AF' },
] as const;

export const DEAL_STATUSES = [
  { value: 'open', label: 'Open', color: '#3B82F6' },
  { value: 'won', label: 'Won', color: '#10B981' },
  { value: 'lost', label: 'Lost', color: '#EF4444' },
  { value: 'abandoned', label: 'Abandoned', color: '#9CA3AF' },
] as const;

export const ACTIVITY_TYPES = [
  { value: 'call', label: 'Call', icon: 'Phone' },
  { value: 'email_sent', label: 'Email Sent', icon: 'Mail' },
  { value: 'email_received', label: 'Email Received', icon: 'MailOpen' },
  { value: 'meeting', label: 'Meeting', icon: 'Users' },
  { value: 'note', label: 'Note', icon: 'FileText' },
  { value: 'task', label: 'Task', icon: 'CheckSquare' },
  { value: 'sms', label: 'SMS', icon: 'MessageSquare' },
  { value: 'whatsapp', label: 'WhatsApp', icon: 'MessageCircle' },
  { value: 'linkedin', label: 'LinkedIn', icon: 'Linkedin' },
  { value: 'demo', label: 'Demo', icon: 'Monitor' },
  { value: 'proposal', label: 'Proposal', icon: 'FileText' },
] as const;

export const COMPANY_SIZES = [
  '1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5000+',
] as const;

export const PAGE_SIZES = [25, 50, 100, 200] as const;

export const DASHBOARD_DATA_SOURCES = [
  { value: 'client', label: 'Client' },
  { value: 'partner', label: 'Partner' },
  { value: 'enterprise', label: 'Enterprise' },
] as const;

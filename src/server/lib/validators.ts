import { z } from 'zod';

// HTML form inputs return "" for empty fields. Preprocess converts "" to null
// so optional email/URL fields don't fail validation when left blank.
const emptyToNull = (v: unknown) => (typeof v === 'string' && !v.trim() ? null : v);
const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);
const optionalString = () => z.preprocess(emptyToNull, z.string().nullable()).nullish();
const optionalDate = () => z.preprocess(emptyToNull, z.string().nullable()).nullish();
const optionalDateTime = () => z.preprocess(emptyToNull, z.string().datetime().nullable()).nullish();
const optionalEmail = () => z.preprocess(emptyToNull, z.string().email().nullable()).nullish();
const optionalUrl = () => z.preprocess(emptyToNull, z.string().url().nullable()).nullish();
const optionalUuid = () => z.preprocess(emptyToNull, z.string().uuid().nullable()).nullish();
const optionalStringMax = (max: number) => z.preprocess(emptyToNull, z.string().max(max).nullable()).nullish();

// Contact schemas
export const contactCreateSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: optionalEmail(),
  secondaryEmail: optionalEmail(),
  phone: optionalStringMax(30),
  mobile: optionalStringMax(30),
  jobTitle: optionalStringMax(150),
  department: optionalStringMax(100),
  companyName: optionalStringMax(255),
  companyId: optionalUuid(),
  referredByPartnerId: optionalUuid(),
  referralDate: optionalDate(),
  linkedinUrl: optionalUrl(),
  source: z.preprocess(emptyToUndefined, z.enum(['apollo', 'manual', 'website', 'referral', 'event', 'cold_outreach']).optional()),
  status: z.enum(['new', 'contacted', 'qualified', 'unqualified', 'nurturing', 'converted', 'lost', 'archived']).default('new'),
  leadScore: z.number().int().min(0).max(100).default(0),
  ownerId: optionalUuid(),
  description: optionalString(),
  addressLine1: optionalString(),
  addressLine2: optionalString(),
  city: optionalStringMax(100),
  state: optionalStringMax(100),
  postalCode: optionalStringMax(20),
  country: optionalStringMax(100),
  location: optionalStringMax(255),
  customFields: z.record(z.string(), z.unknown()).default({}),
  tagIds: z.array(z.string().uuid()).default([]),
});

export const contactUpdateSchema = contactCreateSchema.partial().omit({ tagIds: true });

export const contactBulkUpdateSchema = z.object({
  ownerId: optionalUuid(),
  status: z.enum(['new', 'contacted', 'qualified', 'unqualified', 'nurturing', 'converted', 'lost', 'archived']).optional(),
  tagIdsToAdd: z.array(z.string().uuid()).optional(),
  tagIdsToRemove: z.array(z.string().uuid()).optional(),
});

// Company schemas
export const companyCreateSchema = z.object({
  name: z.string().min(1).max(255),
  domain: optionalStringMax(255),
  website: optionalUrl(),
  industry: optionalStringMax(100),
  subIndustry: optionalStringMax(100),
  companySize: z.preprocess(emptyToNull, z.enum(['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5000+']).optional().nullable()),
  annualRevenueRange: optionalStringMax(50),
  companyType: z.preprocess(emptyToNull, z.enum(['prospect', 'customer', 'partner', 'vendor', 'competitor', 'other']).optional().nullable()),
  phone: optionalStringMax(30),
  email: optionalEmail(),
  addressLine1: optionalString(),
  addressLine2: optionalString(),
  city: optionalStringMax(100),
  state: optionalStringMax(100),
  postalCode: optionalStringMax(20),
  country: optionalStringMax(100),
  location: optionalStringMax(255),
  linkedinUrl: optionalUrl(),
  twitterUrl: optionalUrl(),
  ownerId: optionalUuid(),
  description: optionalString(),
  status: z.enum(['active', 'inactive', 'churned', 'archived']).default('active'),
  customFields: z.record(z.string(), z.unknown()).default({}),
  tagIds: z.array(z.string().uuid()).default([]),
});

export const companyUpdateSchema = companyCreateSchema.partial().omit({ tagIds: true });

export const companyBulkUpdateSchema = z.object({
  ownerId: optionalUuid(),
  companyType: z.preprocess(emptyToNull, z.enum(['prospect', 'customer', 'partner', 'vendor', 'competitor', 'other']).optional().nullable()),
  tagIdsToAdd: z.array(z.string().uuid()).optional(),
});

// Deal schemas
export const dealCreateSchema = z.object({
  title: z.string().min(1).max(255),
  description: optionalString(),
  pipelineId: z.string().uuid(),
  stageId: z.string().uuid(),
  amount: z.number().min(0).optional().nullable(),
  currency: z.string().length(3).default('INR'),
  probability: z.number().int().min(0).max(100).default(0),
  expectedCloseDate: optionalDate(),
  status: z.enum(['open', 'won', 'lost', 'abandoned']).default('open'),
  lostReason: optionalString(),
  wonReason: optionalString(),
  services: z.array(z.string().min(1).max(100)).default([]),
  serviceOther: optionalStringMax(255),
  primaryContactId: optionalUuid(),
  companyId: optionalUuid(),
  partnerCompanyId: optionalUuid(),
  referredByPartnerId: optionalUuid(),
  projectStartDate: optionalDate(),
  projectEndDate: optionalDate(),
  projectActualEndDate: optionalDate(),
  projectProgressPercent: z.number().int().min(0).max(100).optional().nullable(),
  isDelayed: z.boolean().optional(),
  delayReason: optionalString(),
  revisedEndDate: optionalDate(),
  primaryContactName: optionalStringMax(255),
  primaryContactEmail: optionalEmail(),
  primaryContactPhone: optionalStringMax(30),
  primaryContactTitle: optionalStringMax(150),
  inlineCompany: z.object({
    name: optionalStringMax(255),
    domain: optionalStringMax(255),
    website: optionalUrl(),
    phone: optionalStringMax(30),
    email: optionalEmail(),
    city: optionalStringMax(100),
    country: optionalStringMax(100),
    location: optionalStringMax(255),
  }).optional(),
  inlineContact: z.object({
    firstName: optionalStringMax(100),
    lastName: optionalStringMax(100),
    email: optionalEmail(),
    phone: optionalStringMax(30),
    jobTitle: optionalStringMax(150),
  }).optional(),
  ownerId: optionalUuid(),
  customFields: z.record(z.string(), z.unknown()).default({}),
  tagIds: z.array(z.string().uuid()).default([]),
});

export const dealUpdateSchema = dealCreateSchema.partial().omit({ tagIds: true });

export const dealBulkUpdateSchema = z.object({
  ownerId: optionalUuid(),
  status: z.enum(['open', 'won', 'lost', 'abandoned']).optional(),
  tagIdsToAdd: z.array(z.string().uuid()).optional(),
});

export const dealProgressUpdateSchema = z.object({
  id: z.string().uuid(),
  progressPercent: z.number().int().min(0).max(100),
  isDelayed: z.boolean().optional(),
  delayReason: optionalString(),
  revisedEndDate: optionalDate(),
});

export const dealTaskCreateSchema = z.object({
  dealId: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: optionalString(),
  assignedTo: optionalUuid(),
  dueDate: optionalDate(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
});

export const dealTaskUpdateSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: optionalString(),
  assignedTo: optionalUuid(),
  dueDate: optionalDate(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'blocked']).optional(),
  position: z.number().int().optional(),
});

export const demoRecordCreateSchema = z.object({
  contactId: optionalUuid(),
  dealId: optionalUuid(),
  companyId: optionalUuid(),
  callType: z.enum(['discovery', 'demo', 'follow_up', 'proposal_walkthrough', 'onboarding', 'check_in']).default('demo'),
  scheduledAt: optionalDateTime(),
  durationMinutes: z.number().int().min(0).optional().nullable(),
  outcome: z.enum(['completed', 'no_show', 'rescheduled', 'cancelled', 'interested', 'not_interested', 'needs_follow_up']).optional().nullable(),
  attendees: optionalString(),
  clientRequirements: optionalString(),
  painPoints: optionalString(),
  objections: optionalString(),
  nextAction: optionalString(),
  nextActionDate: optionalDate(),
  demoNotes: optionalString(),
  conductedBy: optionalUuid(),
});

export const demoRecordUpdateSchema = demoRecordCreateSchema.partial();

// Activity schemas
export const activityCreateSchema = z.object({
  activityType: z.enum(['call', 'email_sent', 'email_received', 'meeting', 'note', 'task', 'sms', 'whatsapp', 'linkedin', 'demo', 'proposal', 'document', 'stage_change', 'status_change', 'assignment', 'custom']),
  subject: optionalStringMax(255),
  body: optionalString(),
  callDurationSeconds: z.number().int().optional().nullable(),
  callOutcome: z.enum(['connected', 'voicemail', 'no_answer', 'busy', 'wrong_number']).optional().nullable(),
  callDirection: z.enum(['inbound', 'outbound']).optional().nullable(),
  meetingStartAt: optionalDateTime(),
  meetingEndAt: optionalDateTime(),
  meetingLocation: optionalString(),
  meetingLink: optionalUrl(),
  taskDueDate: optionalDate(),
  taskPriority: z.enum(['low', 'medium', 'high', 'urgent']).optional().nullable(),
  contactId: optionalUuid(),
  companyId: optionalUuid(),
  dealId: optionalUuid(),
  occurredAt: z.string().datetime().optional(),
});

// Filter engine schema
export const filterConditionSchema = z.object({
  field: z.string(),
  operator: z.enum([
    'eq', 'neq', 'contains', 'not_contains', 'starts_with', 'ends_with',
    'gt', 'gte', 'lt', 'lte', 'in', 'not_in',
    'contains_any', 'contains_all', 'is_empty', 'is_not_empty',
    'between', 'current_user', 'current_user_team',
  ]),
  value: z.unknown(),
});

export const filterConfigSchema = z.object({
  conditions: z.array(filterConditionSchema),
  logic: z.enum(['AND', 'OR']).default('AND'),
});

// Pagination schema
export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().min(1).max(500).default(50),
});

// Sort schema
export const sortSchema = z.object({
  field: z.string(),
  direction: z.enum(['asc', 'desc']).default('desc'),
});

// Tag schema
export const tagCreateSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#6B7280'),
  categoryId: optionalUuid(),
  description: optionalString(),
});

// Custom field definition schema
export const customFieldDefinitionSchema = z.object({
  name: z.string().min(1).max(100),
  entityType: z.enum(['contact', 'company', 'deal']),
  fieldType: z.enum(['text', 'textarea', 'number', 'currency', 'date', 'datetime', 'select', 'multi_select', 'checkbox', 'email', 'phone', 'url', 'user', 'contact', 'company', 'rating', 'percentage']),
  config: z.record(z.string(), z.unknown()).default({}),
  isRequired: z.boolean().default(false),
  defaultValue: z.unknown().optional(),
  validationRegex: optionalString(),
  position: z.number().int().default(0),
  section: optionalStringMax(100),
  isVisibleInTable: z.boolean().default(true),
  isVisibleInForm: z.boolean().default(true),
  isFilterable: z.boolean().default(true),
  isSearchable: z.boolean().default(false),
  description: optionalString(),
});

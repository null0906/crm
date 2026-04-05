import { z } from 'zod';

// HTML form inputs return "" for empty fields. Preprocess converts "" to null
// so optional email/URL fields don't fail validation when left blank.
const emptyToNull = (v: unknown) => (typeof v === 'string' && !v.trim() ? null : v);
const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);
const optionalEmail = z.preprocess(emptyToNull, z.string().email().optional().nullable());
const optionalUrl = z.preprocess(emptyToNull, z.string().url().optional().nullable());
const optionalUuid = z.preprocess(emptyToNull, z.string().uuid().optional().nullable());

// Contact schemas
export const contactCreateSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: optionalEmail,
  secondaryEmail: optionalEmail,
  phone: z.string().max(30).optional().nullable(),
  mobile: z.string().max(30).optional().nullable(),
  jobTitle: z.string().max(150).optional().nullable(),
  department: z.string().max(100).optional().nullable(),
  companyName: z.string().max(255).optional().nullable(),
  companyId: optionalUuid,
  linkedinUrl: optionalUrl,
  source: z.preprocess(emptyToUndefined, z.enum(['apollo', 'manual', 'website', 'referral', 'event', 'cold_outreach']).optional()),
  status: z.enum(['new', 'contacted', 'qualified', 'unqualified', 'nurturing', 'converted', 'lost', 'archived']).default('new'),
  leadScore: z.number().int().min(0).max(100).default(0),
  ownerId: optionalUuid,
  description: z.string().optional().nullable(),
  addressLine1: z.string().optional().nullable(),
  addressLine2: z.string().optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  customFields: z.record(z.string(), z.unknown()).default({}),
  tagIds: z.array(z.string().uuid()).default([]),
});

export const contactUpdateSchema = contactCreateSchema.partial().omit({ tagIds: true });

export const contactBulkUpdateSchema = z.object({
  ownerId: z.string().uuid().optional().nullable(),
  status: z.enum(['new', 'contacted', 'qualified', 'unqualified', 'nurturing', 'converted', 'lost', 'archived']).optional(),
  tagIdsToAdd: z.array(z.string().uuid()).optional(),
  tagIdsToRemove: z.array(z.string().uuid()).optional(),
});

// Company schemas
export const companyCreateSchema = z.object({
  name: z.string().min(1).max(255),
  domain: z.string().max(255).optional().nullable(),
  website: optionalUrl,
  industry: z.string().max(100).optional().nullable(),
  subIndustry: z.string().max(100).optional().nullable(),
  companySize: z.preprocess(emptyToNull, z.enum(['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5000+']).optional().nullable()),
  annualRevenueRange: z.string().max(50).optional().nullable(),
  companyType: z.preprocess(emptyToNull, z.enum(['prospect', 'customer', 'partner', 'vendor', 'competitor', 'other']).optional().nullable()),
  phone: z.string().max(30).optional().nullable(),
  email: optionalEmail,
  addressLine1: z.string().optional().nullable(),
  addressLine2: z.string().optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  linkedinUrl: optionalUrl,
  twitterUrl: optionalUrl,
  ownerId: optionalUuid,
  description: z.string().optional().nullable(),
  status: z.enum(['active', 'inactive', 'churned', 'archived']).default('active'),
  customFields: z.record(z.string(), z.unknown()).default({}),
  tagIds: z.array(z.string().uuid()).default([]),
});

export const companyUpdateSchema = companyCreateSchema.partial().omit({ tagIds: true });

// Deal schemas
export const dealCreateSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  pipelineId: z.string().uuid(),
  stageId: z.string().uuid(),
  amount: z.number().min(0).optional().nullable(),
  currency: z.string().length(3).default('INR'),
  probability: z.number().int().min(0).max(100).default(0),
  expectedCloseDate: z.string().optional().nullable(),
  status: z.enum(['open', 'won', 'lost', 'abandoned']).default('open'),
  lostReason: z.string().optional().nullable(),
  wonReason: z.string().optional().nullable(),
  primaryContactId: optionalUuid,
  companyId: optionalUuid,
  ownerId: optionalUuid,
  customFields: z.record(z.string(), z.unknown()).default({}),
  tagIds: z.array(z.string().uuid()).default([]),
});

export const dealUpdateSchema = dealCreateSchema.partial().omit({ tagIds: true });

// Activity schemas
export const activityCreateSchema = z.object({
  activityType: z.enum(['call', 'email_sent', 'email_received', 'meeting', 'note', 'task', 'sms', 'whatsapp', 'linkedin', 'demo', 'proposal', 'document', 'stage_change', 'status_change', 'assignment', 'custom']),
  subject: z.string().max(255).optional().nullable(),
  body: z.string().optional().nullable(),
  callDurationSeconds: z.number().int().optional().nullable(),
  callOutcome: z.enum(['connected', 'voicemail', 'no_answer', 'busy', 'wrong_number']).optional().nullable(),
  callDirection: z.enum(['inbound', 'outbound']).optional().nullable(),
  meetingStartAt: z.string().datetime().optional().nullable(),
  meetingEndAt: z.string().datetime().optional().nullable(),
  meetingLocation: z.string().optional().nullable(),
  meetingLink: z.string().url().optional().nullable(),
  taskDueDate: z.string().optional().nullable(),
  taskPriority: z.enum(['low', 'medium', 'high', 'urgent']).optional().nullable(),
  contactId: z.string().uuid().optional().nullable(),
  companyId: z.string().uuid().optional().nullable(),
  dealId: z.string().uuid().optional().nullable(),
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
  limit: z.number().min(1).max(200).default(50),
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
  categoryId: z.string().uuid().optional().nullable(),
  description: z.string().optional().nullable(),
});

// Custom field definition schema
export const customFieldDefinitionSchema = z.object({
  name: z.string().min(1).max(100),
  entityType: z.enum(['contact', 'company', 'deal']),
  fieldType: z.enum(['text', 'textarea', 'number', 'currency', 'date', 'datetime', 'select', 'multi_select', 'checkbox', 'email', 'phone', 'url', 'user', 'contact', 'company', 'rating', 'percentage']),
  config: z.record(z.string(), z.unknown()).default({}),
  isRequired: z.boolean().default(false),
  defaultValue: z.unknown().optional(),
  validationRegex: z.string().optional().nullable(),
  position: z.number().int().default(0),
  section: z.string().max(100).optional().nullable(),
  isVisibleInTable: z.boolean().default(true),
  isVisibleInForm: z.boolean().default(true),
  isFilterable: z.boolean().default(true),
  isSearchable: z.boolean().default(false),
  description: z.string().optional().nullable(),
});

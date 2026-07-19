// Shared TypeScript types used across the application

export type UUID = string;

export type ContactStatus = 'new' | 'contacted' | 'qualified' | 'unqualified' | 'nurturing' | 'converted' | 'lost' | 'archived';
export type ContactSource = 'apollo' | 'manual' | 'website' | 'referral' | 'event' | 'cold_outreach';

export type CompanyStatus = 'active' | 'inactive' | 'churned' | 'archived';
export type CompanyType = 'prospect' | 'customer' | 'partner' | 'vendor' | 'competitor' | 'other';
export type CompanySize = '1-10' | '11-50' | '51-200' | '201-500' | '501-1000' | '1001-5000' | '5000+';

export type DealStatus = 'open' | 'won' | 'lost' | 'abandoned';
export type StageType = 'active' | 'won' | 'lost';
export type PipelineType = 'sales' | 'active_delivery' | 'partner' | 'compliance';
export type DealTaskStatus = 'pending' | 'in_progress' | 'completed' | 'blocked';
export type ProjectStage = 'kickoff' | 'gap_assessment' | 'implementation' | 'internal_audit' | 'external_audit' | 'certified' | 'on_hold' | 'cancelled';
export type ProjectStatus = 'active' | 'completed' | 'on_hold' | 'cancelled';
export type ProjectServiceType = 'soc2_type1' | 'soc2_type2' | 'iso27001' | 'dpdp' | 'vapt' | 'cspm' | 'ai_governance' | 'cert_in' | 'custom';
export type ProjectMemberRole = 'lead' | 'member' | 'reviewer' | 'consultant';
export type ProjectTaskStatus = 'pending' | 'in_progress' | 'completed' | 'blocked' | 'not_applicable';
export type ProjectTaskCategory = 'documentation' | 'evidence_collection' | 'gap_remediation' | 'audit_prep' | 'policy' | 'training' | 'review' | 'other';
export type OnboardingStage =
  | 'documents_pending' | 'documents_sent' | 'documents_signed'
  | 'payment_pending' | 'payment_received' | 'kickoff_scheduled'
  | 'completed' | 'cancelled';
export type OnboardingStatus = 'active' | 'completed' | 'cancelled';
export type PersonalTaskStatus = 'in_progress' | 'completed' | 'cancelled';
export type OnboardingDocumentStatus = 'not_required' | 'pending' | 'sent' | 'signed';

export type ActivityType =
  | 'call' | 'email_sent' | 'email_received' | 'meeting' | 'note'
  | 'task' | 'sms' | 'whatsapp' | 'linkedin' | 'demo' | 'proposal'
  | 'document' | 'stage_change' | 'status_change' | 'assignment' | 'custom';

export type CallOutcome = 'connected' | 'voicemail' | 'no_answer' | 'busy' | 'wrong_number';
export type CallDirection = 'inbound' | 'outbound';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export type FieldType =
  | 'text' | 'textarea' | 'number' | 'currency' | 'date' | 'datetime'
  | 'select' | 'multi_select' | 'checkbox' | 'email' | 'phone' | 'url'
  | 'user' | 'contact' | 'company' | 'rating' | 'percentage';

export type EntityType = 'contact' | 'company' | 'deal' | 'project' | 'activity';

export type UserStatus = 'active' | 'inactive' | 'suspended' | 'invited';

export type AuditAction =
  | 'create' | 'update' | 'delete' | 'restore'
  | 'login' | 'logout' | 'login_failed'
  | 'export' | 'import' | 'bulk_update' | 'bulk_delete'
  | 'assign' | 'unassign'
  | 'tag_add' | 'tag_remove'
  | 'stage_change'
  | 'permission_change' | 'role_change'
  | 'dashboard_publish' | 'dashboard_unpublish'
  | 'api_access'
  | 'report_generated';

export type DashboardVisibility = 'private' | 'team' | 'everyone';
export type SavedViewVisibility = 'private' | 'team' | 'everyone';
export type DashboardDataSource = 'client' | 'partner' | 'enterprise';

export type DealContactRole = 'primary' | 'decision_maker' | 'champion' | 'influencer' | 'stakeholder' | 'blocker';

export type WidgetType =
  | 'metric_card' | 'bar_chart' | 'line_chart' | 'pie_chart' | 'funnel_chart'
  | 'table' | 'pipeline_summary' | 'activity_feed' | 'leaderboard'
  | 'goal_tracker' | 'conversion_rate' | 'time_in_stage' | 'forecast' | 'custom_query'
  | 'onboarding_stats';

// Filter engine types
export type FilterOperator =
  | 'eq' | 'neq'
  | 'contains' | 'not_contains'
  | 'starts_with' | 'ends_with'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'in' | 'not_in'
  | 'contains_any' | 'contains_all'
  | 'is_empty' | 'is_not_empty'
  | 'between'
  | 'current_user'
  | 'current_user_team';

export interface FilterCondition {
  field: string;
  operator: FilterOperator;
  value: unknown;
}

export interface FilterConfig {
  conditions: FilterCondition[];
  logic: 'AND' | 'OR';
}

// Pagination
export interface CursorPagination {
  cursor?: string;
  limit: number;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
  total?: number;
}

// Permission types
export type PermissionLevel = boolean | 'own' | 'team' | 'all';

export interface RolePermissions {
  contacts?: { create?: boolean; read?: PermissionLevel; update?: PermissionLevel; delete?: boolean; export?: boolean };
  companies?: { create?: boolean; read?: PermissionLevel; update?: PermissionLevel; delete?: boolean; export?: boolean };
  deals?: { create?: boolean; read?: PermissionLevel; update?: PermissionLevel; delete?: boolean; export?: boolean };
  activities?: { create?: boolean; read?: PermissionLevel; update?: PermissionLevel; delete?: boolean };
  dashboards?: { create?: boolean; read?: PermissionLevel; update?: PermissionLevel; delete?: boolean; publish?: boolean };
  settings?: { users?: boolean; roles?: boolean; custom_fields?: boolean; tags?: boolean; pipelines?: boolean };
  reports?: { view?: boolean; export?: boolean };
  imports?: { create?: boolean };
  audit_log?: { read?: boolean };
  tags?: { manage?: boolean };
  users?: { manage?: boolean };
  roles?: { manage?: boolean };
  telegram?: { manage?: boolean };
  digests?: { manage?: boolean };
  tasks?: { assign?: boolean };
}

// Session user type
export interface SessionUser {
  id: UUID;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  roleId: UUID;
  role: {
    id: UUID;
    name: string;
    slug: string;
    permissions: RolePermissions;
  };
}

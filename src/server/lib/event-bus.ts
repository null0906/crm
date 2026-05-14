import mitt from 'mitt';

export type CRMEvent = {
  'contact.created': { contactId: string; createdBy: string };
  'contact.updated': { contactId: string; changes: Record<string, unknown>; updatedBy: string };
  'contact.deleted': { contactId: string; deletedBy: string };
  'company.created': { companyId: string; createdBy: string };
  'company.updated': { companyId: string; changes: Record<string, unknown>; updatedBy: string };
  'company.deleted': { companyId: string; deletedBy: string };
  'deal.created': { dealId: string; createdBy: string };
  'deal.updated': { dealId: string; changes: Record<string, unknown>; updatedBy: string };
  'deal.deleted': { dealId: string; deletedBy: string };
  'deal.stage_changed': { dealId: string; fromStageId: string | null; toStageId: string; movedBy: string };
  'deal.progress_updated': {
    dealId: string;
    progressPercent: number;
    isDelayed?: boolean;
    delayReason?: string | null;
    revisedEndDate?: string | Date | null;
  };
  'deal.won': { dealId: string; amount: number | null; wonBy: string };
  'deal.lost': { dealId: string; reason: string; lostBy: string };
  'project.created': { projectId: string; dealId?: string | null; companyId?: string | null; createdBy: string };
  'project.stage_changed': { projectId: string; fromStage: string | null; toStage: string; movedBy: string };
  'activity.created': { activityId: string; activityType: string; entityIds: string[]; performedBy: string };
  'tag.added': { entityType: string; entityId: string; tagId: string; taggedBy: string };
  'tag.removed': { entityType: string; entityId: string; tagId: string; untaggedBy: string };
  'assignment.changed': { entityType: string; entityId: string; oldOwnerId: string | null; newOwnerId: string; changedBy: string };
  'import.completed': { importId: string; recordCount: number; errorCount: number; userId: string };
  'user.login': { userId: string; email: string; ip: string };
  'user.logout': { userId: string };
  'user.login_failed': { email: string; ip: string };
};

// Singleton event emitter
const eventBus = mitt<CRMEvent>();

export default eventBus;

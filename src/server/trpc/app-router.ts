import { router } from './router';
import { contactRouter } from './routers/contact.router';
import { companyRouter } from './routers/company.router';
import { dealRouter } from './routers/deal.router';
import { pipelineRouter } from './routers/pipeline.router';
import { tagRouter } from './routers/tag.router';
import { customFieldRouter } from './routers/custom-field.router';
import { activityRouter } from './routers/activity.router';
import { dashboardRouter } from './routers/dashboard.router';
import { userRouter } from './routers/user.router';
import { searchRouter } from './routers/search.router';
import { auditLogRouter } from './routers/audit-log.router';
import { notificationRouter } from './routers/notification.router';
import { savedViewRouter } from './routers/saved-view.router';
import { importRouter } from './routers/import.router';
import { telegramRouter } from './routers/telegram.router';
import { digestRouter } from './routers/digest.router';
import { automationRouter } from './routers/automation.router';
import { partnerRouter } from './routers/partner.router';
import { aiChatRouter } from './routers/ai-chat.router';
import { dealTasksRouter } from './routers/deal-tasks.router';
import { demoRecordsRouter } from './routers/demo-records.router';
import { projectsRouter } from './routers/projects.router';
import { reportsRouter } from './routers/reports.router';
import { complianceRouter } from './routers/compliance.router';
import { onboardingRouter } from './routers/onboarding.router';

export const appRouter = router({
  contacts: contactRouter,
  companies: companyRouter,
  deals: dealRouter,
  pipelines: pipelineRouter,
  tags: tagRouter,
  customFields: customFieldRouter,
  activities: activityRouter,
  dashboards: dashboardRouter,
  users: userRouter,
  search: searchRouter,
  auditLog: auditLogRouter,
  notifications: notificationRouter,
  savedViews: savedViewRouter,
  import: importRouter,
  telegram: telegramRouter,
  digests: digestRouter,
  automation: automationRouter,
  partners: partnerRouter,
  aiChat: aiChatRouter,
  dealTasks: dealTasksRouter,
  demoRecords: demoRecordsRouter,
  projects: projectsRouter,
  reports: reportsRouter,
  compliance: complianceRouter,
  onboarding: onboardingRouter,
});

export type AppRouter = typeof appRouter;

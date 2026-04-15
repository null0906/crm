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
});

export type AppRouter = typeof appRouter;

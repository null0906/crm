import { t } from './trpc-init';
import { isAuthenticated } from './middleware';

export { t };
export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(isAuthenticated);
export const mergeRouters = t.mergeRouters;

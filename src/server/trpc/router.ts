import { t } from './trpc-init';
import { isAuthenticated, requireFinancialAccess } from './middleware';

export { t };
export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(isAuthenticated);
/** Cost, margin and collections data. Gated on the per-user financial
 *  entitlement (FR-X-05), independent of the role permission matrix. */
export const financialProcedure = protectedProcedure.use(requireFinancialAccess);
export const mergeRouters = t.mergeRouters;

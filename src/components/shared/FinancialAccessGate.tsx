'use client';

import React from 'react';
import { Lock } from 'lucide-react';
import { trpc } from '@/lib/trpc';

/**
 * Client-side view of the per-user financial entitlement (FR-X-05).
 *
 * Read from `users.me`, not from the session. The NextAuth JWT is written at
 * login and lasts 7 days, so a revoked entitlement would keep working for up to
 * a week if this came from useSession(). `users.me` hits the database per call.
 *
 * This is presentation only. The server is the real gate — every cost-bearing
 * procedure runs through `requireFinancialAccess` regardless of what the UI
 * decides to render.
 */
export function useFinancialAccess(): { hasAccess: boolean; isLoading: boolean } {
  const { data, isLoading } = trpc.users.me.useQuery();
  return {
    // Mirrors canSeeFinancials() on the server: super admins are implicit.
    hasAccess: data?.hasFinancialAccess === true || data?.role?.slug === 'super_admin',
    isLoading,
  };
}

export function FinancialAccessGate({
  children,
  what = 'this',
}: {
  children: React.ReactNode;
  /** Named in the refusal, so the message says what is being withheld. */
  what?: string;
}) {
  const { hasAccess, isLoading } = useFinancialAccess();

  if (isLoading) {
    return (
      <div className="px-1 py-10 text-center text-[12px] text-slate-400">Checking access…</div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="rounded-xl border border-slate-200/80 bg-white px-6 py-10 text-center shadow-[0_1px_4px_rgba(16,24,40,0.04)]">
        <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100">
          <Lock className="h-4 w-4 text-slate-400" strokeWidth={1.75} />
        </div>
        <p className="text-[13px] font-medium text-slate-800">Financial access required</p>
        <p className="mx-auto mt-1 max-w-sm text-[11px] leading-relaxed text-slate-400">
          Delivery cost, rates and margin are restricted to people granted financial access. You can
          still see {what} exists — just not what it costs. Ask a super admin if you need it.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

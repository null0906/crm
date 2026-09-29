'use client';

import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { ServiceLinesSettings } from '@/components/service-lines/ServiceLinesSettings';

/**
 * Everything a service line needs configuring for, in one place.
 *
 * Replaces /settings/effort-catalog, which split the same subject across two
 * tabs — questions on one, baselines on the other — while the list of services
 * itself was a source constant that needed a deploy to change. Setting up a new
 * service took a code change and two screens, and no screen showed what a given
 * service was actually configured with.
 *
 * Reads stay open, as they were on the catalog: an estimator needs the
 * questions and the role checklist, and neither is money. Writes are gated, and
 * so is the ideal cost on both sides — the server redacts it out of the
 * baseline payload for anyone without the entitlement.
 */
export default function ServiceLinesSettingsPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <Link
        href="/settings"
        className="mb-4 inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600"
      >
        <ChevronLeft className="h-3 w-3" />
        Settings
      </Link>

      <div className="mb-6">
        <h1 className="text-[15px] font-semibold tracking-tight text-slate-900">Service lines</h1>
        <p className="mt-0.5 text-xs text-slate-400">
          What we sell, what a standard engagement of each ought to cost, and the questions that
          say when one is bigger than standard.
        </p>
      </div>

      <ServiceLinesSettings />
    </div>
  );
}

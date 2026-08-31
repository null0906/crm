'use client';

import { useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import {
  SERVICE_LINES,
  SERVICE_LINE_ANY,
  serviceLineLabel,
  type ServiceLine,
} from '@/lib/service-lines';

/**
 * The configured service lines, for anything that renders or offers one.
 *
 * Falls back to the `SERVICE_LINES` constant rather than returning nothing
 * while the query is in flight. Every caller here is rendering a label or
 * filling a dropdown, and both are worse empty than briefly stale — the
 * constant is what seeded the table, so on a normal install the fallback and
 * the answer agree.
 *
 * `label` resolves against whichever list is in hand and falls through to the
 * raw slug, so a service line retired after an estimate was written still reads
 * as itself instead of vanishing.
 */
export function useServiceLines(options?: { includeInactive?: boolean }) {
  const { data, isLoading } = trpc.serviceLines.list.useQuery({
    includeInactive: options?.includeInactive ?? false,
  });

  return useMemo(() => {
    const lines: ServiceLine[] = data
      ? data.map((s) => ({ slug: s.slug, label: s.label, isActive: s.isActive }))
      : [...SERVICE_LINES];
    const bySlug = new Map(lines.map((s) => [s.slug, s]));

    return {
      lines,
      active: lines.filter((s) => s.isActive),
      isLoading,
      /** True once the configured list has arrived, so callers can hold back a write. */
      isConfigured: data !== undefined,
      label(slug: string | null | undefined): string {
        if (!slug) return 'Not set';
        if (slug === SERVICE_LINE_ANY) return 'All service lines';
        return bySlug.get(slug)?.label ?? serviceLineLabel(slug);
      },
    };
  }, [data, isLoading]);
}

'use client';

import { useParams } from 'next/navigation';
import { EstimateBuilder } from '@/components/estimates/EstimateBuilder';

/**
 * Client component with useParams(), matching the convention in
 * deals/[id]/page.tsx. Next 16 makes `params` a Promise in server components;
 * this route sidesteps that entirely.
 */
export default function EstimateBuilderPage() {
  const params = useParams<{ id: string; estimateId: string }>();
  return (
    <EstimateBuilder
      dealId={String(params.id ?? '')}
      estimateId={String(params.estimateId ?? '')}
    />
  );
}

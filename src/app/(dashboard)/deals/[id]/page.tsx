'use client';

import { useRouter, useParams } from 'next/navigation';
import { DealDetail } from '@/components/deals/DealDetail';

export default function DealRecordPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const dealId = String(params.id ?? '');

  return (
    <DealDetail
      dealId={dealId}
      open
      onClose={() => router.push('/deals')}
    />
  );
}

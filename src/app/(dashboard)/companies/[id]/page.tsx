'use client';

import { useRouter, useParams } from 'next/navigation';
import { CompanyDetail } from '@/components/companies/CompanyDetail';

export default function CompanyRecordPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const companyId = String(params.id ?? '');

  return (
    <CompanyDetail
      companyId={companyId}
      open
      onClose={() => router.push('/companies')}
      onDeleted={() => router.push('/companies')}
    />
  );
}

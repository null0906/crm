'use client';

import { useParams } from 'next/navigation';
import { ReportPage } from '@/components/reports/ReportPage';

export default function RepReportPage() {
  const params = useParams<{ userId: string }>();
  return <ReportPage userId={params.userId} />;
}

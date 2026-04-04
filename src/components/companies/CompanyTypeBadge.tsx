import React from 'react';
import { Badge } from '@/components/ui/badge';

const typeConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info' }> = {
  prospect: { label: 'Prospect', variant: 'secondary' },
  customer: { label: 'Customer', variant: 'success' },
  partner: { label: 'Partner', variant: 'info' },
  vendor: { label: 'Vendor', variant: 'warning' },
  competitor: { label: 'Competitor', variant: 'destructive' },
  other: { label: 'Other', variant: 'outline' },
};

export function CompanyTypeBadge({ type }: { type: string }) {
  const config = typeConfig[type] ?? { label: type, variant: 'secondary' as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

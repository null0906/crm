import React from 'react';
import { Badge } from '@/components/ui/badge';
import { CONTACT_STATUSES } from '@/lib/constants';

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info' }> = {
  new: { label: 'New', variant: 'secondary' },
  contacted: { label: 'Contacted', variant: 'info' },
  qualified: { label: 'Qualified', variant: 'default' },
  unqualified: { label: 'Unqualified', variant: 'destructive' },
  nurturing: { label: 'Nurturing', variant: 'warning' },
  converted: { label: 'Converted', variant: 'success' },
  lost: { label: 'Lost', variant: 'destructive' },
  archived: { label: 'Archived', variant: 'outline' },
};

export function ContactStatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] ?? { label: status, variant: 'secondary' as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

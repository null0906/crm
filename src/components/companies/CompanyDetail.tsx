'use client';

import React, { useState } from 'react';
import { Globe, Phone, X, Pencil, Trash2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { SlideOverPanel } from '@/components/shared/SlideOverPanel';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DetailSkeleton } from '@/components/shared/LoadingSkeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { CompanyTypeBadge } from './CompanyTypeBadge';
import { CompanyForm } from './CompanyForm';
import { TagBadge } from '@/components/tags/TagBadge';
import { ActivityFeed } from '@/components/activities/ActivityFeed';
import { formatDate, formatRelative } from '@/lib/formatters';
import { toast } from 'sonner';

interface CompanyDetailProps {
  companyId: string;
  open: boolean;
  onClose: () => void;
  onDeleted?: () => void;
}

export function CompanyDetail({ companyId, open, onClose, onDeleted }: CompanyDetailProps) {
  const utils = trpc.useUtils();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: company, isLoading } = trpc.companies.getById.useQuery(
    { id: companyId },
    { enabled: !!companyId && open }
  );

  const removeTags = trpc.companies.removeTags.useMutation({
    onSuccess: () => {
      void utils.companies.getById.invalidate({ id: companyId });
      toast.success('Tag removed');
    },
  });

  const deleteCompany = trpc.companies.delete.useMutation({
    onSuccess: () => {
      toast.success('Company deleted');
      void utils.companies.list.invalidate();
      setDeleteOpen(false);
      onClose();
      onDeleted?.();
    },
    onError: (err) => toast.error('Failed to delete', { description: err.message }),
  });

  if (!open) return null;

  const tags = (company?.tags as Array<{ id: string; name: string; color: string }>) ?? [];
  const metrics = company?.metrics as { contactCount: number } | undefined;

  const name = company?.name as string | undefined;
  const industry = company?.industry as string | undefined;
  const companyType = (company?.companyType as string | undefined) ?? 'prospect';
  const companySize = company?.companySize as string | undefined;
  const website = company?.website as string | undefined;
  const phone = company?.phone as string | undefined;
  const domain = company?.domain as string | undefined;
  const city = company?.city as string | undefined;
  const country = company?.country as string | undefined;
  const annualRevenueRange = company?.annualRevenueRange as string | undefined;
  const lastContactedAt = company?.lastContactedAt as Date | undefined;
  const createdAt = company?.createdAt as Date | undefined;
  const ownerFirstName = company?.ownerFirstName as string | undefined;
  const ownerLastName = company?.ownerLastName as string | undefined;
  const description = company?.description as string | undefined;
  const ownerId = company?.ownerId as string | null | undefined;

  const editDefaults = company ? {
    name: name ?? '',
    industry: industry ?? '',
    companyType: (companyType as 'prospect' | 'customer' | 'partner' | 'vendor' | 'competitor' | 'other') ?? 'prospect',
    companySize: (companySize as '1-10' | '11-50' | '51-200' | '201-500' | '501-1000' | '1001-5000' | '5000+') ?? undefined,
    website: website ?? '',
    phone: phone ?? '',
    domain: domain ?? '',
    city: city ?? '',
    country: country ?? '',
    annualRevenueRange: annualRevenueRange ?? '',
    ownerId: ownerId ?? '',
    description: description ?? '',
    status: (company?.status as 'active' | 'inactive' | 'churned' | 'archived') ?? 'active',
  } : undefined;

  return (
    <>
      <SlideOverPanel open={open} onClose={onClose} width="lg">
        {isLoading ? (
          <DetailSkeleton />
        ) : !company ? (
          <div className="p-6 text-center text-slate-500">Company not found</div>
        ) : (
          <div>
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-slate-200">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <Avatar className="w-12 h-12">
                    <AvatarFallback className="text-base bg-indigo-100 text-indigo-700 font-semibold">
                      {name?.substring(0, 2).toUpperCase() ?? '?'}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900">{name}</h2>
                    {industry && <p className="text-sm text-slate-500">{industry}</p>}
                    <div className="flex items-center gap-2 mt-1.5">
                      <CompanyTypeBadge type={companyType} />
                      {companySize && (
                        <Badge variant="outline" className="text-xs">{companySize} employees</Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditOpen(true)}
                    className="text-slate-400 hover:text-blue-600"
                    title="Edit company"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleteOpen(true)}
                    className="text-slate-400 hover:text-red-600"
                    title="Delete company"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 ml-1">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-3">
                  {tags.map((tag) => (
                    <TagBadge
                      key={tag.id}
                      name={tag.name}
                      color={tag.color}
                      onRemove={() => removeTags.mutate({ id: companyId, tagIds: [tag.id] })}
                    />
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 mt-4">
                {website && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={website} target="_blank" rel="noopener noreferrer">
                      <Globe className="w-3.5 h-3.5 mr-1" />
                      Website
                    </a>
                  </Button>
                )}
                {phone && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={`tel:${phone}`}>
                      <Phone className="w-3.5 h-3.5 mr-1" />
                      Call
                    </a>
                  </Button>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="px-6 py-4">
              <Tabs defaultValue="overview">
                <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="activity">Activity</TabsTrigger>
                  <TabsTrigger value="contacts">Contacts</TabsTrigger>
                  <TabsTrigger value="deals">Deals</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="mt-4">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                    {domain && <InfoField label="Domain" value={domain} mono />}
                    {phone && <InfoField label="Phone" value={phone} />}
                    {city && <InfoField label="City" value={city} />}
                    {country && <InfoField label="Country" value={country} />}
                    {annualRevenueRange && <InfoField label="Annual Revenue" value={annualRevenueRange} />}
                    {metrics && metrics.contactCount > 0 && (
                      <InfoField label="Contacts" value={String(metrics.contactCount)} />
                    )}
                    {createdAt && <InfoField label="Created" value={formatDate(createdAt)} />}
                    {lastContactedAt && <InfoField label="Last Contacted" value={formatRelative(lastContactedAt)} />}
                    {ownerFirstName && (
                      <InfoField label="Owner" value={`${ownerFirstName} ${ownerLastName ?? ''}`} />
                    )}
                  </div>

                  {description && (
                    <div className="mt-4">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Notes</p>
                      <p className="text-sm text-slate-700">{description}</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="activity" className="mt-4">
                  <ActivityFeed companyId={companyId} />
                </TabsContent>

                <TabsContent value="contacts" className="mt-4">
                  <CompanyContacts companyId={companyId} />
                </TabsContent>

                <TabsContent value="deals" className="mt-4">
                  <CompanyDeals companyId={companyId} />
                </TabsContent>
              </Tabs>
            </div>
          </div>
        )}
      </SlideOverPanel>

      {/* Edit panel */}
      <SlideOverPanel open={editOpen} onClose={() => setEditOpen(false)} title="Edit Company" width="md">
        <div className="p-6">
          <CompanyForm
            mode="edit"
            companyId={companyId}
            defaultValues={editDefaults}
            existingTags={tags}
            onSuccess={() => {
              setEditOpen(false);
              void utils.companies.getById.invalidate({ id: companyId });
            }}
            onCancel={() => setEditOpen(false)}
          />
        </div>
      </SlideOverPanel>

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete company?"
        description={`${name} will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        loading={deleteCompany.isPending}
        onConfirm={() => deleteCompany.mutate({ id: companyId })}
      />
    </>
  );
}

function InfoField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className={`text-sm text-slate-800 ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}

function CompanyDeals({ companyId }: { companyId: string }) {
  const { data: deals = [], isLoading } = trpc.deals.byCompany.useQuery({ companyId });

  const statusColor: Record<string, string> = {
    open: 'bg-blue-100 text-blue-700',
    won: 'bg-emerald-100 text-emerald-700',
    lost: 'bg-red-100 text-red-700',
    abandoned: 'bg-slate-100 text-slate-500',
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-12 rounded-lg" />
        ))}
      </div>
    );
  }

  if (deals.length === 0) {
    return (
      <div className="text-center py-10 text-slate-400">
        <p className="text-sm">No deals linked to this company yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {deals.map((deal) => {
        const d = deal as Record<string, unknown>;
        const status = (d.status as string) ?? 'open';
        const amount = d.amount ? Number(d.amount) : null;
        return (
          <div key={d.id as string} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-100 bg-slate-50 hover:bg-white hover:border-slate-200 transition-colors">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-slate-800 truncate">{d.title as string}</p>
              <p className="text-[11px] text-slate-400 truncate">
                {!!d.stageName && <span>{d.stageName as string}</span>}
                {!!d.primaryContactName && <span> · {d.primaryContactName as string}</span>}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {amount !== null && (
                <span className="text-[12px] font-semibold text-slate-700">
                  ₹{amount.toLocaleString('en-IN')}
                </span>
              )}
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${statusColor[status] ?? 'bg-slate-100 text-slate-500'}`}>
                {status}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CompanyContacts({ companyId }: { companyId: string }) {
  const { data: contacts = [], isLoading } = trpc.contacts.byCompany.useQuery({ companyId });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-12 rounded-lg" />
        ))}
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <div className="text-center py-10 text-slate-400">
        <p className="text-sm">No contacts linked to this company yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {contacts.map((contact) => {
        const c = contact as Record<string, unknown>;
        return (
          <div key={c.id as string} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-100 bg-slate-50 hover:bg-white hover:border-slate-200 transition-colors">
            <Avatar className="w-8 h-8 flex-shrink-0">
              <AvatarFallback className="text-[11px] bg-blue-100 text-blue-700">
                {String(c.firstName ?? '').charAt(0)}{String(c.lastName ?? '').charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-slate-800 truncate">
                {c.firstName as string} {c.lastName as string}
              </p>
              <p className="text-[11px] text-slate-400 truncate">
                {c.jobTitle ? `${c.jobTitle as string}` : ''}{c.jobTitle && c.email ? ' · ' : ''}{c.email as string ?? ''}
              </p>
            </div>
            <Badge variant="secondary" className="capitalize text-[10px] flex-shrink-0">{c.status as string}</Badge>
          </div>
        );
      })}
    </div>
  );
}

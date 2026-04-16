'use client';

import React, { useState } from 'react';
import { Mail, Phone, X, Link2, Pencil, Trash2, BellRing } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { SlideOverPanel } from '@/components/shared/SlideOverPanel';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DetailSkeleton } from '@/components/shared/LoadingSkeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ContactStatusBadge } from './ContactStatusBadge';
import { ContactForm } from './ContactForm';
import { ContactReminderDialog } from './ContactReminderDialog';
import { TagBadge } from '@/components/tags/TagBadge';
import { ActivityFeed } from '@/components/activities/ActivityFeed';
import { formatDate, formatRelative, getInitials } from '@/lib/formatters';
import { toast } from 'sonner';

interface ContactDetailProps {
  contactId: string;
  open: boolean;
  onClose: () => void;
  onDeleted?: () => void;
}

export function ContactDetail({ contactId, open, onClose, onDeleted }: ContactDetailProps) {
  const utils = trpc.useUtils();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);

  const { data: contact, isLoading } = trpc.contacts.getById.useQuery(
    { id: contactId },
    { enabled: !!contactId && open }
  );

  const removeTags = trpc.contacts.removeTags.useMutation({
    onSuccess: () => {
      void utils.contacts.getById.invalidate({ id: contactId });
      toast.success('Tag removed');
    },
  });

  const deleteContact = trpc.contacts.delete.useMutation({
    onSuccess: () => {
      toast.success('Contact deleted');
      void utils.contacts.list.invalidate();
      setDeleteOpen(false);
      onClose();
      onDeleted?.();
    },
    onError: (err) => toast.error('Failed to delete', { description: err.message }),
  });

  if (!open) return null;

  const tags = (contact?.tags as Array<{ id: string; name: string; color: string }>) ?? [];

  const firstName = contact?.firstName as string | undefined;
  const lastName = contact?.lastName as string | undefined;
  const jobTitle = contact?.jobTitle as string | undefined;
  const companyName = contact?.companyName as string | undefined;
  const status = contact?.status as string | undefined;
  const leadScore = contact?.leadScore as number | null | undefined;
  const email = contact?.email as string | undefined;
  const phone = contact?.phone as string | undefined;
  const mobile = contact?.mobile as string | undefined;
  const linkedinUrl = contact?.linkedinUrl as string | undefined;
  const department = contact?.department as string | undefined;
  const source = contact?.source as string | undefined;
  const country = contact?.country as string | undefined;
  const city = contact?.city as string | undefined;
  const createdAt = contact?.createdAt as Date | undefined;
  const lastContactedAt = contact?.lastContactedAt as Date | null | undefined;
  const ownerFirstName = contact?.ownerFirstName as string | undefined;
  const ownerLastName = contact?.ownerLastName as string | undefined;
  const description = contact?.description as string | undefined;
  const ownerId = contact?.ownerId as string | null | undefined;
  const companyId = contact?.companyId as string | null | undefined;
  const contactFullName = [firstName, lastName].filter(Boolean).join(' ').trim();

  // Build defaultValues for edit form
  const editDefaults = contact ? {
    firstName: firstName ?? '',
    lastName: lastName ?? '',
    email: email ?? '',
    phone: phone ?? '',
    mobile: mobile ?? '',
    jobTitle: jobTitle ?? '',
    department: department ?? '',
    companyName: companyName ?? '',
    status: (status as 'new' | 'contacted' | 'qualified' | 'unqualified' | 'nurturing' | 'converted' | 'lost' | 'archived') ?? 'new',
    source: (source as 'apollo' | 'manual' | 'website' | 'referral' | 'event' | 'cold_outreach') ?? undefined,
    ownerId: ownerId ?? '',
    description: description ?? '',
    leadScore: (contact?.leadScore as number) ?? 0,
    companyId: (contact?.companyId as string) ?? '',
    country: country ?? '',
    city: city ?? '',
  } : undefined;

  return (
    <>
      <SlideOverPanel open={open} onClose={onClose} width="lg">
        {isLoading ? (
          <DetailSkeleton />
        ) : !contact ? (
          <div className="p-6 text-center text-slate-500">Contact not found</div>
        ) : (
          <div>
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-slate-200">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <Avatar className="w-12 h-12">
                    <AvatarFallback className="text-base bg-blue-100 text-blue-700">
                      {getInitials(firstName, lastName)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900">
                      {firstName} {lastName}
                    </h2>
                    {jobTitle && (
                      <p className="text-sm text-slate-500">
                        {jobTitle}
                        {companyName && (
                          <> at <span className="text-blue-600">{companyName}</span></>
                        )}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      {status && <ContactStatusBadge status={status} />}
                      {leadScore !== null && leadScore !== undefined && (
                        <Badge variant="outline" className="text-xs">
                          Score: {leadScore}
                        </Badge>
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
                    title="Edit contact"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleteOpen(true)}
                    className="text-slate-400 hover:text-red-600"
                    title="Delete contact"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 ml-1">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Tags */}
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-3">
                  {tags.map((tag) => (
                    <TagBadge
                      key={tag.id}
                      name={tag.name}
                      color={tag.color}
                      onRemove={() => removeTags.mutate({ id: contactId, tagIds: [tag.id] })}
                    />
                  ))}
                </div>
              )}

              {/* Quick actions */}
              <div className="flex items-center gap-2 mt-4">
                {email && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={`mailto:${email}`}>
                      <Mail className="w-3.5 h-3.5 mr-1" />
                      Email
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
                {linkedinUrl && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={linkedinUrl} target="_blank" rel="noopener noreferrer">
                      <Link2 className="w-3.5 h-3.5 mr-1" />
                      LinkedIn
                    </a>
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setReminderOpen(true)}>
                  <BellRing className="w-3.5 h-3.5 mr-1" />
                  Set Reminder
                </Button>
              </div>
            </div>

            {/* Tabs */}
            <div className="px-6 py-4">
              <Tabs defaultValue="overview">
                <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="activity">Activity</TabsTrigger>
                  <TabsTrigger value="deals">Deals</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="mt-4">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                    {email && <InfoField label="Email" value={email} mono />}
                    {phone && <InfoField label="Phone" value={phone} />}
                    {mobile && <InfoField label="Mobile" value={mobile} />}
                    {department && <InfoField label="Department" value={department} />}
                    {source && <InfoField label="Source" value={source} />}
                    {country && <InfoField label="Country" value={country} />}
                    {city && <InfoField label="City" value={city} />}
                    {createdAt && <InfoField label="Created" value={formatDate(createdAt)} />}
                    <InfoField
                      label="Last Contacted"
                      value={lastContactedAt ? formatRelative(lastContactedAt) : '—'}
                    />
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
                  <ActivityFeed contactId={contactId} />
                </TabsContent>

                <TabsContent value="deals" className="mt-4">
                  <ContactDeals contactId={contactId} />
                </TabsContent>
              </Tabs>
            </div>
          </div>
        )}
      </SlideOverPanel>

      {/* Edit panel */}
      <SlideOverPanel open={editOpen} onClose={() => setEditOpen(false)} title="Edit Contact" width="md">
        <div className="p-6">
          <ContactForm
            mode="edit"
            contactId={contactId}
            defaultValues={editDefaults}
            existingTags={tags}
            onSuccess={() => {
              setEditOpen(false);
              void utils.contacts.getById.invalidate({ id: contactId });
            }}
            onCancel={() => setEditOpen(false)}
          />
        </div>
      </SlideOverPanel>

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete contact?"
        description={`${firstName} ${lastName} will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        loading={deleteContact.isPending}
        onConfirm={() => deleteContact.mutate({ id: contactId })}
      />

      <ContactReminderDialog
        open={reminderOpen}
        onOpenChange={setReminderOpen}
        contactId={contactId}
        contactName={contactFullName || undefined}
        companyId={companyId}
        onCreated={() => {
          void utils.activities.list.invalidate();
        }}
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

function ContactDeals({ contactId }: { contactId: string }) {
  const { data: deals = [], isLoading } = trpc.deals.byContact.useQuery({ contactId });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-14 rounded-lg" />
        ))}
      </div>
    );
  }

  if (deals.length === 0) {
    return (
      <div className="text-center py-10 text-slate-400">
        <p className="text-sm">No deals linked to this contact yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {deals.map((deal) => {
        const d = deal as Record<string, unknown>;
        return (
          <div key={d.id as string} className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-slate-100 bg-slate-50 hover:bg-white hover:border-slate-200 transition-colors">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-slate-800 truncate">{d.title as string}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {!!d.stageName && (
                  <span className="text-[11px] text-slate-400">{d.stageName as string}</span>
                )}
                {!!d.companyName && (
                  <span className="text-[11px] text-slate-400">· {d.companyName as string}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 ml-3">
              {d.amount != null && (
                <span className="text-[13px] font-semibold text-slate-700 tabular-nums">
                  {Number(d.amount).toLocaleString('en-IN', { style: 'currency', currency: (d.currency as string) || 'INR', maximumFractionDigits: 0 })}
                </span>
              )}
              <Badge variant="secondary" className="capitalize text-[10px]">{d.status as string}</Badge>
            </div>
          </div>
        );
      })}
    </div>
  );
}

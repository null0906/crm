'use client';

import React, { useState } from 'react';
import {
  Handshake, Plus, Search, Building2, TrendingUp, Users,
  ChevronDown, ChevronRight, ExternalLink,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useDebounce } from '@/hooks/useDebounce';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { SlideOverPanel } from '@/components/shared/SlideOverPanel';
import { CompanyForm } from '@/components/companies/CompanyForm';
import { CompanyDetail } from '@/components/companies/CompanyDetail';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { toast } from 'sonner';

type Company = Record<string, unknown>;
type Deal = Record<string, unknown>;
type Contact = Record<string, unknown>;

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-50 text-blue-700 border border-blue-200',
  won: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  lost: 'bg-red-50 text-red-700 border border-red-200',
};

function PartnerRow({ partner }: { partner: Company }) {
  const [expanded, setExpanded] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const partnerId = String(partner.id);

  const { data: dealsData } = trpc.deals.byCompany.useQuery(
    { companyId: partnerId },
    { enabled: expanded }
  );
  // Contacts linked to this partner company
  const { data: partnerContacts } = trpc.contacts.list.useQuery(
    {
      filters: {
        conditions: [{ field: 'companyId', operator: 'eq', value: partnerId }],
        logic: 'AND',
      },
      pagination: { limit: 50 },
    },
    { enabled: expanded }
  );

  const deals = (dealsData ?? []) as Deal[];
  const contacts = (partnerContacts?.items ?? []) as Contact[];
  const totalValue = deals.reduce((sum, d) => sum + (parseFloat(String(d.amount ?? '0')) || 0), 0);
  const wonDeals = deals.filter((d) => d.status === 'won');

  return (
    <>
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
        {/* Partner header row */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors text-left"
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Avatar className="w-9 h-9 flex-shrink-0">
              <AvatarFallback className="text-sm bg-violet-100 text-violet-700 font-semibold">
                {String(partner.name ?? '').substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-900 truncate">{String(partner.name)}</span>
                {Boolean(partner.industry) && (
                  <span className="text-xs text-slate-400">{String(partner.industry)}</span>
                )}
              </div>
              {Boolean(partner.domain) && (
                <span className="text-xs text-slate-400 font-mono">{String(partner.domain)}</span>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-6 flex-shrink-0">
            <div className="text-center">
              <p className="text-sm font-bold text-slate-800">{deals.length}</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Deals</p>
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-emerald-700">{wonDeals.length}</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Won</p>
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-slate-800">{contacts.length}</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Contacts</p>
            </div>
            <div className="text-center min-w-[80px]">
              <p className="text-sm font-bold text-slate-800">
                {totalValue > 0 ? formatCurrency(totalValue, String(deals[0]?.currency ?? 'INR')) : '—'}
              </p>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Pipeline</p>
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setSelectedCompany(partner); }}
            className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-blue-600 flex-shrink-0"
            title="Open partner details"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>

          {expanded
            ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
            : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
          }
        </button>

        {/* Expanded: deals + contacts */}
        {expanded && (
          <div className="border-t border-slate-100 grid grid-cols-2 divide-x divide-slate-100">
            {/* Deals */}
            <div className="p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-semibold text-slate-600">Deals from this partner</span>
              </div>
              {deals.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No deals linked to this partner yet.</p>
              ) : (
                <div className="space-y-2">
                  {deals.map((deal) => (
                    <div key={String(deal.id)} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-700 font-medium truncate flex-1">{String(deal.title)}</span>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {Boolean(deal.stageName) && (
                          <span className="text-slate-400">{String(deal.stageName)}</span>
                        )}
                        {Boolean(deal.amount) && (
                          <span className="font-mono text-slate-600">
                            {formatCurrency(parseFloat(String(deal.amount)), String(deal.currency ?? 'INR'))}
                          </span>
                        )}
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${STATUS_COLORS[String(deal.status ?? 'open')]}`}>
                          {String(deal.status)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Contacts */}
            <div className="p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <Users className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-semibold text-slate-600">Contacts at this partner</span>
              </div>
              {contacts.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No contacts linked to this partner yet.</p>
              ) : (
                <div className="space-y-2">
                  {contacts.map((contact) => (
                    <div key={String(contact.id)} className="flex items-center gap-2 text-xs">
                      <Avatar className="w-5 h-5 flex-shrink-0">
                        <AvatarFallback className="text-[9px] bg-blue-100 text-blue-700">
                          {String(contact.firstName ?? '').charAt(0)}{String(contact.lastName ?? '').charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-slate-700 font-medium">{String(contact.firstName)} {String(contact.lastName)}</span>
                      {Boolean(contact.jobTitle) && (
                        <span className="text-slate-400 truncate">{String(contact.jobTitle)}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Company detail slide-over */}
      {selectedCompany && (
        <CompanyDetail
          companyId={String(selectedCompany.id)}
          open={!!selectedCompany}
          onClose={() => setSelectedCompany(null)}
        />
      )}
    </>
  );
}

export default function PartnersPage() {
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const utils = trpc.useUtils();
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading } = trpc.companies.list.useQuery({
    search: debouncedSearch || undefined,
    filters: {
      conditions: [{ field: 'companyType', operator: 'eq', value: 'partner' }],
      logic: 'AND',
    },
    pagination: { limit: 200 },
  });

  const partners = (data?.items ?? []) as Company[];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white flex-shrink-0">
        <div>
          <h1 className="text-[15px] font-semibold text-slate-900 tracking-tight">Partners</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {data ? `${partners.length} partner${partners.length !== 1 ? 's' : ''}` : 'Loading...'} — companies of type "Partner" with their deals and contacts
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="w-4 h-4" />
          Add Partner
        </Button>
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-3 px-6 py-2.5 bg-white border-b border-slate-100 flex-shrink-0">
        <div className="relative flex-1 max-w-[320px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <Input
            placeholder="Search partners..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-[13px]"
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 ml-auto">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-violet-400 inline-block" />
            Partners are companies marked with type "Partner" across your CRM
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="border border-slate-200 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="skeleton w-9 h-9 rounded-full" />
                  <div className="space-y-1 flex-1">
                    <div className="skeleton h-4 w-48" />
                    <div className="skeleton h-3 w-32" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : partners.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-20">
            <div className="w-16 h-16 bg-violet-50 rounded-2xl flex items-center justify-center mb-4">
              <Handshake className="w-8 h-8 text-violet-400" />
            </div>
            <h2 className="text-base font-semibold text-slate-700 mb-1">
              {search ? 'No partners found' : 'No partners yet'}
            </h2>
            <p className="text-sm text-slate-400 mb-4 max-w-xs">
              {search
                ? `No partners matching "${search}"`
                : 'Add a company with type "Partner" to track partner relationships, deals, and contacts here.'}
            </p>
            {!search && (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="w-4 h-4" />
                Add Partner
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3 max-w-5xl">
            {/* Summary bar */}
            <div className="grid grid-cols-4 gap-3 mb-4">
              {[
                {
                  label: 'Total Partners',
                  value: partners.length,
                  color: 'text-violet-700',
                  bg: 'bg-violet-50 border-violet-100',
                },
                {
                  label: 'Active Partners',
                  value: partners.filter((p) => p.status === 'active').length,
                  color: 'text-emerald-700',
                  bg: 'bg-emerald-50 border-emerald-100',
                },
              ].map((stat) => (
                <div key={stat.label} className={`border rounded-xl p-3 text-center ${stat.bg}`}>
                  <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{stat.label}</p>
                </div>
              ))}
            </div>

            {partners.map((partner) => (
              <PartnerRow key={String(partner.id)} partner={partner} />
            ))}
          </div>
        )}
      </div>

      {/* Create partner (company with type=partner) */}
      <SlideOverPanel open={createOpen} onClose={() => setCreateOpen(false)} title="Add Partner" width="md">
        <div className="p-6">
          <CompanyForm
            defaultValues={{ companyType: 'partner' }}
            onSuccess={() => {
              setCreateOpen(false);
              void utils.companies.list.invalidate();
              toast.success('Partner added');
            }}
            onCancel={() => setCreateOpen(false)}
          />
        </div>
      </SlideOverPanel>
    </div>
  );
}

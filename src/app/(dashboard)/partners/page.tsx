'use client';

import React, { useMemo, useState } from 'react';
import {
  Handshake, Plus, Search, TrendingUp, Users,
  ChevronDown, ChevronRight, ExternalLink, Link2, BriefcaseBusiness, UserPlus, BarChart3,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useDebounce } from '@/hooks/useDebounce';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Label } from '@/components/ui/label';
import { SlideOverPanel } from '@/components/shared/SlideOverPanel';
import { CompanyForm } from '@/components/companies/CompanyForm';
import { CompanyDetail } from '@/components/companies/CompanyDetail';
import { DealForm } from '@/components/deals/DealForm';
import { formatCurrency } from '@/lib/formatters';
import { toast } from 'sonner';

type Company = Record<string, unknown>;
type Deal = Record<string, unknown>;
type Contact = Record<string, unknown>;

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-50 text-blue-700 border border-blue-200',
  won: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  lost: 'bg-red-50 text-red-700 border border-red-200',
};

function AttachDealPanel({
  partnerId,
  open,
  onClose,
  onAttached,
}: {
  partnerId: string;
  open: boolean;
  onClose: () => void;
  onAttached: () => void;
}) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 250);
  const { data: deals = [] } = trpc.partners.availableSalesDeals.useQuery(
    { search: debouncedSearch || undefined, partnerCompanyId: partnerId },
    { enabled: open }
  );

  const attachDeal = trpc.partners.attachDeal.useMutation({
    onSuccess: () => {
      toast.success('Prospect attached to partner');
      onAttached();
      onClose();
    },
    onError: (err) => toast.error('Failed to attach prospect', { description: err.message }),
  });

  return (
    <SlideOverPanel open={open} onClose={onClose} title="Attach Existing Prospect" width="md">
      <div className="p-6 space-y-4">
        <div className="space-y-1.5">
          <Label>Search sales prospects</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by prospect title..."
              className="pl-8"
            />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white max-h-[420px] overflow-y-auto">
          {(deals as Deal[]).length === 0 ? (
            <div className="px-4 py-6 text-sm text-slate-400">No eligible sales prospects found.</div>
          ) : (
            (deals as Deal[]).map((deal) => (
              <div key={String(deal.id)} className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{String(deal.title)}</p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                    {Boolean(deal.companyName) && <span>{String(deal.companyName)}</span>}
                    {Boolean(deal.stageName) && <span>• {String(deal.stageName)}</span>}
                    {Boolean(deal.amount) && <span>• {formatCurrency(parseFloat(String(deal.amount)), String(deal.currency ?? 'INR'))}</span>}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => attachDeal.mutate({ partnerCompanyId: partnerId, dealId: String(deal.id) })}
                  disabled={attachDeal.isPending}
                >
                  Attach
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </SlideOverPanel>
  );
}

const CONTACT_STATUS_COLORS: Record<string, string> = {
  new:       'bg-blue-50 text-blue-700',
  active:    'bg-emerald-50 text-emerald-700',
  nurturing: 'bg-amber-50 text-amber-700',
  converted: 'bg-indigo-50 text-indigo-700',
  lost:      'bg-red-50 text-red-700',
};

function PartnerRow({ partner }: { partner: Company }) {
  const utils = trpc.useUtils();
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'prospects' | 'referred' | 'contacts' | 'stats'>('prospects');
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [createDealOpen, setCreateDealOpen] = useState(false);
  const [createDealPipelineId, setCreateDealPipelineId] = useState('');
  const partnerId = String(partner.id);

  const { data: dealsData = [] } = trpc.partners.dealsByPartner.useQuery(
    { partnerCompanyId: partnerId },
    { enabled: expanded }
  );
  const { data: partnerContacts = [] } = trpc.partners.contactsByPartner.useQuery(
    { partnerCompanyId: partnerId },
    { enabled: expanded }
  );
  const { data: referredData } = trpc.partners.referredLeads.useQuery(
    { partnerCompanyId: partnerId },
    { enabled: expanded }
  );
  const { data: stats } = trpc.partners.attributionStats.useQuery(
    { partnerCompanyId: partnerId },
    { enabled: expanded }
  );
  const { data: pipelines = [] } = trpc.pipelines.list.useQuery(undefined, { enabled: createDealOpen });

  const salesPipelines = useMemo(
    () => (pipelines as Array<Record<string, unknown>>).filter((pipeline) => String(pipeline.name ?? '').toLowerCase().includes('sales')),
    [pipelines]
  );
  const selectedSalesPipelineId = createDealPipelineId || String(salesPipelines[0]?.id ?? '');

  const deals = (dealsData ?? []) as Deal[];
  const contacts = (partnerContacts ?? []) as Contact[];
  const referredContacts = (referredData?.contacts ?? []) as Array<Record<string, unknown>>;
  const referredDeals = (referredData?.deals ?? []) as Deal[];
  const totalValue = deals.reduce((sum, d) => sum + (parseFloat(String(d.amount ?? '0')) || 0), 0);
  const wonDeals = deals.filter((d) => d.status === 'won');

  const handleRefresh = () => {
    void utils.partners.dealsByPartner.invalidate({ partnerCompanyId: partnerId });
    void utils.partners.availableSalesDeals.invalidate({ partnerCompanyId: partnerId });
    void utils.partners.referredLeads.invalidate({ partnerCompanyId: partnerId });
    void utils.partners.attributionStats.invalidate({ partnerCompanyId: partnerId });
  };

  const tabs = [
    { key: 'prospects', label: 'Prospects', count: deals.length },
    { key: 'referred',  label: 'Referred Leads', count: (referredContacts.length + referredDeals.length) || undefined },
    { key: 'contacts',  label: 'Partner Contacts', count: contacts.length },
    { key: 'stats',     label: 'Attribution', count: undefined },
  ] as const;

  return (
    <>
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setExpanded(!expanded)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setExpanded((value) => !value);
            }
          }}
          className="w-full flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors text-left cursor-pointer"
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

          <div className="flex items-center gap-6 flex-shrink-0">
            <div className="text-center">
              <p className="text-sm font-bold text-slate-800">{stats?.referredLeads ?? '—'}</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Referred Leads</p>
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-blue-700">{stats?.openDeals ?? deals.length}</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Open Deals</p>
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-emerald-700">{stats?.wonDeals ?? wonDeals.length}</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Won</p>
            </div>
            <div className="text-center min-w-[80px]">
              <p className="text-sm font-bold text-slate-800">
                {stats?.wonRevenue ? formatCurrency(stats.wonRevenue, String(stats.currency ?? 'INR')) :
                  totalValue > 0 ? formatCurrency(totalValue, String(deals[0]?.currency ?? 'INR')) : '—'}
              </p>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Won Revenue</p>
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
        </div>

        {expanded && (
          <div className="border-t border-slate-100">
            {/* Tab bar */}
            <div className="flex items-center gap-0 border-b border-slate-100 bg-slate-50 px-4">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
                    activeTab === tab.key
                      ? 'border-blue-500 text-blue-700'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {tab.label}
                  {tab.count !== undefined && (
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                      activeTab === tab.key ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-500'
                    }`}>{tab.count}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="p-4">
              {activeTab === 'prospects' && (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-xs font-semibold text-slate-600">Sales prospects under this partner</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => setAttachOpen(true)}>
                        <Link2 className="w-3.5 h-3.5 mr-1" />
                        Attach
                      </Button>
                      <Button size="sm" onClick={() => setCreateDealOpen(true)}>
                        <BriefcaseBusiness className="w-3.5 h-3.5 mr-1" />
                        New Prospect
                      </Button>
                    </div>
                  </div>
                  {deals.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No sales prospects linked to this partner yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {deals.map((deal) => (
                        <div key={String(deal.id)} className="flex items-center justify-between gap-2 text-xs">
                          <div className="min-w-0 flex-1">
                            <span className="text-slate-700 font-medium truncate block">{String(deal.title)}</span>
                            {Boolean(deal.companyName) && <span className="text-slate-400">{String(deal.companyName)}</span>}
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {Boolean(deal.stageName) && <span className="text-slate-400">{String(deal.stageName)}</span>}
                            {Boolean(deal.amount) && (
                              <span className="font-mono text-slate-600">{formatCurrency(parseFloat(String(deal.amount)), String(deal.currency ?? 'INR'))}</span>
                            )}
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${STATUS_COLORS[String(deal.status ?? 'open')]}`}>
                              {String(deal.status)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {activeTab === 'referred' && (
                <div className="space-y-4">
                  {/* Referred contacts */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <UserPlus className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-xs font-semibold text-slate-600">Referred contacts ({referredContacts.length})</span>
                    </div>
                    {referredContacts.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No contacts referred by this partner yet. Set source = Referral and choose this partner when adding a contact.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {referredContacts.map((c) => (
                          <div key={String(c.id)} className="flex items-center justify-between gap-2 text-xs rounded-lg bg-slate-50 px-3 py-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Avatar className="w-5 h-5 flex-shrink-0">
                                <AvatarFallback className="text-[9px] bg-violet-100 text-violet-700">
                                  {String(c.firstName ?? '').charAt(0)}{String(c.lastName ?? '').charAt(0)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="font-medium text-slate-800">{String(c.firstName)} {String(c.lastName)}</span>
                              {Boolean(c.companyName) && <span className="text-slate-400 truncate">· {String(c.companyName)}</span>}
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {Boolean(c.referralDate) && <span className="text-slate-400 font-mono">{String(c.referralDate)}</span>}
                              <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium capitalize ${CONTACT_STATUS_COLORS[String(c.status ?? 'new')] ?? 'bg-slate-100 text-slate-600'}`}>
                                {String(c.status ?? 'new')}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Referred deals */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-xs font-semibold text-slate-600">Referred deals ({referredDeals.length})</span>
                    </div>
                    {referredDeals.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No deals with this partner as the referral source yet.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {referredDeals.map((d) => (
                          <div key={String(d.id)} className="flex items-center justify-between gap-2 text-xs rounded-lg bg-slate-50 px-3 py-2">
                            <div className="min-w-0 flex-1">
                              <span className="font-medium text-slate-800 truncate block">{String(d.title)}</span>
                              {Boolean(d.companyName) && <span className="text-slate-400">{String(d.companyName)}</span>}
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {Boolean(d.stageName) && <span className="text-slate-400">{String(d.stageName)}</span>}
                              {Boolean(d.amount) && <span className="font-mono text-slate-600">{formatCurrency(parseFloat(String(d.amount)), String(d.currency ?? 'INR'))}</span>}
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${STATUS_COLORS[String(d.status ?? 'open')]}`}>
                                {String(d.status)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'contacts' && (
                <>
                  <div className="flex items-center gap-1.5 mb-3">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs font-semibold text-slate-600">Contacts at this partner company</span>
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
                          {Boolean(contact.jobTitle) && <span className="text-slate-400 truncate">{String(contact.jobTitle)}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {activeTab === 'stats' && (
                <>
                  <div className="flex items-center gap-1.5 mb-3">
                    <BarChart3 className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs font-semibold text-slate-600">Lead attribution for this partner</span>
                  </div>
                  {!stats ? (
                    <div className="h-16 animate-pulse rounded-lg bg-slate-100" />
                  ) : (
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: 'Referred Leads', value: stats.referredLeads, color: 'text-violet-700', bg: 'bg-violet-50' },
                        { label: 'Open Deals', value: stats.openDeals, color: 'text-blue-700', bg: 'bg-blue-50' },
                        { label: 'Won Deals', value: stats.wonDeals, color: 'text-emerald-700', bg: 'bg-emerald-50' },
                        { label: 'Pipeline Value', value: formatCurrency(stats.pipeline, String(stats.currency ?? 'INR')), color: 'text-slate-800', bg: 'bg-slate-50' },
                        { label: 'Won Revenue', value: formatCurrency(stats.wonRevenue, String(stats.currency ?? 'INR')), color: 'text-emerald-700', bg: 'bg-emerald-50' },
                        {
                          label: 'Conversion Rate',
                          value: stats.referredLeads > 0
                            ? `${Math.round((stats.wonDeals / stats.referredLeads) * 100)}%`
                            : '—',
                          color: 'text-indigo-700',
                          bg: 'bg-indigo-50',
                        },
                      ].map((stat) => (
                        <div key={stat.label} className={`rounded-lg ${stat.bg} px-3 py-2.5`}>
                          <p className={`text-sm font-bold ${stat.color}`}>{stat.value}</p>
                          <p className="text-[10px] text-slate-400 uppercase tracking-wide mt-0.5">{stat.label}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {selectedCompany && (
        <CompanyDetail
          companyId={String(selectedCompany.id)}
          open={!!selectedCompany}
          onClose={() => setSelectedCompany(null)}
        />
      )}

      <AttachDealPanel
        partnerId={partnerId}
        open={attachOpen}
        onClose={() => setAttachOpen(false)}
        onAttached={handleRefresh}
      />

      <SlideOverPanel open={createDealOpen} onClose={() => setCreateDealOpen(false)} title="Create Partner-Sourced Prospect" width="md">
        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={`partner-pipeline-${partnerId}`}>Sales pipeline</Label>
            <select
              id={`partner-pipeline-${partnerId}`}
              value={selectedSalesPipelineId}
              onChange={(e) => setCreateDealPipelineId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              {salesPipelines.map((pipeline) => (
                <option key={String(pipeline.id)} value={String(pipeline.id)}>
                  {String(pipeline.name)}
                </option>
              ))}
            </select>
          </div>

          {selectedSalesPipelineId ? (
            <DealForm
              pipelineId={selectedSalesPipelineId}
              defaultValues={{
                partnerCompanyId: partnerId,
                title: `${String(partner.name ?? '')} Referral Opportunity`,
              }}
              onSuccess={() => {
                setCreateDealOpen(false);
                handleRefresh();
              }}
              onCancel={() => setCreateDealOpen(false)}
            />
          ) : (
            <p className="text-sm text-amber-600">No active sales pipeline found.</p>
          )}
        </div>
      </SlideOverPanel>
    </>
  );
}

export default function PartnersPage() {
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
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
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white flex-shrink-0">
        <div>
          <h1 className="text-[15px] font-semibold text-slate-900 tracking-tight">Partners</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Companies marked as partners, along with the sales prospects explicitly linked to them
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4" />
          Add Partner
        </Button>
      </div>

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
            Only partner-tagged sales prospects appear here
          </span>
        </div>
      </div>

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
                : 'Add a company with type "Partner" to track partner relationships and their sourced sales prospects here.'}
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
            {partners.map((partner) => (
              <PartnerRow key={String(partner.id)} partner={partner} />
            ))}
          </div>
        )}
      </div>

      <SlideOverPanel open={createOpen} onClose={() => setCreateOpen(false)} title="Add Partner" width="md">
        <div className="p-6">
          <CompanyForm
            mode="create"
            defaultValues={{ companyType: 'partner' }}
            onSuccess={() => setCreateOpen(false)}
            onCancel={() => setCreateOpen(false)}
          />
        </div>
      </SlideOverPanel>
    </div>
  );
}

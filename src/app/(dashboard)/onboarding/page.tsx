'use client';

import React from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { ClipboardCheck, Clock, Info, Plus, Search, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SlideOverPanel } from '@/components/shared/SlideOverPanel';
import { formatDate } from '@/lib/formatters';
import { getOnboardingStageLabel, ONBOARDING_STAGE_LABELS } from '@/lib/onboarding';

const STAGES = [
  ['documents_pending', ONBOARDING_STAGE_LABELS.documents_pending, '#6366f1'],
  ['documents_sent', ONBOARDING_STAGE_LABELS.documents_sent, '#3b82f6'],
  ['documents_signed', ONBOARDING_STAGE_LABELS.documents_signed, '#14b8a6'],
  ['payment_pending', ONBOARDING_STAGE_LABELS.payment_pending, '#f59e0b'],
  ['payment_received', ONBOARDING_STAGE_LABELS.payment_received, '#10b981'],
  ['kickoff_scheduled', ONBOARDING_STAGE_LABELS.kickoff_scheduled, '#8b5cf6'],
  ['completed', ONBOARDING_STAGE_LABELS.completed, '#16a34a'],
  ['cancelled', ONBOARDING_STAGE_LABELS.cancelled, '#94a3b8'],
] as const;

export default function OnboardingPage() {
  const { data: session } = useSession();
  const role = (((session?.user as Record<string, unknown> | undefined)?.role as Record<string, unknown> | undefined)?.slug);
  const [search, setSearch] = React.useState('');
  const [selectedId, setSelectedId] = React.useState('');
  const [manualOpen, setManualOpen] = React.useState(false);
  const { data: rows = [], isLoading } = trpc.onboarding.list.useQuery(undefined, { enabled: role === 'super_admin' });
  const { data: salesPipelines = [] } = trpc.pipelines.list.useQuery(
    { isSalesPipeline: true },
    { enabled: role === 'super_admin' }
  );

  if (role && role !== 'super_admin') {
    return <div className="flex h-full items-center justify-center text-sm text-slate-500">Onboarding is restricted to super admins.</div>;
  }

  const filtered = (rows as Array<Record<string, unknown>>).filter((row) =>
    `${row.dealTitle ?? ''} ${row.companyName ?? ''}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-full flex-col bg-[var(--surface-page)]">
      <header className="flex items-center justify-between border-b border-[var(--border-subtle)] bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="h-5 w-5 text-[var(--accent)]" />
          <div><h1 className="text-lg font-bold text-[var(--text-primary)]">Onboarding</h1><p className="text-xs text-[var(--text-tertiary)]">Closed-won handoff to delivery</p></div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-64"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search onboarding..." className="pl-9" /></div>
          <Button onClick={() => setManualOpen(true)}><Plus className="h-4 w-4" />Add manually</Button>
        </div>
      </header>
      <div className="flex items-center justify-between gap-4 border-b border-blue-100 bg-blue-50 px-6 py-2.5 text-xs text-blue-900">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 flex-shrink-0" />
          <span>
            Automatic onboarding is created only from: <b>{salesPipelines.length ? salesPipelines.map((pipeline) => pipeline.name).join(', ') : 'No pipelines enabled'}</b>
          </span>
        </div>
        <Link href="/settings/pipelines" className="flex items-center gap-1 font-semibold hover:text-blue-700">
          <Settings className="h-3.5 w-3.5" />Configure
        </Link>
      </div>
      <div className="flex flex-1 gap-3 overflow-x-auto p-4">
        {STAGES.map(([key, label, color]) => {
          const stageRows = filtered.filter((row) => row.stage === key);
          return (
            <section key={key} className="w-[286px] flex-shrink-0 rounded-lg border border-[var(--border-subtle)] bg-white/60">
              <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-3 py-3">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} /><span className="text-xs font-bold">{label}</span>
                <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold">{stageRows.length}</span>
              </div>
              <div className="space-y-2 p-2">
                {isLoading ? <p className="p-4 text-xs text-slate-400">Loading...</p> : stageRows.map((row) => (
                  <button key={String(row.id)} onClick={() => setSelectedId(String(row.id))} className="w-full rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm hover:border-blue-300">
                    <p className="text-sm font-semibold text-slate-900">{String(row.dealTitle)}</p>
                    <p className="mt-1 text-xs text-slate-500">{String(row.companyName ?? 'No company')}</p>
                    <div className="mt-3 flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1 text-slate-400"><Clock className="h-3 w-3" />{formatDate(row.stageEnteredAt as string)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <OnboardingPanel id={selectedId} open={Boolean(selectedId)} onClose={() => setSelectedId('')} />
      <ManualOnboardingPanel open={manualOpen} onClose={() => setManualOpen(false)} />
    </div>
  );
}

function ManualOnboardingPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [dealId, setDealId] = React.useState('');
  const [reason, setReason] = React.useState('');
  const { data: deals = [], isLoading } = trpc.onboarding.eligibleManualDeals.useQuery(undefined, { enabled: open });
  const create = trpc.onboarding.createManual.useMutation({
    onSuccess: async () => {
      toast.success('Onboarding created');
      setDealId('');
      setReason('');
      onClose();
      await utils.onboarding.invalidate();
    },
    onError: (error) => toast.error('Could not create onboarding', { description: error.message }),
  });

  return <SlideOverPanel open={open} onClose={onClose} width="md" title="Add won prospect to onboarding">
    <div className="space-y-5 p-5">
      <div>
        <Label>Won prospect</Label>
        <select
          value={dealId}
          onChange={(event) => setDealId(event.target.value)}
          className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
        >
          <option value="">{isLoading ? 'Loading...' : 'Select a won prospect'}</option>
          {deals.map((deal) => (
            <option key={deal.id} value={deal.id}>
              {deal.title} - {deal.companyName ?? 'No company'} ({deal.pipelineName})
            </option>
          ))}
        </select>
        {!isLoading && deals.length === 0 && <p className="mt-2 text-xs text-slate-500">Every won prospect already has onboarding.</p>}
      </div>
      <div>
        <Label>Reason</Label>
        <Textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Why should this prospect enter onboarding?"
          className="mt-1"
        />
      </div>
      <Button
        className="w-full"
        disabled={!dealId || reason.trim().length < 3 || create.isPending}
        onClick={() => create.mutate({ dealId, reason })}
      >
        {create.isPending ? 'Creating...' : 'Create onboarding'}
      </Button>
    </div>
  </SlideOverPanel>;
}

function OnboardingPanel({ id, open, onClose }: { id: string; open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data } = trpc.onboarding.getById.useQuery({ id }, { enabled: open });
  const record = data as Record<string, unknown> | undefined;
  const [form, setForm] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    if (!record) return;
    setForm(Object.fromEntries(['paymentTerms','paymentTermsNotes','poNumber','poReceivedAt','firstPaymentReceivedAt','kickoffMeetingLink','kickoffNotes','notes'].map((key) => [key, String(record[key] ?? '')])));
  }, [record]);
  const update = trpc.onboarding.update.useMutation({ onSuccess: async () => { toast.success('Onboarding updated'); await utils.onboarding.invalidate(); } });
  const move = trpc.onboarding.moveStage.useMutation({ onSuccess: async () => { toast.success('Onboarding stage updated'); await utils.onboarding.invalidate(); } });
  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const save = () => update.mutate({ id, data: {
    paymentTerms: form.paymentTerms || null,
    paymentTermsNotes: form.paymentTermsNotes || null, poNumber: form.poNumber || null, poReceivedAt: form.poReceivedAt || null,
    firstPaymentReceivedAt: form.firstPaymentReceivedAt || null, kickoffMeetingLink: form.kickoffMeetingLink || null,
    kickoffNotes: form.kickoffNotes || null, notes: form.notes || null,
  } });

  return <SlideOverPanel open={open} onClose={onClose} width="lg" title={String(record?.dealTitle ?? 'Onboarding')}>
    {!record ? <p className="p-6 text-sm text-slate-400">Loading...</p> : <div className="space-y-6 p-5">
      <div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-slate-400">Company</p><p className="font-semibold">{String(record.companyName ?? 'Not set')}</p></div></div>
      <div className="grid grid-cols-3 gap-3">{(['msaStatus','ndaStatus','sowStatus'] as const).map((key) => <label key={key} className="text-xs font-semibold uppercase text-slate-500">{key.replace('Status','')}<select value={String(record[key] ?? 'pending')} onChange={(e) => update.mutate({ id, data: { [key]: e.target.value } })} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm"><option value="pending">Pending</option><option value="sent">Sent</option><option value="signed">Signed</option><option value="not_required">Not required</option></select></label>)}</div>
	      <div className="grid grid-cols-2 gap-3"><Field label="Payment terms" value={form.paymentTerms} onChange={(v) => set('paymentTerms', v)} /><Field label="PO number" value={form.poNumber} onChange={(v) => set('poNumber', v)} /><Field label="Payment received" value={form.firstPaymentReceivedAt} onChange={(v) => set('firstPaymentReceivedAt', v)} type="date" /></div>
      <Field label="Kickoff meeting link" value={form.kickoffMeetingLink} onChange={(v) => set('kickoffMeetingLink', v)} />
      <Label>Kickoff notes<Textarea value={form.kickoffNotes} onChange={(e) => set('kickoffNotes', e.target.value)} className="mt-1" /></Label>
      <Label>Notes<Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} className="mt-1" /></Label>
      <div className="flex gap-2"><select value={String(record.stage)} onChange={(e) => move.mutate({ id, stage: e.target.value as typeof STAGES[number][0] })} className="h-9 flex-1 rounded-md border border-slate-200 bg-white px-3 text-sm">{STAGES.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select><Button onClick={save}>Save</Button></div>
      <div><h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Stage history</h3>{((record.history as Array<Record<string, unknown>>) ?? []).map((item) => <div key={String(item.id)} className="border-l-2 border-slate-200 py-2 pl-3 text-xs"><b>{item.fromStage ? getOnboardingStageLabel(item.fromStage) : 'Created'}</b> → <b>{getOnboardingStageLabel(item.toStage)}</b><p className="text-slate-400">{formatDate(item.enteredAt as string)} {String(item.notes ?? '')}</p></div>)}</div>
    </div>}
  </SlideOverPanel>;
}

function Field({ label, value, onChange, type = 'text', icon }: { label: string; value?: string; onChange: (value: string) => void; type?: string; icon?: React.ReactNode }) {
  return <Label>{label}<div className="relative mt-1">{icon && <span className="absolute left-3 top-2.5 text-slate-400">{icon}</span>}<Input type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={icon ? 'pl-8' : ''} /></div></Label>;
}

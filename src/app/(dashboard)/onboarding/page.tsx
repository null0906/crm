'use client';

import React from 'react';
import { useSession } from 'next-auth/react';
import { ClipboardCheck, Clock, IndianRupee, Search } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SlideOverPanel } from '@/components/shared/SlideOverPanel';
import { formatCurrency, formatDate } from '@/lib/formatters';

const STAGES = [
  ['documents_pending', 'Documents Pending', '#6366f1'],
  ['documents_sent', 'Documents Sent', '#3b82f6'],
  ['documents_signed', 'Documents Signed', '#14b8a6'],
  ['payment_pending', 'Payment Pending', '#f59e0b'],
  ['payment_received', 'Payment Received', '#10b981'],
  ['kickoff_scheduled', 'Kickoff Scheduled', '#8b5cf6'],
  ['completed', 'Completed', '#16a34a'],
  ['cancelled', 'Cancelled', '#94a3b8'],
] as const;

export default function OnboardingPage() {
  const { data: session } = useSession();
  const role = (((session?.user as Record<string, unknown> | undefined)?.role as Record<string, unknown> | undefined)?.slug);
  const [search, setSearch] = React.useState('');
  const [selectedId, setSelectedId] = React.useState('');
  const { data: rows = [], isLoading } = trpc.onboarding.list.useQuery(undefined, { enabled: role === 'super_admin' });

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
        <div className="relative w-64"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search onboarding..." className="pl-9" /></div>
      </header>
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
                      {row.engagementAmount != null && <span className="font-mono font-bold">{formatCurrency(row.engagementAmount as string)}</span>}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <OnboardingPanel id={selectedId} open={Boolean(selectedId)} onClose={() => setSelectedId('')} />
    </div>
  );
}

function OnboardingPanel({ id, open, onClose }: { id: string; open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data } = trpc.onboarding.getById.useQuery({ id }, { enabled: open });
  const record = data as Record<string, unknown> | undefined;
  const [form, setForm] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    if (!record) return;
    setForm(Object.fromEntries(['engagementAmount','amountVarianceReason','paymentTerms','paymentTermsNotes','poNumber','poReceivedAt','firstPaymentAmount','firstPaymentReceivedAt','kickoffMeetingLink','kickoffNotes','notes'].map((key) => [key, String(record[key] ?? '')])));
  }, [record]);
  const update = trpc.onboarding.update.useMutation({ onSuccess: async () => { toast.success('Onboarding updated'); await utils.onboarding.invalidate(); } });
  const move = trpc.onboarding.moveStage.useMutation({ onSuccess: async () => { toast.success('Onboarding stage updated'); await utils.onboarding.invalidate(); } });
  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const save = () => update.mutate({ id, data: {
    engagementAmount: form.engagementAmount ? Number(form.engagementAmount) : null,
    amountVarianceReason: form.amountVarianceReason || null, paymentTerms: form.paymentTerms || null,
    paymentTermsNotes: form.paymentTermsNotes || null, poNumber: form.poNumber || null, poReceivedAt: form.poReceivedAt || null,
    firstPaymentAmount: form.firstPaymentAmount ? Number(form.firstPaymentAmount) : null,
    firstPaymentReceivedAt: form.firstPaymentReceivedAt || null, kickoffMeetingLink: form.kickoffMeetingLink || null,
    kickoffNotes: form.kickoffNotes || null, notes: form.notes || null,
  } });

  return <SlideOverPanel open={open} onClose={onClose} width="lg" title={String(record?.dealTitle ?? 'Onboarding')}>
    {!record ? <p className="p-6 text-sm text-slate-400">Loading...</p> : <div className="space-y-6 p-5">
      <div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-slate-400">Company</p><p className="font-semibold">{String(record.companyName ?? 'Not set')}</p></div><div><p className="text-xs text-slate-400">Sales estimate</p><p className="font-mono">{formatCurrency(record.salesEstimate as string)}</p></div></div>
      <Field label="Engagement amount" value={form.engagementAmount} onChange={(v) => set('engagementAmount', v)} type="number" icon={<IndianRupee className="h-3.5 w-3.5" />} />
      <Field label="Variance reason" value={form.amountVarianceReason} onChange={(v) => set('amountVarianceReason', v)} />
      <div className="grid grid-cols-3 gap-3">{(['msaStatus','ndaStatus','sowStatus'] as const).map((key) => <label key={key} className="text-xs font-semibold uppercase text-slate-500">{key.replace('Status','')}<select value={String(record[key] ?? 'pending')} onChange={(e) => update.mutate({ id, data: { [key]: e.target.value } })} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm"><option value="pending">Pending</option><option value="sent">Sent</option><option value="signed">Signed</option><option value="not_required">Not required</option></select></label>)}</div>
      <div className="grid grid-cols-2 gap-3"><Field label="Payment terms" value={form.paymentTerms} onChange={(v) => set('paymentTerms', v)} /><Field label="PO number" value={form.poNumber} onChange={(v) => set('poNumber', v)} /><Field label="First payment" value={form.firstPaymentAmount} onChange={(v) => set('firstPaymentAmount', v)} type="number" /><Field label="Payment received" value={form.firstPaymentReceivedAt} onChange={(v) => set('firstPaymentReceivedAt', v)} type="date" /></div>
      <Field label="Kickoff meeting link" value={form.kickoffMeetingLink} onChange={(v) => set('kickoffMeetingLink', v)} />
      <Label>Kickoff notes<Textarea value={form.kickoffNotes} onChange={(e) => set('kickoffNotes', e.target.value)} className="mt-1" /></Label>
      <Label>Notes<Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} className="mt-1" /></Label>
      <div className="flex gap-2"><select value={String(record.stage)} onChange={(e) => move.mutate({ id, stage: e.target.value as typeof STAGES[number][0] })} className="h-9 flex-1 rounded-md border border-slate-200 bg-white px-3 text-sm">{STAGES.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select><Button onClick={save}>Save</Button></div>
      <div><h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Stage history</h3>{((record.history as Array<Record<string, unknown>>) ?? []).map((item) => <div key={String(item.id)} className="border-l-2 border-slate-200 py-2 pl-3 text-xs"><b>{String(item.fromStage ?? 'Created')}</b> → <b>{String(item.toStage)}</b><p className="text-slate-400">{formatDate(item.enteredAt as string)} {String(item.notes ?? '')}</p></div>)}</div>
    </div>}
  </SlideOverPanel>;
}

function Field({ label, value, onChange, type = 'text', icon }: { label: string; value?: string; onChange: (value: string) => void; type?: string; icon?: React.ReactNode }) {
  return <Label>{label}<div className="relative mt-1">{icon && <span className="absolute left-3 top-2.5 text-slate-400">{icon}</span>}<Input type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={icon ? 'pl-8' : ''} /></div></Label>;
}

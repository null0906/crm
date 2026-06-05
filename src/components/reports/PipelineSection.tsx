'use client';

import Link from 'next/link';
import { Trophy, TrendingUp, Target, IndianRupee } from 'lucide-react';
import { formatINR, formatNumber } from './report-utils';

type Pipeline = Record<string, any>;
type Deal = Record<string, any>;

function Metric({ icon: Icon, label, value, detail }: { icon: React.ElementType; label: string; value: React.ReactNode; detail?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] p-4">
      <Icon className="mb-3 h-4 w-4 text-[var(--accent)]" />
      <div className="text-xl font-black tracking-[-0.04em] text-[var(--text-primary)]">{value}</div>
      <div className="mt-1 text-xs font-semibold text-[var(--text-tertiary)]">{label}</div>
      {detail ? <div className="mt-1 text-xs text-[var(--text-secondary)]">{detail}</div> : null}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg = status === 'won'
    ? 'border-green-200 bg-green-50 text-green-700'
    : status === 'lost'
      ? 'border-red-200 bg-red-50 text-red-700'
      : 'border-blue-200 bg-blue-50 text-blue-700';
  return <span className={`rounded border px-2 py-0.5 text-xs font-bold ${cfg}`}>{status}</span>;
}

export function PipelineSection({ pipeline, topDeals, monetaryValuesHidden = false }: { pipeline: Pipeline; topDeals: Deal[]; monetaryValuesHidden?: boolean }) {
  return (
    <section className="rounded-2xl border border-[var(--border-subtle)] bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-black tracking-[-0.03em] text-[var(--text-primary)]">Pipeline Contribution</h2>
        <p className="text-sm text-[var(--text-tertiary)]">Prospect creation, won revenue, open pipeline, and highest-value opportunities.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric icon={Target} label="Leads added" value={formatNumber(pipeline.leadsAdded)} />
        <Metric icon={TrendingUp} label="Prospects created" value={formatNumber(pipeline.dealsCreated)} />
        {!monetaryValuesHidden && <Metric icon={Trophy} label="Revenue won" value={formatINR(pipeline.revenueWon)} detail={`${pipeline.dealsWon} prospects won`} />}
        {!monetaryValuesHidden && <Metric icon={IndianRupee} label="Open pipeline" value={formatINR(pipeline.openPipelineValue)} detail={`${pipeline.openDeals} open prospects`} />}
        {!monetaryValuesHidden && <Metric icon={TrendingUp} label="Weighted pipeline" value={formatINR(pipeline.weightedPipeline)} />}
        <Metric icon={Target} label="Win rate" value={`${pipeline.winRate}%`} />
        <Metric icon={Target} label="Prospects lost" value={formatNumber(pipeline.dealsLost)} />
      </div>

      <div className="mt-5 overflow-hidden rounded-xl border border-[var(--border-subtle)]">
        <div className="border-b border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-4 py-3 text-sm font-black uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
          Top prospects this period
        </div>
        <div className="divide-y divide-[var(--border-subtle)]">
          {topDeals.length === 0 ? (
            <div className="p-5 text-sm text-[var(--text-tertiary)]">No prospects found for this rep in this period.</div>
          ) : (
            topDeals.map((deal) => (
              <Link key={deal.id} href={`/deals/${deal.id}`} className={`grid gap-2 px-4 py-3 text-sm hover:bg-[var(--accent-light)] ${monetaryValuesHidden ? 'md:grid-cols-[1fr_120px_90px]' : 'md:grid-cols-[1fr_120px_90px_140px]'} md:items-center`}>
                <div>
                  <div className="font-bold text-[var(--text-primary)]">{deal.title}</div>
                  <div className="text-xs text-[var(--text-tertiary)]">{deal.companyName ?? 'No company'} · {deal.contactName ?? 'No contact'}</div>
                </div>
                <span className="text-[var(--text-secondary)]">{deal.stageName ?? 'No stage'}</span>
                <StatusBadge status={deal.status} />
                {!monetaryValuesHidden && <span className="font-mono font-black text-[var(--text-primary)] md:text-right">{formatINR(deal.amount)}</span>}
              </Link>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

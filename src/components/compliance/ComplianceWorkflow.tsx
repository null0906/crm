'use client';

import React, { useEffect, useState } from 'react';
import { Plus, Search, ShieldCheck, TrendingUp, CheckCircle2, Clock } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { KanbanBoard } from '@/components/deals/KanbanBoard';
import { DealForm } from '@/components/deals/DealForm';
import { DealDetail } from '@/components/deals/DealDetail';
import { SlideOverPanel } from '@/components/shared/SlideOverPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDebounce } from '@/hooks/useDebounce';
import { formatCurrency } from '@/lib/formatters';

interface Stage {
  id: string;
  name: string;
  color: string | null;
  position: number;
  stageType: string;
}

interface Pipeline {
  id: string;
  name: string;
  stages: Stage[];
}

type ComplianceType = 'soc2' | 'dpdp';

const CONFIG: Record<ComplianceType, {
  title: string;
  subtitle: string;
  badge: string;
  badgeColor: string;
}> = {
  soc2: {
    title: 'SOC 2 Workflow',
    subtitle: 'Track clients through SOC 2 audit and certification',
    badge: 'SOC 2',
    badgeColor: 'bg-indigo-100 text-indigo-700',
  },
  dpdp: {
    title: 'DPDP Workflow',
    subtitle: "Track clients through India's Digital Personal Data Protection compliance",
    badge: 'DPDP',
    badgeColor: 'bg-purple-100 text-purple-700',
  },
};

export function ComplianceWorkflow({ type }: { type: ComplianceType }) {
  const cfg = CONFIG[type];
  const utils = trpc.useUtils();

  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createStageId, setCreateStageId] = useState('');
  const [selectedDealId, setSelectedDealId] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const ensuredRef = React.useRef(false);

  const ensurePipeline = trpc.compliance.ensurePipeline.useMutation({
    onSuccess: (data) => setPipeline(data as Pipeline),
  });

  useEffect(() => {
    if (ensuredRef.current) return;
    ensuredRef.current = true;
    ensurePipeline.mutate({ type });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  // Stats from deals.byStage
  const { data: stageData } = trpc.deals.byStage.useQuery(
    { pipelineId: pipeline?.id ?? '' },
    { enabled: !!pipeline?.id },
  );
  const dealsByStage = (stageData ?? {}) as Record<string, Array<Record<string, unknown>>>;

  const allDeals = Object.values(dealsByStage).flat();
  const wonStageIds = new Set(
    (pipeline?.stages ?? []).filter((s) => s.stageType === 'won').map((s) => s.id),
  );
  const activeDeals = allDeals.filter((d) => !wonStageIds.has(String(d.stageId ?? '')) && String(d.status ?? '') !== 'won' && String(d.status ?? '') !== 'lost');
  const wonDeals = allDeals.filter((d) => String(d.status ?? '') === 'won');
  const totalValue = allDeals
    .filter((d) => String(d.status ?? '') !== 'lost')
    .reduce((sum, d) => sum + (parseFloat(String(d.amount ?? '0')) || 0), 0);

  const activeStages = (pipeline?.stages ?? []).filter((s) => s.stageType !== 'lost');

  if (!pipeline) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <ShieldCheck className="h-10 w-10 animate-pulse text-slate-300" />
          <p className="text-sm">Setting up {cfg.title}…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-slate-100 bg-white px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100">
            <ShieldCheck className="h-4.5 w-4.5 text-indigo-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[15px] font-semibold text-slate-900">{cfg.title}</h1>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${cfg.badgeColor}`}>{cfg.badge}</span>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">{cfg.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search clients…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs w-48"
            />
          </div>
          <Button
            size="sm"
            onClick={() => {
              const firstActiveStage = activeStages[0];
              setCreateStageId(firstActiveStage?.id ?? '');
              setCreateOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Client
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-6 border-b border-slate-100 bg-slate-50 px-6 py-3 flex-shrink-0">
        <StatChip icon={TrendingUp} label="Active" value={activeDeals.length} color="text-blue-600" />
        <StatChip icon={CheckCircle2} label="Completed" value={wonDeals.length} color="text-emerald-600" />
        <StatChip icon={Clock} label="Total Clients" value={allDeals.filter((d) => String(d.status ?? '') !== 'lost').length} color="text-slate-500" />
        {totalValue > 0 && (
          <div className="ml-auto text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Pipeline Value</p>
            <p className="text-sm font-bold text-slate-800">{formatCurrency(totalValue)}</p>
          </div>
        )}
      </div>

      {/* Kanban */}
      <div className="flex-1 overflow-hidden">
        <KanbanBoard
          pipelineId={pipeline.id}
          stages={activeStages}
          search={debouncedSearch}
          onAddDeal={(stageId) => {
            setCreateStageId(stageId);
            setCreateOpen(true);
          }}
          onDealClick={(deal) => setSelectedDealId(String(deal.id))}
        />
      </div>

      {/* Add deal slide-over */}
      <SlideOverPanel open={createOpen} onClose={() => setCreateOpen(false)} title={`Add Client — ${cfg.title}`} width="md">
        <DealForm
          pipelineId={pipeline.id}
          stageId={createStageId}
          onSuccess={() => {
            setCreateOpen(false);
            void utils.deals.byStage.invalidate({ pipelineId: pipeline.id });
          }}
          onCancel={() => setCreateOpen(false)}
        />
      </SlideOverPanel>

      {/* Deal detail slide-over */}
      {selectedDealId && (
        <DealDetail
          dealId={selectedDealId}
          open={!!selectedDealId}
          onClose={() => {
            setSelectedDealId('');
            void utils.deals.byStage.invalidate({ pipelineId: pipeline.id });
          }}
          onDeleted={() => {
            setSelectedDealId('');
            void utils.deals.byStage.invalidate({ pipelineId: pipeline.id });
          }}
        />
      )}
    </div>
  );
}

function StatChip({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className={`h-3.5 w-3.5 ${color}`} />
      <span className="text-lg font-bold text-slate-800">{value}</span>
      <span className="text-xs text-slate-400">{label}</span>
    </div>
  );
}

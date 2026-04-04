'use client';

import React, { useState } from 'react';
import { ChevronLeft, Plus, LayoutGrid } from 'lucide-react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export default function PipelinesSettingsPage() {
  const utils = trpc.useUtils();
  const { data: pipelines = [], isLoading } = trpc.pipelines.list.useQuery();
  const [newPipelineName, setNewPipelineName] = useState('');
  const [creating, setCreating] = useState(false);

  const createPipeline = trpc.pipelines.create.useMutation({
    onSuccess: () => {
      toast.success('Pipeline created');
      setNewPipelineName('');
      setCreating(false);
      void utils.pipelines.list.invalidate();
    },
    onError: (err) => toast.error('Failed to create pipeline', { description: err.message }),
  });

  function handleCreate() {
    if (!newPipelineName.trim()) return;
    createPipeline.mutate({
      name: newPipelineName.trim(),
      stages: [
        { name: 'Lead', stageType: 'active', defaultProbability: 10 },
        { name: 'Proposal', stageType: 'active', defaultProbability: 40 },
        { name: 'Negotiation', stageType: 'active', defaultProbability: 70 },
        { name: 'Won', stageType: 'won', defaultProbability: 100 },
        { name: 'Lost', stageType: 'lost', defaultProbability: 0 },
      ],
    });
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Link href="/settings" className="text-slate-400 hover:text-slate-600">
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Pipelines</h1>
            <p className="text-sm text-slate-500">Configure your sales pipelines and stages.</p>
          </div>
        </div>
        <Button size="sm" onClick={() => setCreating(!creating)}>
          <Plus className="w-4 h-4" />
          New Pipeline
        </Button>
      </div>

      {creating && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">New Pipeline</h3>
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs">Pipeline Name</Label>
              <Input
                value={newPipelineName}
                onChange={(e) => setNewPipelineName(e.target.value)}
                placeholder="e.g. Enterprise Sales"
                className="h-8"
                autoFocus
              />
            </div>
            <Button size="sm" onClick={handleCreate} disabled={!newPipelineName.trim() || createPipeline.isPending}>
              {createPipeline.isPending ? 'Creating...' : 'Create'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
          </div>
          <p className="text-xs text-slate-400 mt-2">Default stages will be created automatically.</p>
        </div>
      )}

      <div className="space-y-3">
        {isLoading ? (
          <div className="text-sm text-slate-400">Loading...</div>
        ) : pipelines.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
            <LayoutGrid className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No pipelines yet.</p>
          </div>
        ) : (
          pipelines.map((pipeline) => (
            <PipelineCard key={String(pipeline.id)} pipeline={pipeline} />
          ))
        )}
      </div>
    </div>
  );
}

function PipelineCard({ pipeline }: { pipeline: Record<string, unknown> }) {
  const { data: pipelineData } = trpc.pipelines.getWithStages.useQuery({ id: pipeline.id as string });
  const stages = (pipelineData?.stages as Array<Record<string, unknown>>) ?? [];

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{pipeline.name as string}</h3>
          {!!pipeline.description && (
            <p className="text-xs text-slate-400 mt-0.5">{pipeline.description as string}</p>
          )}
        </div>
        <Badge variant={pipeline.isActive ? 'success' : 'secondary'} className="text-xs">
          {pipeline.isActive ? 'Active' : 'Inactive'}
        </Badge>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {stages.map((stage, i) => (
          <div key={stage.id as string} className="flex items-center gap-1.5">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: (stage.color as string) ?? '#6B7280' }}
            />
            <span className="text-xs text-slate-600">{stage.name as string}</span>
            {i < stages.length - 1 && <span className="text-slate-300 text-xs">→</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

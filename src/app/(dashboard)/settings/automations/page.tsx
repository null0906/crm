'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { BellRing, ChevronLeft, Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const pipelineOptions = [
  { value: 'sales', label: 'Sales' },
  { value: 'partner', label: 'Partner' },
  { value: 'enterprise', label: 'Enterprise' },
] as const;

type LeadInactivityPipeline = (typeof pipelineOptions)[number]['value'];

type FormState = {
  leadInactivityEnabled: boolean;
  leadInactivityDays: number;
  leadInactivityCooldownHours: number;
  leadInactivityPipelines: LeadInactivityPipeline[];
};

export default function AutomationSettingsPage() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.automation.getLeadInactivity.useQuery();
  const [form, setForm] = useState<FormState | null>(null);

  useEffect(() => {
    if (data) {
      setForm({
        leadInactivityEnabled: data.leadInactivityEnabled,
        leadInactivityDays: data.leadInactivityDays,
        leadInactivityCooldownHours: data.leadInactivityCooldownHours,
        leadInactivityPipelines: data.leadInactivityPipelines,
      });
    }
  }, [data]);

  const updateSettings = trpc.automation.updateLeadInactivity.useMutation({
    onSuccess: async () => {
      toast.success('Automation settings saved');
      await utils.automation.getLeadInactivity.invalidate();
    },
    onError: (err) => {
      toast.error('Failed to save settings', { description: err.message });
    },
  });

  const runNow = trpc.automation.runLeadInactivityNow.useMutation({
    onSuccess: (result) => {
      toast.success('Reminder check completed', {
        description: `Checked ${result.checked} eligible deals and sent ${result.sent} owner reminder${result.sent === 1 ? '' : 's'}.`,
      });
      void utils.notifications.unreadCount.invalidate();
      void utils.notifications.list.invalidate({ limit: 20, unreadOnly: false });
    },
    onError: (err) => {
      toast.error('Failed to run reminder check', { description: err.message });
    },
  });

  const isPending = updateSettings.isPending || runNow.isPending;

  if (isLoading || !form) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="text-sm text-slate-400">Loading automation settings...</div>
      </div>
    );
  }

  const togglePipeline = (pipeline: LeadInactivityPipeline) => {
    setForm((current) => {
      if (!current) return current;
      const exists = current.leadInactivityPipelines.includes(pipeline);
      const next = exists
        ? current.leadInactivityPipelines.filter((item) => item !== pipeline)
        : [...current.leadInactivityPipelines, pipeline];

      return {
        ...current,
        leadInactivityPipelines: next.length > 0 ? next : current.leadInactivityPipelines,
      };
    });
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-start justify-between gap-4 mb-7">
        <div>
          <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 mb-3">
            <ChevronLeft className="w-4 h-4" />
            Back to settings
          </Link>
          <h1 className="text-[15px] font-semibold text-slate-900 tracking-tight">Automations</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure stale-lead follow-up reminders. Emails are always sent only to the assigned deal owner.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => runNow.mutate()}
          disabled={isPending || !form.leadInactivityEnabled}
        >
          {runNow.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
          Run Check Now
        </Button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-[0_1px_4px_rgba(16,24,40,0.04)] space-y-6">
        <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
          <BellRing className="w-4 h-4 text-blue-600 mt-0.5" />
          <div className="text-sm text-blue-900">
            <p className="font-medium">Lead inactivity reminder</p>
            <p className="text-blue-800/80 mt-1">
              Open deals in the selected pipelines will notify the deal owner when there has been no logged deal, company, or contact activity for the configured number of days.
            </p>
          </div>
        </div>

        <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-slate-800">Enable owner reminder emails</p>
            <p className="text-xs text-slate-400 mt-0.5">If disabled, the background check will skip this automation completely.</p>
          </div>
          <input
            type="checkbox"
            checked={form.leadInactivityEnabled}
            onChange={(e) => setForm((current) => current ? { ...current, leadInactivityEnabled: e.target.checked } : current)}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="days">Inactivity threshold (days)</Label>
            <Input
              id="days"
              type="number"
              min={1}
              max={30}
              value={form.leadInactivityDays}
              onChange={(e) => setForm((current) => current ? { ...current, leadInactivityDays: Math.max(1, Number(e.target.value) || 1) } : current)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cooldown">Repeat reminder cooldown (hours)</Label>
            <Input
              id="cooldown"
              type="number"
              min={1}
              max={168}
              value={form.leadInactivityCooldownHours}
              onChange={(e) => setForm((current) => current ? { ...current, leadInactivityCooldownHours: Math.max(1, Number(e.target.value) || 1) } : current)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Target pipelines</Label>
          <div className="grid grid-cols-3 gap-3">
            {pipelineOptions.map((option) => (
              <label
                key={option.value}
                className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
              >
                <input
                  type="checkbox"
                  checked={form.leadInactivityPipelines.includes(option.value)}
                  onChange={() => togglePipeline(option.value)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">How to test this</p>
          <p className="mt-1 text-amber-800/90">
            Set the threshold temporarily to `1` day, make sure a deal is still open, has an owner, and has at least one linked contact, then click `Run Check Now`. The reminder will go only to the deal owner and also appear in their in-app notifications.
          </p>
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            disabled={isPending}
            onClick={() => updateSettings.mutate(form)}
          >
            {updateSettings.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Save Settings
          </Button>
        </div>
      </div>
    </div>
  );
}

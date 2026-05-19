'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { BellRing, ChevronLeft, Loader2, Play, Power } from 'lucide-react';
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

const defaultFormState: FormState = {
  leadInactivityEnabled: true,
  leadInactivityDays: 3,
  leadInactivityCooldownHours: 24,
  leadInactivityPipelines: ['sales', 'partner', 'enterprise'],
};

function formatLastRun(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function AutomationSettingsPage() {
  const utils = trpc.useUtils();
  const automations = trpc.automation.list.useQuery();
  const { data, isLoading, error } = trpc.automation.getLeadInactivity.useQuery();
  const [form, setForm] = useState<FormState>(defaultFormState);

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

  const setEnabled = trpc.automation.setEnabled.useMutation({
    onSuccess: async () => {
      await utils.automation.list.invalidate();
    },
    onError: (err) => {
      toast.error('Failed to update automation', { description: err.message });
    },
  });

  const runAutomation = trpc.automation.runNow.useMutation({
    onSuccess: async () => {
      toast.success('Automation run completed');
      await utils.automation.list.invalidate();
      void utils.notifications.unreadCount.invalidate();
      void utils.notifications.list.invalidate({ limit: 20, unreadOnly: false });
    },
    onError: (err) => {
      toast.error('Failed to run automation', { description: err.message });
    },
  });

  const updateSettings = trpc.automation.updateLeadInactivity.useMutation({
    onSuccess: async () => {
      toast.success('Reminder settings saved');
      await utils.automation.getLeadInactivity.invalidate();
    },
    onError: (err) => {
      toast.error('Failed to save settings', { description: err.message });
    },
  });

  const runLeadInactivity = trpc.automation.runLeadInactivityNow.useMutation({
    onSuccess: (result) => {
      toast.success('Reminder check completed', {
        description: `Checked ${result.checked} eligible prospects and sent ${result.sent} owner reminders.`,
      });
      void utils.notifications.unreadCount.invalidate();
      void utils.notifications.list.invalidate({ limit: 20, unreadOnly: false });
    },
    onError: (err) => {
      toast.error('Failed to run reminder check', { description: err.message });
    },
  });

  const isPending = updateSettings.isPending || runLeadInactivity.isPending;

  const togglePipeline = (pipeline: LeadInactivityPipeline) => {
    setForm((current) => {
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
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-start justify-between gap-4 mb-7">
        <div>
          <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 mb-3">
            <ChevronLeft className="w-4 h-4" />
            Back to settings
          </Link>
          <h1 className="text-[15px] font-semibold text-slate-900 tracking-tight">Automations</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Control background CRM automations, manual runs, and owner reminder settings.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_4px_rgba(16,24,40,0.04)]">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Smart automations</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.06em] text-slate-400">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Automation</th>
                <th className="px-4 py-3 text-left font-semibold">Schedule</th>
                <th className="px-4 py-3 text-left font-semibold">Last Run</th>
                <th className="px-4 py-3 text-left font-semibold">Result</th>
                <th className="px-4 py-3 text-left font-semibold">Active</th>
                <th className="px-4 py-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {automations.isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                    Loading automations...
                  </td>
                </tr>
              ) : (
                automations.data?.map((automation) => (
                  <tr key={automation.key} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{automation.name}</p>
                      <p className="mt-0.5 max-w-xs text-xs text-slate-400">{automation.description}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{automation.schedule}</td>
                    <td className="px-4 py-3 text-slate-500">{formatLastRun(automation.lastRunAt)}</td>
                    <td className="px-4 py-3 text-slate-500">{automation.lastRunResult ?? '-'}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={setEnabled.isPending}
                        onClick={() => setEnabled.mutate({ key: automation.key, isEnabled: !automation.isEnabled })}
                        className={`inline-flex h-7 w-12 items-center rounded-full border transition ${automation.isEnabled ? 'border-blue-200 bg-blue-500' : 'border-slate-200 bg-slate-100'}`}
                        aria-label={`Toggle ${automation.name}`}
                      >
                        <span className={`h-5 w-5 rounded-full bg-white shadow-sm transition ${automation.isEnabled ? 'translate-x-5' : 'translate-x-1'}`} />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={runAutomation.isPending || !automation.isEnabled}
                        onClick={() => runAutomation.mutate({ key: automation.key })}
                      >
                        {runAutomation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
                        Run Now
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 bg-white border border-slate-200 rounded-xl p-6 shadow-[0_1px_4px_rgba(16,24,40,0.04)] space-y-6">
        {error && (
          <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-medium">Using default reminder settings</p>
            <p className="mt-1 text-amber-800/90">
              The saved reminder settings could not be loaded yet. This usually means the latest database migration has not been run.
            </p>
          </div>
        )}

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <BellRing className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-800">Owner reminder emails</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Open prospects in selected pipelines notify only the assigned prospect owner when no activity has been logged.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => runLeadInactivity.mutate()}
            disabled={isPending || !form.leadInactivityEnabled}
          >
            {runLeadInactivity.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Run Check Now
          </Button>
        </div>

        <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-slate-800">Enable owner reminder emails</p>
            <p className="text-xs text-slate-400 mt-0.5">If disabled, this reminder check is skipped.</p>
          </div>
          <input
            type="checkbox"
            checked={form.leadInactivityEnabled}
            onChange={(e) => setForm((current) => ({ ...current, leadInactivityEnabled: e.target.checked }))}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="days">Inactivity threshold (days)</Label>
            <Input
              id="days"
              type="number"
              min={1}
              max={30}
              value={form.leadInactivityDays}
              onChange={(e) => setForm((current) => ({ ...current, leadInactivityDays: Math.max(1, Number(e.target.value) || 1) }))}
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
              onChange={(e) => setForm((current) => ({ ...current, leadInactivityCooldownHours: Math.max(1, Number(e.target.value) || 1) }))}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Target pipelines</Label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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

        <div className="flex justify-end">
          <Button
            type="button"
            disabled={isPending || isLoading}
            onClick={() => updateSettings.mutate(form)}
          >
            {updateSettings.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Save Settings
          </Button>
        </div>
      </div>
    </div>
  );
}

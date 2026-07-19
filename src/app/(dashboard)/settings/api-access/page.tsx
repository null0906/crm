'use client';

import React, { useState } from 'react';
import { useSession } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { Key, Plus, Trash2, Copy, Check, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SlideOverPanel } from '@/components/shared/SlideOverPanel';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';

const METRICS_ENDPOINT_PATH = '/api/metrics/daily';

interface TokenRow {
  id: string;
  label: string;
  tokenPrefix: string;
  scope: string;
  isActive: boolean;
  lastUsedAt: Date | string | null;
  createdAt: Date | string;
  revokedAt: Date | string | null;
}

function formatDateTime(value: Date | string | null) {
  if (!value) return 'Never';
  return new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      }}
      className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
    >
      {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function CreateTokenPanel({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [label, setLabel] = useState('');
  const [issuedToken, setIssuedToken] = useState<string | null>(null);

  const create = trpc.apiTokens.create.useMutation({
    onSuccess: (data) => {
      setIssuedToken(data.token);
      onCreated();
    },
    onError: (err) => toast.error('Could not create token', { description: err.message }),
  });

  function handleClose() {
    setLabel('');
    setIssuedToken(null);
    onClose();
  }

  return (
    <SlideOverPanel open={open} onClose={handleClose} title="Create API Token" width="md">
      <div className="space-y-5 p-6">
        {!issuedToken ? (
          <>
            <p className="text-sm text-slate-500">
              Give this token a descriptive label — who or what it&apos;s for — so it&apos;s easy to identify
              and revoke later without affecting other integrations.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="tokenlabel">Label *</Label>
              <Input
                id="tokenlabel"
                placeholder="Sanil — Daily Dashboard Automation"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
              <Button
                disabled={!label.trim() || create.isPending}
                onClick={() => create.mutate({ label: label.trim() })}
              >
                {create.isPending ? 'Creating…' : 'Create Token'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                This is the only time the full token is shown. Copy it now and store it somewhere safe
                (e.g. the automation&apos;s own secrets config) — the CRM only keeps a hash, it cannot be
                retrieved again. If you lose it, revoke this token and create a new one.
              </span>
            </div>
            <div className="space-y-1.5">
              <Label>Token</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded-md bg-slate-900 px-3 py-2 text-xs text-green-400">
                  {issuedToken}
                </code>
                <CopyButton value={issuedToken} />
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={handleClose}>Done</Button>
            </div>
          </>
        )}
      </div>
    </SlideOverPanel>
  );
}

export default function ApiAccessSettingsPage() {
  const { data: session } = useSession();
  const role = ((session?.user as Record<string, unknown> | undefined)?.role as Record<string, unknown> | undefined)?.slug;

  const [createOpen, setCreateOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<TokenRow | null>(null);

  const utils = trpc.useUtils();
  const { data: tokens, isLoading } = trpc.apiTokens.list.useQuery(undefined, { enabled: role === 'super_admin' });

  const revoke = trpc.apiTokens.revoke.useMutation({
    onSuccess: () => {
      toast.success('Token revoked');
      setRevokeTarget(null);
      void utils.apiTokens.list.invalidate();
    },
    onError: (err) => toast.error('Could not revoke token', { description: err.message }),
  });

  if (role && role !== 'super_admin') {
    return <div className="flex h-full items-center justify-center text-sm text-slate-500">API access is restricted to super admins.</div>;
  }

  const endpointUrl = typeof window !== 'undefined' ? `${window.location.origin}${METRICS_ENDPOINT_PATH}` : METRICS_ENDPOINT_PATH;
  const exampleResponse = `{
  "generatedAt": "2026-07-19T03:30:00.000Z",
  "pipeline": {
    "openCount": 12,
    "openValue": 4500000,
    "byStage": [{ "stage": "Discovery", "count": 3, "value": 900000 }],
    "wonThisMonth": { "count": 2, "value": 800000 },
    "lostThisMonth": { "count": 1 }
  },
  "activity": {
    "activitiesToday": 14,
    "proposalsSentThisMonth": 5,
    "staleProspects": 3,
    "unassignedLeads": 2
  },
  "companies": { "newToday": 1, "newThisWeek": 4 }
}`;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-semibold text-slate-900 tracking-tight">API Access</h1>
          <p className="text-sm text-slate-500 mt-1">Read-only tokens for external automations to pull daily company metrics.</p>
        </div>
      </div>

      {/* Documentation */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
            <Key className="w-5 h-5 text-slate-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Daily Metrics Endpoint</h2>
            <p className="text-xs text-slate-500 mt-0.5">Read-only. GET request. One token per integration.</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-700">
              GET {endpointUrl}
            </code>
            <CopyButton value={endpointUrl} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500 mb-1">Header</p>
            <code className="block rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-700">
              Authorization: Bearer &lt;token&gt;
            </code>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500 mb-1">Example response</p>
            <pre className="rounded-md bg-slate-900 px-3 py-2 text-xs text-green-400 overflow-x-auto">{exampleResponse}</pre>
          </div>
        </div>
      </div>

      {/* Tokens */}
      <div className="bg-white border border-slate-200 rounded-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Tokens</h2>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Create Token
          </Button>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading…</div>
        ) : !(tokens as TokenRow[] | undefined)?.length ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            No tokens yet. Create one to let an external automation read daily metrics.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Label</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Token</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Last Used</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Created</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {(tokens as TokenRow[]).map((t) => (
                <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">{t.label}</td>
                  <td className="px-4 py-3 text-sm font-mono text-slate-500">{t.tokenPrefix}••••••••</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(t.lastUsedAt)}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(t.createdAt)}</td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={t.isActive ? 'default' : 'secondary'}
                      className={t.isActive ? 'bg-green-100 text-green-700 hover:bg-green-100' : ''}
                    >
                      {t.isActive ? 'Active' : 'Revoked'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {t.isActive && (
                      <button
                        onClick={() => setRevokeTarget(t)}
                        className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-600"
                        title="Revoke"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CreateTokenPanel
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => void utils.apiTokens.list.invalidate()}
      />

      <ConfirmDialog
        open={!!revokeTarget}
        onOpenChange={(open) => { if (!open) setRevokeTarget(null); }}
        onConfirm={() => { if (revokeTarget) revoke.mutate({ id: revokeTarget.id }); }}
        title="Revoke API Token"
        description={`"${revokeTarget?.label}" will immediately stop working. This cannot be undone — you'd need to create a new token.`}
        confirmLabel="Revoke"
        destructive
      />
    </div>
  );
}

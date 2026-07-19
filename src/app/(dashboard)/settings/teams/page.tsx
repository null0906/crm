'use client';

import React, { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { Users, Plus, Trash2, RefreshCw, ChevronDown, ChevronUp, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SlideOverPanel } from '@/components/shared/SlideOverPanel';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { cn } from '@/lib/utils';

function StatusBadge({ status }: { status: string | null | undefined }) {
  const map: Record<string, { label: string; cls: string }> = {
    success: { label: 'Success', cls: 'bg-green-100 text-green-700' },
    error: { label: 'Error', cls: 'bg-red-100 text-red-700' },
    unauthorized: { label: 'Unauthorized', cls: 'bg-amber-100 text-amber-700' },
    ignored: { label: 'Ignored', cls: 'bg-slate-100 text-slate-600' },
  };
  const s = map[status ?? ''] ?? { label: status ?? '—', cls: 'bg-slate-100 text-slate-600' };
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', s.cls)}>
      {s.label}
    </span>
  );
}

function AddUserPanel({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [aadObjectId, setAadObjectId] = useState('');
  const [teamsName, setTeamsName] = useState('');
  const [crmUserId, setCrmUserId] = useState('');

  const { data: crmUsers } = trpc.users.list.useQuery();
  const addUser = trpc.teams.addUser.useMutation({
    onSuccess: () => {
      toast.success('Teams user added');
      onAdded();
      onClose();
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aadObjectId.trim() || !crmUserId) return;
    addUser.mutate({ aadObjectId: aadObjectId.trim(), teamsName: teamsName || undefined, crmUserId });
  };

  return (
    <SlideOverPanel open={open} onClose={onClose} title="Add Teams User" width="md">
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        <p className="text-sm text-slate-500">
          Link a Microsoft Teams account to a CRM user. You don&apos;t need to look this up in Azure AD
          manually — ask the person to DM the bot once (e.g. <code className="bg-slate-100 px-1 rounded text-xs">/help</code>),
          it will reply that they&apos;re not linked yet, then find their attempt in the{' '}
          <strong>Message Log</strong> below and copy the Object ID from there.
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="aadid">Entra ID Object ID *</Label>
          <Input
            id="aadid"
            placeholder="00000000-0000-0000-0000-000000000000"
            value={aadObjectId}
            onChange={(e) => setAadObjectId(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="teamsname">Display Name (optional)</Label>
          <Input
            id="teamsname"
            placeholder="Jane Doe"
            value={teamsName}
            onChange={(e) => setTeamsName(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="crmuser">CRM User *</Label>
          <select
            id="crmuser"
            className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={crmUserId}
            onChange={(e) => setCrmUserId(e.target.value)}
            required
          >
            <option value="">Select team member…</option>
            {crmUsers?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.firstName} {u.lastName} — {u.email}
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={addUser.isPending}>
            {addUser.isPending ? 'Adding…' : 'Add User'}
          </Button>
        </div>
      </form>
    </SlideOverPanel>
  );
}

interface LogEntry {
  id: number;
  aadObjectId: string | null;
  command: string | null;
  rawMessage: string | null;
  resultStatus: string | null;
  resultMessage: string | null;
  createdAt: Date;
}

function LogRow({ row }: { row: LogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const msg = row.rawMessage ?? '';
  const preview = msg.length > 60 ? msg.slice(0, 60) + '…' : msg;

  return (
    <>
      <tr
        className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
          {new Date(row.createdAt).toLocaleString('en-IN')}
        </td>
        <td className="px-4 py-3 text-xs font-mono text-slate-700">{row.aadObjectId ?? '—'}</td>
        <td className="px-4 py-3 text-xs font-mono text-blue-700">{row.command ?? '—'}</td>
        <td className="px-4 py-3 text-xs text-slate-600 max-w-xs truncate">{preview}</td>
        <td className="px-4 py-3"><StatusBadge status={row.resultStatus} /></td>
        <td className="px-4 py-3 text-slate-400">
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50 border-b border-slate-100">
          <td colSpan={6} className="px-4 py-3">
            <div className="text-xs space-y-1">
              <div>
                <span className="font-medium text-slate-700">Object ID: </span>
                <code className="text-slate-600">{row.aadObjectId ?? '—'}</code>
              </div>
              <div>
                <span className="font-medium text-slate-700">Message: </span>
                <pre className="inline whitespace-pre-wrap text-slate-600">{msg}</pre>
              </div>
              <div>
                <span className="font-medium text-slate-700">Response: </span>
                <pre className="inline whitespace-pre-wrap text-slate-600">{row.resultMessage ?? '—'}</pre>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

interface TeamsUserRow {
  id: string;
  aadObjectId: string;
  teamsName: string | null;
  isActive: boolean;
  lastActiveAt: Date | null;
  crmUserFirstName: string;
  crmUserLastName: string;
  crmUserEmail: string;
}

interface BotStatus {
  connected: boolean;
  appId?: string;
  activeUsers?: number;
  lastMessageAt?: Date | null;
}

export default function TeamsSettingsPage() {
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const { data: teamsUsersData, isLoading: usersLoading } = trpc.teams.listUsers.useQuery();
  const { data: status } = trpc.teams.getBotStatus.useQuery();
  const { data: logData } = trpc.teams.getMessageLog.useQuery({ pagination: { limit: 50 } });

  const removeUser = trpc.teams.removeUser.useMutation({
    onSuccess: () => {
      toast.success('User removed');
      void utils.teams.listUsers.invalidate();
    },
  });

  const toggleActive = trpc.teams.toggleActive.useMutation({
    onSuccess: () => void utils.teams.listUsers.invalidate(),
  });

  const testConn = trpc.teams.testConnection.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Connected! App ID: ${'appId' in data ? data.appId : ''}`);
      } else {
        toast.error(`Connection failed: ${'error' in data ? data.error : 'Unknown error'}`);
      }
    },
  });

  const bulkLink = trpc.teams.bulkLinkByEmail.useMutation({
    onSuccess: (result) => {
      const parts = [`${result.linked.length} linked`];
      if (result.skippedAlreadyLinked) parts.push(`${result.skippedAlreadyLinked} already linked`);
      if (result.notFound.length) parts.push(`${result.notFound.length} not found in Entra ID`);
      toast.success(`Sync complete — ${parts.join(', ')}`, {
        description: result.notFound.length ? `Not found: ${result.notFound.join(', ')}` : undefined,
      });
      void utils.teams.listUsers.invalidate();
    },
    onError: (err) => toast.error('Sync failed', { description: err.message }),
  });

  const botStatus = status as BotStatus | undefined;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-semibold text-slate-900 tracking-tight">Microsoft Teams Integration</h1>
          <p className="text-sm text-slate-500 mt-1">Bot configuration, authorized users, and message log.</p>
        </div>
      </div>

      {/* Bot Status */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
              <Users className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Bot Status</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                App ID: <span className="font-mono">{botStatus?.appId ?? '—'}</span>
              </p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => testConn.mutate()} disabled={testConn.isPending}>
            <RefreshCw className={cn('w-3.5 h-3.5 mr-1.5', testConn.isPending && 'animate-spin')} />
            Test Connection
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-slate-500">Connection</p>
            <div className="flex items-center gap-1 mt-1">
              {botStatus?.connected
                ? <CheckCircle className="w-4 h-4 text-green-500" />
                : <XCircle className="w-4 h-4 text-red-400" />}
              <span className="text-sm font-medium">{botStatus?.connected ? 'Connected' : 'Disconnected'}</span>
            </div>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-slate-500">Active Users</p>
            <p className="text-sm font-medium mt-1">{botStatus?.activeUsers ?? '—'}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-slate-500">Last Message</p>
            <p className="text-sm font-medium mt-1">
              {botStatus?.lastMessageAt
                ? new Date(botStatus.lastMessageAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                : '—'}
            </p>
          </div>
        </div>

        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
          <strong>Setup:</strong> Set <code>TEAMS_BOT_APP_ID</code>, <code>TEAMS_BOT_APP_PASSWORD</code> and{' '}
          <code>TEAMS_BOT_TENANT_ID</code> env vars. The messaging endpoint (<code>/api/webhooks/teams</code>) is
          configured in the Azure Bot resource&apos;s Configuration blade, not via an env var.
        </div>
      </div>

      {/* Authorized Users */}
      <div className="bg-white border border-slate-200 rounded-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Authorized Users</h2>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => bulkLink.mutate()}
              disabled={bulkLink.isPending}
              title="Automatically link every active CRM user by matching their email against Entra ID — no need for them to message the bot first"
            >
              <RefreshCw className={cn('w-3.5 h-3.5 mr-1.5', bulkLink.isPending && 'animate-spin')} />
              {bulkLink.isPending ? 'Syncing…' : 'Sync All Users'}
            </Button>
            <Button size="sm" onClick={() => setAddPanelOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add User
            </Button>
          </div>
        </div>

        {usersLoading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading…</div>
        ) : !(teamsUsersData as TeamsUserRow[] | undefined)?.length ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            No Teams users configured. Add users to allow bot access.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">CRM User</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Object ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Last Active</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {(teamsUsersData as TeamsUserRow[]).map((u) => (
                <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm">
                    <div className="font-medium text-slate-900">{u.crmUserFirstName} {u.crmUserLastName}</div>
                    <div className="text-xs text-slate-500">{u.crmUserEmail}</div>
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-slate-700">{u.aadObjectId}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{u.teamsName ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={u.isActive ? 'default' : 'secondary'}
                      className={u.isActive ? 'bg-green-100 text-green-700 hover:bg-green-100' : ''}
                    >
                      {u.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => toggleActive.mutate({ id: u.id, isActive: !u.isActive })}
                        className={cn(
                          'px-2 py-1 text-xs rounded border',
                          u.isActive
                            ? 'border-slate-200 text-slate-600 hover:bg-slate-50'
                            : 'border-green-200 text-green-700 bg-green-50 hover:bg-green-100'
                        )}
                      >
                        {u.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => setRemoveId(u.id)}
                        className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-600"
                        title="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Message Log */}
      <div className="bg-white border border-slate-200 rounded-xl">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Message Log</h2>
          <p className="text-xs text-slate-500 mt-0.5">Recent bot interactions. Click a row to expand.</p>
        </div>

        {!logData?.items?.length ? (
          <div className="p-8 text-center text-slate-400 text-sm">No messages yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Object ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Command</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Message</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {logData.items.map((row) => (
                  <LogRow key={row.id} row={row as unknown as LogEntry} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AddUserPanel
        open={addPanelOpen}
        onClose={() => setAddPanelOpen(false)}
        onAdded={() => void utils.teams.listUsers.invalidate()}
      />

      <ConfirmDialog
        open={!!removeId}
        onOpenChange={(open) => { if (!open) setRemoveId(null); }}
        onConfirm={() => {
          if (removeId) removeUser.mutate({ id: removeId });
          setRemoveId(null);
        }}
        title="Remove Teams User"
        description="This user will no longer be able to use the bot. Are you sure?"
        confirmLabel="Remove"
        destructive
      />
    </div>
  );
}

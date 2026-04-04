'use client';

import React, { useState } from 'react';
import { ChevronLeft, Shield } from 'lucide-react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/formatters';

const actionVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'warning' | 'success'> = {
  create: 'success',
  update: 'default',
  delete: 'destructive',
  login: 'secondary',
  export: 'warning',
  import: 'warning',
};

const PAGE_SIZE = 50;

export default function AuditLogPage() {
  const [offset, setOffset] = useState(0);

  const { data: logs = [], isLoading } = trpc.auditLog.list.useQuery({
    limit: PAGE_SIZE,
    offset,
  });

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-slate-200 bg-white flex items-center gap-2">
        <Link href="/settings" className="text-slate-400 hover:text-slate-600">
          <ChevronLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Audit Log</h1>
          <p className="text-sm text-slate-500">Track all changes and access across the system.</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-6 text-sm text-slate-400">Loading...</div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64">
            <Shield className="w-10 h-10 text-slate-300 mb-3" />
            <p className="text-slate-400 text-sm">No audit events yet.</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
              <tr>
                {['Time', 'User', 'Action', 'Entity', 'Entity Name'].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={String(log.id)} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                    {formatDate(log.createdAt)}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-slate-700">
                    {log.userEmail}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={actionVariant[log.action] ?? 'secondary'} className="text-xs capitalize">
                      {log.action}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-sm text-slate-600 capitalize">{log.entityType}</td>
                  <td className="px-4 py-2.5 text-sm text-slate-700">{log.entityName ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between px-6 py-3 bg-white border-t border-slate-200">
        <span className="text-xs text-slate-500">Showing {offset + 1}–{offset + logs.length}</span>
        <div className="flex items-center gap-2">
          {offset > 0 && (
            <Button size="sm" variant="outline" onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
              Previous
            </Button>
          )}
          {logs.length === PAGE_SIZE && (
            <Button size="sm" variant="outline" onClick={() => setOffset(offset + PAGE_SIZE)}>
              Next
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

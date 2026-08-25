'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

/**
 * Delivery roles (FR-P4-54) — distinct from the CRM permission roles in
 * Settings → Users. What someone does on an engagement and what they may do in
 * the CRM are different questions; the cost engine prices from the former.
 */
export function DeliveryRolesTab() {
  const utils = trpc.useUtils();
  const { data: roles = [], isLoading } = trpc.costModel.listRoles.useQuery({ includeInactive: true });
  const { data: staff = [] } = trpc.costModel.listStaffWithRoles.useQuery();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  const createRole = trpc.costModel.createRole.useMutation({
    onSuccess: () => {
      toast.success('Delivery role created');
      setName('');
      setCreating(false);
      void utils.costModel.listRoles.invalidate();
    },
    onError: (err) => toast.error('Could not create the role', { description: err.message }),
  });

  const assign = trpc.costModel.assignRoleToUser.useMutation({
    onSuccess: () => {
      toast.success('Delivery role assigned');
      void utils.costModel.listStaffWithRoles.invalidate();
    },
    onError: (err) => toast.error('Could not assign the role', { description: err.message }),
  });

  const countFor = (roleId: string) => staff.filter((s) => s.deliveryRoleId === roleId).length;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <p className="max-w-xl text-[11px] leading-relaxed text-slate-400">
          The roles an engagement is staffed with. Separate from the permission roles in Users &
          Roles — this is what the cost engine prices from.
        </p>
        {!creating && (
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-3 w-3" />
            New role
          </Button>
        )}
      </div>

      {creating && (
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_4px_rgba(16,24,40,0.04)]">
          <Label htmlFor="role-name" className="text-[11px]">
            Role name
          </Label>
          <div className="mt-1 flex gap-2">
            <Input
              id="role-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Cloud Security Engineer"
              autoFocus
            />
            <Button
              size="sm"
              disabled={name.trim().length < 2 || createRole.isPending}
              onClick={() =>
                createRole.mutate({ name: name.trim(), slug: slugify(name), position: roles.length + 1 })
              }
            >
              Create
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setName(''); }}>
              Cancel
            </Button>
          </div>
          {name.trim() && (
            <p className="mt-1.5 text-[11px] text-slate-400">
              Identifier: <code className="text-slate-500">{slugify(name)}</code>
            </p>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_4px_rgba(16,24,40,0.04)]">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Role</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Identifier</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">People</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-[12px] text-slate-400">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && roles.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-[12px] text-slate-400">
                  No delivery roles yet.
                </td>
              </tr>
            )}
            {roles.map((role) => (
              <tr key={role.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2.5 text-[13px] text-slate-800">{role.name}</td>
                <td className="px-4 py-2.5">
                  <code className="text-[11px] text-slate-400">{role.slug}</code>
                </td>
                <td className="px-4 py-2.5 text-[12px] text-slate-500">{countFor(role.id)}</td>
                <td className="px-4 py-2.5">
                  <Badge variant={role.isActive ? 'success' : 'secondary'}>
                    {role.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400">
          Who does what
        </h3>
        <p className="mb-2 px-1 text-[11px] text-slate-400">
          A person&apos;s default delivery role. Used when an estimate is costed against named
          people rather than role averages.
        </p>
        <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_4px_rgba(16,24,40,0.04)]">
          <table className="w-full">
            <tbody>
              {staff.map((person) => (
                <tr key={person.userId} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2.5">
                    <p className="text-[13px] text-slate-800">
                      {person.firstName} {person.lastName}
                    </p>
                    <p className="text-[11px] text-slate-400">{person.email}</p>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <select
                      value={person.deliveryRoleId ?? ''}
                      onChange={(e) =>
                        e.target.value &&
                        assign.mutate({ userId: person.userId, deliveryRoleId: e.target.value })
                      }
                      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-700"
                    >
                      <option value="">Not assigned</option>
                      {roles
                        .filter((r) => r.isActive)
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Archive, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';

interface Role {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  position: number;
  isActive: boolean;
}

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
  const { data: usage = [] } = trpc.costModel.roleUsage.useQuery();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [retiring, setRetiring] = useState<Role | null>(null);
  const [deleting, setDeleting] = useState<Role | null>(null);

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

  // Deactivating changes which roles the pickers offer; deleting cascades away
  // the role's closed historic rates, which Cost Rates counts when deciding
  // whether a delete is safe. Both invalidate the component list.
  const refreshRoles = () => {
    void utils.costModel.listRoles.invalidate();
    void utils.costModel.roleUsage.invalidate();
    void utils.costModel.listComponents.invalidate();
  };

  const updateRole = trpc.costModel.updateRole.useMutation({
    onSuccess: (row) => {
      toast.success(row.isActive ? 'Delivery role updated' : 'Delivery role deactivated');
      setEditingId(null);
      setRetiring(null);
      refreshRoles();
    },
    onError: (err) => toast.error('Could not update the role', { description: err.message }),
  });

  const reorderRoles = trpc.costModel.reorderRoles.useMutation({
    onSuccess: () => void utils.costModel.listRoles.invalidate(),
    onError: (err) => toast.error('Could not reorder the roles', { description: err.message }),
  });

  const deleteRole = trpc.costModel.deleteRole.useMutation({
    onSuccess: () => {
      toast.success('Delivery role deleted');
      setDeleting(null);
      refreshRoles();
      // The staff table and Settings -> Users both show role assignments.
      void utils.costModel.listStaffWithRoles.invalidate();
      void utils.users.list.invalidate();
    },
    onError: (err) => toast.error('Could not delete the role', { description: err.message }),
  });

  const assign = trpc.costModel.assignRoleToUser.useMutation({
    onSuccess: (row) => {
      toast.success(row ? 'Delivery role assigned' : 'Delivery role cleared');
      void utils.costModel.listStaffWithRoles.invalidate();
      // Settings -> Users shows the same fact, so it goes stale otherwise.
      void utils.users.list.invalidate();
    },
    onError: (err) => toast.error('Could not change the role', { description: err.message }),
  });

  const countFor = (roleId: string) => staff.filter((s) => s.deliveryRoleId === roleId).length;

  const usageFor = (roleId: string) => usage.find((u) => u.deliveryRoleId === roleId);

  /**
   * A role is only ever really deleted when nothing points at it. Anything else
   * gets deactivated, which keeps the estimates and baselines that name it
   * resolvable. The server enforces this too — this only picks the button.
   */
  const canDelete = (roleId: string) => {
    const u = usageFor(roleId);
    if (!u) return false;
    return u.staff === 0 && u.baselineLines === 0 && u.estimateLines === 0;
  };

  const startEditing = (role: Role) => {
    setEditingId(role.id);
    setEditName(role.name);
    setEditDescription(role.description ?? '');
  };

  /**
   * Positions are re-indexed from 1 across the whole list rather than swapped
   * in place: roles created before the tab sent a position all sit at 0, so a
   * swap of two zeroes would move nothing.
   */
  const move = (index: number, direction: -1 | 1) => {
    const next = [...roles];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    reorderRoles.mutate(next.map((r, i) => ({ id: r.id, position: i + 1 })));
  };

  const deletingUsage = deleting ? usageFor(deleting.id) : undefined;

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
              <th className="w-32 px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-[12px] text-slate-400">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && roles.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-[12px] text-slate-400">
                  No delivery roles yet.
                </td>
              </tr>
            )}
            {roles.map((role, index) =>
              editingId === role.id ? (
                <tr key={role.id} className="border-b border-slate-100 bg-slate-50/60 last:border-0">
                  <td colSpan={5} className="px-4 py-3">
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="min-w-45 flex-1">
                        <Label htmlFor={`role-name-${role.id}`} className="text-[11px]">
                          Role name
                        </Label>
                        <Input
                          id={`role-name-${role.id}`}
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="mt-1"
                          autoFocus
                        />
                      </div>
                      <div className="min-w-55 flex-2">
                        <Label htmlFor={`role-desc-${role.id}`} className="text-[11px]">
                          Description <span className="text-slate-300">(optional)</span>
                        </Label>
                        <Input
                          id={`role-desc-${role.id}`}
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          placeholder="What this role does on an engagement"
                          className="mt-1"
                        />
                      </div>
                      <Button
                        size="sm"
                        disabled={editName.trim().length < 2 || updateRole.isPending}
                        onClick={() =>
                          updateRole.mutate({
                            id: role.id,
                            name: editName.trim(),
                            description: editDescription.trim() || null,
                          })
                        }
                      >
                        {updateRole.isPending ? 'Saving…' : 'Save'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                    <p className="mt-1.5 text-[11px] text-slate-400">
                      Identifier <code className="text-slate-500">{role.slug}</code> stays fixed —
                      estimates and baselines are keyed on it.
                    </p>
                  </td>
                </tr>
              ) : (
                <tr key={role.id} className="group border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2.5">
                    <p className="text-[13px] text-slate-800">{role.name}</p>
                    {role.description && (
                      <p className="text-[11px] text-slate-400">{role.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <code className="text-[11px] text-slate-400">{role.slug}</code>
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-slate-500">{countFor(role.id)}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant={role.isActive ? 'success' : 'secondary'}>
                      {role.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      {role.isActive ? (
                        <>
                          <button
                            onClick={() => move(index, -1)}
                            disabled={index === 0 || reorderRoles.isPending}
                            className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:pointer-events-none disabled:opacity-30"
                            title="Move up"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => move(index, 1)}
                            disabled={index === roles.length - 1 || reorderRoles.isPending}
                            className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:pointer-events-none disabled:opacity-30"
                            title="Move down"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => startEditing(role)}
                            className="rounded p-1 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                            title="Rename"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          {canDelete(role.id) ? (
                            <button
                              onClick={() => setDeleting(role)}
                              className="rounded p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                              title="Delete role"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => setRetiring(role)}
                              className="rounded p-1 text-slate-400 transition-colors hover:bg-amber-50 hover:text-amber-600"
                              title="Deactivate role"
                            >
                              <Archive className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </>
                      ) : (
                        <button
                          onClick={() => updateRole.mutate({ id: role.id, isActive: true })}
                          disabled={updateRole.isPending}
                          className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
                          title="Reactivate role"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Reactivate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400">
          Who does what
        </h3>
        <p className="mb-2 px-1 text-[11px] text-slate-400">
          A person&apos;s default delivery role. It decides where they appear in an estimate&apos;s
          team picker and which roles a baseline suggests them for — it no longer affects what they
          cost, which is set against them individually under Cost Rates.
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
                        // Empty clears the role. This used to be guarded on a
                        // truthy value, which made "Not assigned" do nothing at
                        // all — the one option that looked like it should.
                        assign.mutate({
                          userId: person.userId,
                          deliveryRoleId: e.target.value || null,
                        })
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


      <ConfirmDialog
        open={!!retiring}
        onOpenChange={(o) => !o && setRetiring(null)}
        title="Deactivate role?"
        description={
          retiring
            ? `${retiring.name} will disappear from new estimates, from the effort catalog and from the assignment picker. Existing estimates, baselines and its rate history are untouched, and you can reactivate it at any time.`
            : undefined
        }
        confirmLabel="Deactivate"
        loading={updateRole.isPending}
        onConfirm={() => retiring && updateRole.mutate({ id: retiring.id, isActive: false })}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete role?"
        description={
          deleting
            ? `${deleting.name} is not used by any person, baseline or estimate, so it can be removed for good.` +
              (deletingUsage && deletingUsage.rates > 0
                ? ` Its ${deletingUsage.rates} stored rate ${deletingUsage.rates === 1 ? 'version goes' : 'versions go'} with it. This cannot be undone.`
                : ' This cannot be undone.')
            : undefined
        }
        confirmLabel="Delete"
        destructive
        loading={deleteRole.isPending}
        onConfirm={() => deleting && deleteRole.mutate({ id: deleting.id })}
      />
    </div>
  );
}

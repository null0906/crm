'use client';

import React, { useState } from 'react';
import { Plus, ChevronLeft, Users, Pencil, Shield, ChevronDown, ChevronUp, Check, X, KeyRound, Eye, EyeOff, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { SlideOverPanel } from '@/components/shared/SlideOverPanel';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { formatDate, getInitials } from '@/lib/formatters';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { RolePermissions } from '@/lib/types';

const createUserSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  roleId: z.string().uuid(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type CreateUserForm = z.infer<typeof createUserSchema>;

// ─── Permission matrix definition ─────────────────────────────────────────────
const PERMISSION_SECTIONS = [
  {
    key: 'contacts',
    label: 'Contacts',
    perms: [
      { key: 'create', label: 'Create', type: 'bool' },
      { key: 'read', label: 'Read', type: 'level' },
      { key: 'update', label: 'Update', type: 'level' },
      { key: 'delete', label: 'Delete', type: 'bool' },
      { key: 'export', label: 'Export', type: 'bool' },
    ],
  },
  {
    key: 'companies',
    label: 'Companies',
    perms: [
      { key: 'create', label: 'Create', type: 'bool' },
      { key: 'read', label: 'Read', type: 'level' },
      { key: 'update', label: 'Update', type: 'level' },
      { key: 'delete', label: 'Delete', type: 'bool' },
      { key: 'export', label: 'Export', type: 'bool' },
    ],
  },
  {
    key: 'deals',
    label: 'Deals',
    perms: [
      { key: 'create', label: 'Create', type: 'bool' },
      { key: 'read', label: 'Read', type: 'level' },
      { key: 'update', label: 'Update', type: 'level' },
      { key: 'delete', label: 'Delete', type: 'bool' },
      { key: 'export', label: 'Export', type: 'bool' },
    ],
  },
  {
    key: 'activities',
    label: 'Activities',
    perms: [
      { key: 'create', label: 'Create', type: 'bool' },
      { key: 'read', label: 'Read', type: 'level' },
      { key: 'update', label: 'Update', type: 'level' },
      { key: 'delete', label: 'Delete', type: 'bool' },
    ],
  },
  {
    key: 'dashboards',
    label: 'Dashboards',
    perms: [
      { key: 'create', label: 'Create', type: 'bool' },
      { key: 'read', label: 'Read', type: 'level' },
      { key: 'update', label: 'Update', type: 'level' },
      { key: 'delete', label: 'Delete', type: 'bool' },
      { key: 'publish', label: 'Publish', type: 'bool' },
    ],
  },
  {
    key: 'settings',
    label: 'Settings',
    perms: [
      { key: 'users', label: 'Users', type: 'bool' },
      { key: 'roles', label: 'Roles', type: 'bool' },
      { key: 'custom_fields', label: 'Custom Fields', type: 'bool' },
      { key: 'tags', label: 'Tags', type: 'bool' },
      { key: 'pipelines', label: 'Pipelines', type: 'bool' },
    ],
  },
  {
    key: 'reports',
    label: 'Reports',
    perms: [
      { key: 'view', label: 'View', type: 'bool' },
      { key: 'export', label: 'Export', type: 'bool' },
    ],
  },
  {
    key: 'imports',
    label: 'Imports',
    perms: [{ key: 'create', label: 'Import Data', type: 'bool' }],
  },
  {
    key: 'audit_log',
    label: 'Audit Log',
    perms: [{ key: 'read', label: 'View Audit Log', type: 'bool' }],
  },
  {
    key: 'users',
    label: 'User Management',
    perms: [{ key: 'manage', label: 'Manage Users', type: 'bool' }],
  },
  {
    key: 'roles',
    label: 'Role Management',
    perms: [{ key: 'manage', label: 'Manage Roles', type: 'bool' }],
  },
  {
    key: 'tags',
    label: 'Tags',
    perms: [{ key: 'manage', label: 'Manage Tags', type: 'bool' }],
  },
];

export default function UsersSettingsPage() {
  const utils = trpc.useUtils();
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<Record<string, unknown> | null>(null);
  const [resetUser, setResetUser] = useState<Record<string, unknown> | null>(null);
  const [deleteUserId, setDeleteUserId] = useState<string>('');
  const [deleteUserName, setDeleteUserName] = useState<string>('');
  const [rolesOpen, setRolesOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  const { data: users = [], isLoading } = trpc.users.list.useQuery();
  const { data: roles = [] } = trpc.users.listRoles.useQuery();

  const createUser = trpc.users.create.useMutation({
    onSuccess: () => {
      toast.success('User created');
      setCreateOpen(false);
      form.reset({ roleId: roles[0]?.id ?? '' });
      void utils.users.list.invalidate();
    },
    onError: (err) => toast.error('Failed to create user', { description: err.message }),
  });

  const resetPassword = trpc.users.resetPassword.useMutation({
    onSuccess: () => {
      toast.success('Password reset successfully');
      setResetUser(null);
      setNewPassword('');
    },
    onError: (err) => toast.error('Failed to reset password', { description: err.message }),
  });

  const deleteUser = trpc.users.delete.useMutation({
    onSuccess: () => {
      toast.success('User removed');
      setDeleteUserId('');
      setDeleteUserName('');
      void utils.users.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateUser = trpc.users.update.useMutation({
    onSuccess: () => {
      toast.success('User updated');
      setEditUser(null);
      void utils.users.list.invalidate();
    },
    onError: (err) => toast.error('Failed to update user', { description: err.message }),
  });

  const form = useForm<CreateUserForm>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { roleId: '' },
  });

  React.useEffect(() => {
    if (roles.length > 0 && !form.getValues('roleId')) {
      form.setValue('roleId', roles[0]!.id);
    }
  }, [roles, form]);

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Link href="/settings" className="text-slate-400 hover:text-slate-600">
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-[15px] font-semibold text-slate-900 tracking-tight">Users & Roles</h1>
            <p className="text-xs text-slate-400 mt-0.5">Manage team members and their permissions.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setRolesOpen(!rolesOpen)}>
            <Shield className="w-4 h-4" />
            Role Permissions
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" />
            Invite User
          </Button>
        </div>
      </div>

      {/* Users list */}
      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 mb-6">
        {isLoading ? (
          <div className="p-5 text-sm text-slate-400">Loading...</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No users yet.</p>
          </div>
        ) : (
          users.map((user) => (
            <div key={user.id} className="flex items-center gap-4 px-5 py-4 group">
              <Avatar className="w-9 h-9">
                <AvatarFallback className="text-sm bg-blue-100 text-blue-700">
                  {getInitials(user.firstName, user.lastName)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900">{user.firstName} {user.lastName}</p>
                <p className="text-xs text-slate-500 font-mono">{user.email}</p>
              </div>
              <Badge variant="secondary" className="text-xs">{user.role.name}</Badge>
              <span className="text-xs text-slate-400">{formatDate(user.createdAt)}</span>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                <button
                  onClick={() => { setResetUser(user as Record<string, unknown>); setNewPassword(''); setShowNewPassword(false); }}
                  className="p-1 rounded hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors"
                  title="Reset password"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setEditUser(user as Record<string, unknown>)}
                  className="p-1 rounded hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"
                  title="Edit user"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => { setDeleteUserId(user.id as string); setDeleteUserName(`${user.firstName as string} ${user.lastName as string}`); }}
                  className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                  title="Delete user"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Role Permissions editor */}
      {rolesOpen && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Role Permissions</h2>
              <p className="text-xs text-slate-500 mt-0.5">Configure what each role can access and do.</p>
            </div>
            <button onClick={() => setRolesOpen(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-5 space-y-4">
            {roles.map((role) => (
              <RolePermissionEditor key={role.id} role={role as Record<string, unknown>} />
            ))}
          </div>
        </div>
      )}

      {/* Edit user panel */}
      {editUser && (
        <SlideOverPanel open={!!editUser} onClose={() => setEditUser(null)} title="Edit User" width="md">
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
              <Avatar className="w-10 h-10">
                <AvatarFallback className="bg-blue-100 text-blue-700">
                  {getInitials(editUser.firstName as string, editUser.lastName as string)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-semibold text-slate-900">{editUser.firstName as string} {editUser.lastName as string}</p>
                <p className="text-xs text-slate-500 font-mono">{editUser.email as string}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>First Name</Label>
                <Input
                  defaultValue={editUser.firstName as string}
                  id="edit-firstName"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Last Name</Label>
                <Input
                  defaultValue={editUser.lastName as string}
                  id="edit-lastName"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Role</Label>
              <select
                id="edit-roleId"
                defaultValue={(editUser.role as Record<string, unknown>).id as string}
                className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <select
                id="edit-status"
                defaultValue={editUser.status as string}
                className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setEditUser(null)}>Cancel</Button>
              <Button
                className="flex-1"
                disabled={updateUser.isPending}
                onClick={() => {
                  const firstName = (document.getElementById('edit-firstName') as HTMLInputElement).value;
                  const lastName = (document.getElementById('edit-lastName') as HTMLInputElement).value;
                  const roleId = (document.getElementById('edit-roleId') as HTMLSelectElement).value;
                  const status = (document.getElementById('edit-status') as HTMLSelectElement).value as 'active' | 'inactive' | 'suspended';
                  updateUser.mutate({ id: editUser.id as string, firstName, lastName, roleId, status });
                }}
              >
                {updateUser.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </SlideOverPanel>
      )}

      {/* Create User */}
      <SlideOverPanel open={createOpen} onClose={() => setCreateOpen(false)} title="Invite User" width="md">
        <div className="p-6">
          <form onSubmit={form.handleSubmit((data) => createUser.mutate(data))} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>First Name</Label>
                <Input {...form.register('firstName')} placeholder="Jane" />
                {form.formState.errors.firstName && (
                  <p className="text-xs text-red-500">{form.formState.errors.firstName.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Last Name</Label>
                <Input {...form.register('lastName')} placeholder="Doe" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" {...form.register('email')} placeholder="jane@seccomply.net" />
              {form.formState.errors.email && (
                <p className="text-xs text-red-500">{form.formState.errors.email.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <select
                {...form.register('roleId')}
                value={form.watch('roleId')}
                onChange={(e) => form.setValue('roleId', e.target.value)}
                className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Temporary Password</Label>
              <Input type="text" {...form.register('password')} placeholder="Minimum 8 characters" />
              {form.formState.errors.password && (
                <p className="text-xs text-red-500">{form.formState.errors.password.message}</p>
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={createUser.isPending}>
                {createUser.isPending ? 'Creating...' : 'Create User'}
              </Button>
            </div>
          </form>
        </div>
      </SlideOverPanel>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteUserId}
        onOpenChange={(open) => { if (!open) { setDeleteUserId(''); setDeleteUserName(''); } }}
        title={`Remove ${deleteUserName}?`}
        description="This will deactivate the account. The user will no longer be able to log in. Their data and history will be preserved."
        confirmLabel="Remove User"
        destructive
        loading={deleteUser.isPending}
        onConfirm={() => deleteUser.mutate({ id: deleteUserId })}
      />

      {/* Reset Password panel */}
      {resetUser && (
        <SlideOverPanel open={!!resetUser} onClose={() => { setResetUser(null); setNewPassword(''); }} title="Reset Password" width="md">
          <div className="p-6 space-y-5">
            <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
              <Avatar className="w-10 h-10">
                <AvatarFallback className="bg-amber-100 text-amber-700">
                  {getInitials(resetUser.firstName as string, resetUser.lastName as string)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-semibold text-slate-900">{resetUser.firstName as string} {resetUser.lastName as string}</p>
                <p className="text-xs text-slate-500 font-mono">{resetUser.email as string}</p>
              </div>
            </div>

            <div className="rounded-lg bg-amber-50 border border-amber-100 px-4 py-3">
              <p className="text-xs text-amber-700 font-medium">You are setting a new password for this user. Share it with them securely — they will be able to log in immediately.</p>
            </div>

            <div className="space-y-1.5">
              <Label>New Password</Label>
              <div className="relative">
                <Input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {newPassword.length > 0 && newPassword.length < 8 && (
                <p className="text-xs text-red-500">Password must be at least 8 characters</p>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => { setResetUser(null); setNewPassword(''); }}>Cancel</Button>
              <Button
                className="flex-1"
                disabled={newPassword.length < 8 || resetPassword.isPending}
                onClick={() => resetPassword.mutate({ id: resetUser.id as string, newPassword })}
              >
                {resetPassword.isPending ? 'Resetting...' : 'Reset Password'}
              </Button>
            </div>
          </div>
        </SlideOverPanel>
      )}
    </div>
  );
}

// ─── Role Permission Editor ────────────────────────────────────────────────────
function RolePermissionEditor({ role }: { role: Record<string, unknown> }) {
  const utils = trpc.useUtils();
  const [expanded, setExpanded] = useState(false);
  const [perms, setPerms] = useState<RolePermissions>((role.permissions as RolePermissions) ?? {});
  const [dirty, setDirty] = useState(false);

  const updateRole = trpc.users.updateRole.useMutation({
    onSuccess: () => {
      toast.success(`${role.name as string} permissions saved`);
      setDirty(false);
      void utils.users.listRoles.invalidate();
    },
    onError: (err) => toast.error('Failed to save permissions', { description: err.message }),
  });

  function setPermValue(section: string, key: string, value: boolean | string) {
    setPerms((prev) => ({
      ...prev,
      [section]: {
        ...(prev[section as keyof RolePermissions] as Record<string, unknown> ?? {}),
        [key]: value,
      },
    }));
    setDirty(true);
  }

  function getPermValue(section: string, key: string): boolean | string {
    const s = perms[section as keyof RolePermissions] as Record<string, unknown> | undefined;
    return (s?.[key] ?? false) as boolean | string;
  }

  const isSystem = role.isSystemRole as boolean;

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-800">{role.name as string}</span>
          {isSystem && <Badge variant="secondary" className="text-xs">System</Badge>}
          {dirty && <Badge variant="default" className="text-xs bg-amber-500">Unsaved changes</Badge>}
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <Button
              size="sm"
              onClick={(e) => { e.stopPropagation(); updateRole.mutate({ id: role.id as string, permissions: perms as Record<string, unknown> }); }}
              disabled={updateRole.isPending}
            >
              <Check className="w-3.5 h-3.5 mr-1" />
              {updateRole.isPending ? 'Saving...' : 'Save'}
            </Button>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 divide-y divide-slate-100">
          {PERMISSION_SECTIONS.map((section) => (
            <div key={section.key} className="px-4 py-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{section.label}</p>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {section.perms.map((perm) => {
                  const val = getPermValue(section.key, perm.key);
                  if (perm.type === 'level') {
                    return (
                      <div key={perm.key} className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-600 w-12">{perm.label}</span>
                        <select
                          value={val as string}
                          onChange={(e) => setPermValue(section.key, perm.key, e.target.value)}
                          className="text-xs border border-slate-200 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="false">None</option>
                          <option value="own">Own</option>
                          <option value="team">Team</option>
                          <option value="all">All</option>
                        </select>
                      </div>
                    );
                  }
                  return (
                    <label key={perm.key} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={val === true}
                        onChange={(e) => setPermValue(section.key, perm.key, e.target.checked)}
                        className="rounded border-slate-300 text-blue-600"
                      />
                      <span className="text-xs text-slate-700">{perm.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

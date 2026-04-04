'use client';

import React, { useState } from 'react';
import { Plus, ChevronLeft, Users } from 'lucide-react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { SlideOverPanel } from '@/components/shared/SlideOverPanel';
import { formatDate, getInitials } from '@/lib/formatters';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const createUserSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  roleId: z.string().uuid(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type CreateUserForm = z.infer<typeof createUserSchema>;

export default function UsersSettingsPage() {
  const utils = trpc.useUtils();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: users = [], isLoading } = trpc.users.list.useQuery();
  const { data: roles = [] } = trpc.users.listRoles.useQuery();

  const createUser = trpc.users.create.useMutation({
    onSuccess: () => {
      toast.success('User created');
      setCreateOpen(false);
      void utils.users.list.invalidate();
    },
    onError: (err) => toast.error('Failed to create user', { description: err.message }),
  });

  const form = useForm<CreateUserForm>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { roleId: '' },
  });

  // Set roleId once roles load (useForm defaultValues only apply on initial render)
  React.useEffect(() => {
    if (roles.length > 0 && !form.getValues('roleId')) {
      form.setValue('roleId', roles[0]!.id);
    }
  }, [roles, form]);

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Link href="/settings" className="text-slate-400 hover:text-slate-600">
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Users & Roles</h1>
            <p className="text-sm text-slate-500">Manage team members and their permissions.</p>
          </div>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4" />
          Invite User
        </Button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
        {isLoading ? (
          <div className="p-5 text-sm text-slate-400">Loading...</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No users yet.</p>
          </div>
        ) : (
          users.map((user) => (
            <div key={user.id} className="flex items-center gap-4 px-5 py-4">
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
            </div>
          ))
        )}
      </div>

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
              <Input type="email" {...form.register('email')} placeholder="jane@company.com" />
              {form.formState.errors.email && (
                <p className="text-xs text-red-500">{form.formState.errors.email.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <select
                {...form.register('roleId')}
                className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Temporary Password</Label>
              <Input type="password" {...form.register('password')} placeholder="Minimum 8 characters" />
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
    </div>
  );
}

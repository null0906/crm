'use client';

import React, { useState } from 'react';
import { Search, LogOut, User, Settings, Command } from 'lucide-react';
import { signOut } from 'next-auth/react';
import { useSession } from 'next-auth/react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { getInitials } from '@/lib/formatters';
import Link from 'next/link';
import { CommandPalette } from './CommandPalette';
import { NotificationBell } from '@/components/notifications/NotificationBell';

export function Topbar() {
  const { data: session } = useSession();
  const [cmdOpen, setCmdOpen] = useState(false);
  const user = session?.user as Record<string, unknown> | undefined;
  const firstName = user?.firstName as string | undefined;
  const lastName = user?.lastName as string | undefined;

  // Keyboard shortcut
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCmdOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  return (
    <>
      <header className="h-14 bg-white border-b border-slate-200 flex items-center px-4 gap-4 sticky top-0 z-30">
        {/* Search trigger */}
        <button
          onClick={() => setCmdOpen(true)}
          className="flex items-center gap-2 h-8 px-3 rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-400 hover:border-blue-300 hover:bg-white transition-colors flex-1 max-w-sm"
        >
          <Search className="w-3.5 h-3.5" />
          <span>Search...</span>
          <kbd className="ml-auto text-xs bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 font-mono flex items-center gap-1">
            <span className="text-xs">⌘</span>K
          </kbd>
        </button>

        <div className="flex items-center gap-2 ml-auto">
          {/* Notifications */}
          <NotificationBell />

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-md hover:bg-slate-100 p-1 transition-colors">
                <Avatar className="w-7 h-7">
                  <AvatarImage src={(user?.image as string) ?? undefined} />
                  <AvatarFallback className="text-xs bg-blue-600 text-white">
                    {getInitials(firstName, lastName)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium text-slate-700 hidden md:block">
                  {firstName}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="font-medium">{firstName} {lastName}</span>
                  <span className="text-xs text-slate-500 font-normal">{user?.email as string}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings/general">
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="text-red-600 focus:text-red-600 focus:bg-red-50"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
    </>
  );
}

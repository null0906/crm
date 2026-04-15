'use client';

import React, { useState } from 'react';
import { Search, LogOut, Settings } from 'lucide-react';
import { signOut } from 'next-auth/react';
import { useSession } from 'next-auth/react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/lib/formatters';
import Link from 'next/link';
import { CommandPalette } from './CommandPalette';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { cn } from '@/lib/utils';

export function Topbar() {
  const { data: session } = useSession();
  const [cmdOpen, setCmdOpen] = useState(false);
  const user = session?.user as Record<string, unknown> | undefined;
  const firstName = user?.firstName as string | undefined;
  const lastName  = user?.lastName  as string | undefined;

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
      <header className="h-14 bg-white border-b border-slate-200 flex items-center px-5 gap-3 sticky top-0 z-30">

        {/* Search trigger — left-aligned, prominent */}
        <button
          onClick={() => setCmdOpen(true)}
          className={cn(
            'flex items-center gap-2 h-8 px-3 rounded-lg flex-1 max-w-[280px]',
            'border border-slate-200 bg-slate-50',
            'text-sm text-slate-400',
            'hover:bg-white hover:border-slate-300 hover:text-slate-500',
            'transition-all duration-150',
            'shadow-[0_1px_2px_rgba(16,24,40,0.04)]',
          )}
        >
          <Search className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2} />
          <span className="flex-1 text-left text-[13px]">Search...</span>
          <kbd className="text-[10px] bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-400 shadow-[0_1px_0_#CDD2DA] leading-none">
            ⌘K
          </kbd>
        </button>

        {/* Right side */}
        <div className="flex items-center gap-1 ml-auto">
          <NotificationBell />

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  'flex items-center gap-2 rounded-lg p-1.5 ml-1',
                  'hover:bg-slate-50 transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1'
                )}
              >
                <Avatar className="w-7 h-7">
                  <AvatarImage src={(user?.image as string) ?? undefined} />
                  <AvatarFallback className="text-[10px] font-semibold bg-blue-100 text-blue-700">
                    {getInitials(firstName, lastName)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium text-slate-700 hidden md:block pr-0.5">
                  {firstName}
                </span>
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="pb-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-slate-900">{firstName} {lastName}</span>
                  <span className="text-xs text-slate-400 font-normal">{user?.email as string}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings" className="gap-2">
                  <Settings className="w-3.5 h-3.5 text-slate-400" strokeWidth={1.75} />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="text-red-600 focus:text-red-600 focus:bg-red-50 gap-2"
              >
                <LogOut className="w-3.5 h-3.5" strokeWidth={1.75} />
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

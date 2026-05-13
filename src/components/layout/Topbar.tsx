'use client';

import React, { useState } from 'react';
import { Search, LogOut, Settings } from 'lucide-react';
import { signOut } from 'next-auth/react';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
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
  const pathname = usePathname();
  const user = session?.user as Record<string, unknown> | undefined;
  const firstName = user?.firstName as string | undefined;
  const lastName  = user?.lastName  as string | undefined;
  const pageTitle = getPageTitle(pathname);

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
      <header className="topbar sticky top-0 z-30 flex h-[52px] items-center gap-3 border-b border-[var(--color-border-ui)] bg-[var(--color-surface)] px-6 shadow-[0_1px_0_var(--color-border-ui),_0_2px_4px_rgba(17,19,24,0.03)]">
        <div className="min-w-[180px] leading-tight">
          <h1 className="topbar-title text-lg font-bold tracking-[-0.02em] text-[var(--color-text-1)]">{pageTitle}</h1>
          <p className="topbar-subtitle mt-px text-[11.5px] font-normal text-[var(--color-text-3)]">{getPageSubtext(pathname)}</p>
        </div>

        <button
          onClick={() => setCmdOpen(true)}
          className={cn(
            'topbar-search mx-auto flex h-8 w-[260px] items-center gap-2 rounded-lg px-3',
            'border border-[var(--color-header-border)] bg-[var(--color-header-start)]',
            'text-base text-[var(--color-text-3)]',
            'hover:bg-[var(--color-surface)] hover:border-[var(--color-border-strong)]',
            'focus-visible:bg-[var(--color-surface)] focus-visible:border-[var(--color-border-focus)] focus-visible:shadow-[0_0_0_3px_rgba(37,99,235,0.10)]',
          )}
        >
          <Search className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.75} />
          <span className="flex-1 text-left">Search...</span>
          <kbd className="leading-none">
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
                  'flex items-center gap-2 rounded-md p-1 ml-1',
                  'hover:bg-[var(--color-surface-alt)]'
                )}
              >
                <Avatar className="w-7 h-7">
                  <AvatarImage src={(user?.image as string) ?? undefined} />
                  <AvatarFallback className="text-xs font-semibold bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                    {getInitials(firstName, lastName)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-base font-medium text-[var(--color-text-1)] hidden md:block pr-0.5">
                  {firstName}
                </span>
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-56 dropdown-panel">
              <DropdownMenuLabel className="pb-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-base font-semibold text-[var(--color-text-1)]">{firstName} {lastName}</span>
                  <span className="text-xs text-[var(--color-text-3)] font-normal">{user?.email as string}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings" className="gap-2">
                  <Settings className="w-3.5 h-3.5 text-[var(--color-text-3)]" strokeWidth={1.75} />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="text-[var(--color-danger)] focus:text-[var(--color-danger)] focus:bg-[var(--color-danger-bg)] gap-2"
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

function getPageTitle(pathname: string): string {
  const segment = pathname.split('/').filter(Boolean)[0] ?? 'dashboard';
  const titles: Record<string, string> = {
    contacts: 'Contacts',
    companies: 'Companies',
    deals: 'Deals',
    partners: 'Partners',
    'ai-chat': 'AI Assistant',
    activities: 'Activities',
    dashboard: 'Dashboard',
    settings: 'Settings',
  };
  return titles[segment] ?? 'SecComply';
}

function getPageSubtext(pathname: string): string {
  const segment = pathname.split('/').filter(Boolean)[0] ?? 'dashboard';
  const subtexts: Record<string, string> = {
    contacts: 'Manage leads and relationships',
    companies: 'Accounts, partners, and customers',
    deals: 'Pipeline and revenue movement',
    partners: 'Partner-sourced opportunities',
    'ai-chat': 'Ask questions across CRM data',
    activities: 'Calls, notes, tasks, and changes',
    dashboard: 'Business performance overview',
    settings: 'Workspace configuration',
  };
  return subtexts[segment] ?? 'Command Center';
}

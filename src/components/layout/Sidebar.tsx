'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Users, Building2, TrendingUp, Activity, LayoutDashboard,
  Settings, ChevronLeft, ChevronRight, Handshake, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useSession } from 'next-auth/react';
import { getInitials } from '@/lib/formatters';
import { useLocalStorage } from '@/hooks/useLocalStorage';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  badge?: number;
}

const mainNav: NavItem[] = [
  { href: '/contacts',   label: 'Contacts',    icon: Users },
  { href: '/companies',  label: 'Companies',   icon: Building2 },
  { href: '/deals',      label: 'Deals',       icon: TrendingUp },
  { href: '/partners',   label: 'Partners',    icon: Handshake },
  { href: '/ai-chat',    label: 'AI Assistant', icon: Sparkles },
  { href: '/activities', label: 'Activities',  icon: Activity },
];

const insightsNav: NavItem[] = [
  { href: '/dashboard',  label: 'Dashboard',   icon: LayoutDashboard },
];

const adminNav: NavItem[] = [
  { href: '/settings',   label: 'Settings',    icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [collapsed, setCollapsed] = useLocalStorage('sidebar-collapsed', false);

  const user = session?.user as Record<string, unknown> | undefined;
  const firstName = user?.firstName as string | undefined;
  const lastName  = user?.lastName  as string | undefined;
  const email     = user?.email     as string | undefined;

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'sidebar flex flex-col h-screen border-r border-[var(--color-border-ui)] bg-linear-to-b from-[var(--color-sidebar-start)] to-[var(--color-sidebar-end)]',
          'transition-all duration-200 flex-shrink-0 sticky top-0',
          collapsed ? 'w-[60px]' : 'w-[220px]'
        )}
      >
        {/* Logo */}
        <div
          className={cn(
            'sidebar-logo-area flex h-14 items-center border-b border-[var(--color-border-ui)] flex-shrink-0',
            collapsed ? 'justify-center px-0' : 'px-4 gap-2.5'
          )}
        >
          <div className="sidebar-logo-icon flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[7px] bg-linear-to-br from-[var(--color-accent)] to-[var(--color-accent-hover)] text-[14px] font-bold text-[var(--color-text-inverse)] shadow-[0_2px_8px_rgba(37,99,235,0.30)]">
            S
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-none">
              <span className="text-[14px] font-bold text-[var(--color-text-1)] tracking-[-0.02em]">SecComply</span>
              <span className="mt-px text-2xs font-normal text-[var(--color-text-3)]">Command Center</span>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 space-y-4">
          <NavSection title=""         items={mainNav}     collapsed={collapsed} pathname={pathname} />
          <NavSection title="Insights" items={insightsNav} collapsed={collapsed} pathname={pathname} />
          <NavSection title="Admin"    items={adminNav}    collapsed={collapsed} pathname={pathname} />
        </nav>

        {/* Collapse toggle */}
        <div className="border-t border-[var(--color-border-ui)] p-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              'w-full flex items-center h-8 rounded-md',
              'text-[var(--color-text-3)] hover:text-[var(--color-accent)] hover:bg-[rgba(37,99,235,0.05)]',
              collapsed ? 'justify-center' : 'justify-end px-2'
            )}
          >
            {collapsed
              ? <ChevronRight className="w-3.5 h-3.5" />
              : <ChevronLeft  className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* User */}
        <div
          className={cn(
            'sidebar-user-section h-[56px] border-t border-[var(--color-border-ui)] bg-[rgba(37,99,235,0.02)] px-3 flex items-center gap-2.5',
            collapsed && 'justify-center'
          )}
        >
          <Avatar className="h-[30px] w-[30px] flex-shrink-0 rounded-lg">
            <AvatarImage src={(user?.image as string) ?? undefined} />
            <AvatarFallback className="rounded-lg bg-linear-to-br from-[var(--color-accent)] to-[var(--color-purple)] text-xs font-bold text-[var(--color-text-inverse)] shadow-[0_2px_6px_rgba(37,99,235,0.25)]">
              {getInitials(firstName, lastName)}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <>
            <div className="flex flex-col min-w-0 leading-none flex-1">
              <span className="text-base font-semibold text-[var(--color-text-1)] truncate">
                {firstName} {lastName}
              </span>
              <span className="text-xs text-[var(--color-text-3)] truncate mt-0.5">{email}</span>
            </div>
            <Link
              href="/settings"
              className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-3)] hover:bg-[rgba(37,99,235,0.06)] hover:text-[var(--color-accent)]"
              aria-label="Settings"
            >
              <Settings className="h-3.5 w-3.5" strokeWidth={1.5} />
            </Link>
            </>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}

function NavSection({
  title,
  items,
  collapsed,
  pathname,
}: {
  title: string;
  items: NavItem[];
  collapsed: boolean;
  pathname: string;
}) {
  return (
    <div>
      {!collapsed && (
        <p className={cn(
          'nav-section-label px-4 pb-1 pt-1 text-[9.5px] font-bold text-[var(--color-nav-section)] uppercase tracking-[0.08em]',
          !title && 'sr-only'
        )}>
          {title}
        </p>
      )}
      <ul className="space-y-0.5">
        {items.map((item) => (
          <NavItemComponent
            key={item.href}
            item={item}
            collapsed={collapsed}
            isActive={pathname === item.href || pathname.startsWith(item.href + '/')}
          />
        ))}
      </ul>
    </div>
  );
}

function NavItemComponent({
  item,
  collapsed,
  isActive,
}: {
  item: NavItem;
  collapsed: boolean;
  isActive: boolean;
}) {
  const Icon = item.icon;

  const linkContent = (
    <Link
      href={item.href}
      className={cn(
        'nav-item group relative mx-2 my-px flex h-[34px] items-center gap-[9px] rounded-[7px] px-2.5',
        'text-base transition-all duration-150 ease-[var(--ease-spring)]',
        isActive
          ? 'active bg-linear-to-br from-[rgba(37,99,235,0.10)] to-[rgba(37,99,235,0.06)] text-[var(--color-accent-hover)] font-semibold shadow-[inset_0_0_0_1px_rgba(37,99,235,0.15)] after:absolute after:right-2.5 after:h-[5px] after:w-[5px] after:rounded-full after:bg-[var(--color-accent)] after:shadow-[0_0_6px_rgba(37,99,235,0.5)]'
          : 'text-[var(--color-text-2)] font-normal hover:bg-[rgba(37,99,235,0.05)] hover:text-[var(--color-accent-deep)]',
        collapsed && 'justify-center px-2'
      )}
    >
      <Icon
        className={cn(
          'flex-shrink-0',
          isActive ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-3)] group-hover:text-[var(--color-accent)]',
          collapsed ? 'w-4 h-4' : 'w-4 h-4'
        )}
        strokeWidth={1.75}
      />

      {!collapsed && (
        <span className="flex-1 truncate">{item.label}</span>
      )}

      {!collapsed && item.badge !== undefined && item.badge > 0 && (
        <span className="ml-auto text-2xs bg-[var(--color-accent)] text-[var(--color-text-inverse)] rounded-full px-1.5 py-px font-semibold font-mono leading-none">
          {item.badge}
        </span>
      )}
    </Link>
  );

  if (collapsed) {
    return (
      <li>
        <Tooltip>
          <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
          <TooltipContent side="right" className="text-xs">
            {item.label}
          </TooltipContent>
        </Tooltip>
      </li>
    );
  }

  return <li>{linkContent}</li>;
}

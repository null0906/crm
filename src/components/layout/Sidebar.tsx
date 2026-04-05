'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Users, Building2, TrendingUp, Activity, LayoutDashboard,
  Settings, ChevronLeft, ChevronRight, Shield,
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
          'flex flex-col h-screen bg-white border-r border-slate-200',
          'transition-all duration-200 flex-shrink-0 sticky top-0',
          collapsed ? 'w-[60px]' : 'w-[240px]'
        )}
      >
        {/* Logo */}
        <div
          className={cn(
            'flex items-center h-14 border-b border-slate-100 flex-shrink-0',
            collapsed ? 'justify-center px-0' : 'px-4 gap-2.5'
          )}
        >
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-500 flex-shrink-0 shadow-[0_1px_3px_rgba(67,97,238,0.3)]">
            <Shield className="w-4 h-4 text-white" strokeWidth={1.75} />
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-none">
              <span className="text-sm font-semibold text-slate-900 tracking-tight">SecComply</span>
              <span className="text-[10px] text-slate-400 font-medium tracking-wide mt-0.5">Command Center</span>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-5">
          <NavSection title="Main"     items={mainNav}     collapsed={collapsed} pathname={pathname} />
          <NavSection title="Insights" items={insightsNav} collapsed={collapsed} pathname={pathname} />
          <NavSection title="Admin"    items={adminNav}    collapsed={collapsed} pathname={pathname} />
        </nav>

        {/* Collapse toggle */}
        <div className="border-t border-slate-100 p-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              'w-full flex items-center h-8 rounded-lg',
              'text-slate-400 hover:text-slate-600 hover:bg-slate-50',
              'transition-colors duration-150',
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
            'border-t border-slate-100 p-3 flex items-center gap-2.5',
            collapsed && 'justify-center'
          )}
        >
          <Avatar className="w-7 h-7 flex-shrink-0">
            <AvatarImage src={(user?.image as string) ?? undefined} />
            <AvatarFallback className="text-[10px] font-semibold bg-blue-100 text-blue-700">
              {getInitials(firstName, lastName)}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex flex-col min-w-0 leading-none">
              <span className="text-xs font-semibold text-slate-800 truncate">
                {firstName} {lastName}
              </span>
              <span className="text-[10px] text-slate-400 truncate mt-0.5">{email}</span>
            </div>
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
        <p className="px-2 mb-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-[0.06em]">
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
        'relative flex items-center gap-2.5 rounded-lg px-2 py-2',
        'text-sm font-medium transition-colors duration-100',
        isActive
          ? 'bg-blue-50 text-blue-600'
          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
        collapsed && 'justify-center px-2'
      )}
    >
      {/* Active indicator bar */}
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-500 rounded-r-full" />
      )}

      <Icon
        className={cn(
          'flex-shrink-0',
          isActive ? 'text-blue-500' : 'text-slate-400',
          collapsed ? 'w-5 h-5' : 'w-4 h-4'
        )}
        strokeWidth={1.75}
      />

      {!collapsed && (
        <span className="flex-1 truncate">{item.label}</span>
      )}

      {!collapsed && item.badge !== undefined && item.badge > 0 && (
        <span className="ml-auto text-[10px] bg-blue-500 text-white rounded-full px-1.5 py-px font-semibold font-mono leading-none">
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

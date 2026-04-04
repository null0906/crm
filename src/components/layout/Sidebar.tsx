'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Users, Building2, TrendingUp, Activity, LayoutDashboard,
  Settings, ChevronLeft, ChevronRight, Tag, BarChart2,
  Home, Shield
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
  { href: '/contacts', label: 'Contacts', icon: Users },
  { href: '/companies', label: 'Companies', icon: Building2 },
  { href: '/deals', label: 'Deals', icon: TrendingUp },
  { href: '/activities', label: 'Activities', icon: Activity },
];

const insightsNav: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
];

const settingsNav: NavItem[] = [
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [collapsed, setCollapsed] = useLocalStorage('sidebar-collapsed', false);

  const user = session?.user as Record<string, unknown> | undefined;
  const firstName = user?.firstName as string | undefined;
  const lastName = user?.lastName as string | undefined;
  const email = user?.email as string | undefined;

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'flex flex-col h-screen bg-slate-900 text-slate-300 transition-all duration-200 flex-shrink-0 sticky top-0',
          collapsed ? 'w-16' : 'w-60'
        )}
      >
        {/* Logo */}
        <div className={cn(
          'flex items-center h-14 border-b border-slate-800 px-3',
          collapsed ? 'justify-center' : 'px-4'
        )}>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500 flex-shrink-0">
              <Shield className="w-4 h-4 text-white" />
            </div>
            {!collapsed && (
              <div className="flex flex-col">
                <span className="text-sm font-bold text-white leading-none">SecComply</span>
                <span className="text-xs text-slate-400 leading-none mt-0.5">Command Center</span>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-6">
          <NavSection title="Main" items={mainNav} collapsed={collapsed} pathname={pathname} />
          <NavSection title="Insights" items={insightsNav} collapsed={collapsed} pathname={pathname} />
          <NavSection title="Admin" items={settingsNav} collapsed={collapsed} pathname={pathname} />
        </nav>

        {/* Collapse toggle */}
        <div className="border-t border-slate-800 p-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center h-8 rounded-md hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* User */}
        <div className={cn(
          'border-t border-slate-800 p-3 flex items-center gap-3',
          collapsed && 'justify-center'
        )}>
          <Avatar className="w-8 h-8 flex-shrink-0">
            <AvatarImage src={(user?.image as string) ?? undefined} />
            <AvatarFallback className="text-xs bg-blue-600">
              {getInitials(firstName, lastName)}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium text-white truncate">
                {firstName} {lastName}
              </span>
              <span className="text-xs text-slate-400 truncate">{email}</span>
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
        <p className="px-2 mb-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
          {title}
        </p>
      )}
      <ul className="space-y-0.5">
        {items.map((item) => (
          <NavItem key={item.href} item={item} collapsed={collapsed} isActive={pathname.startsWith(item.href)} />
        ))}
      </ul>
    </div>
  );
}

function NavItem({
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
        'flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition-colors relative',
        isActive
          ? 'bg-slate-800 text-white'
          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200',
        collapsed && 'justify-center px-2'
      )}
    >
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-blue-500 rounded-r" />
      )}
      <Icon className="w-4 h-4 flex-shrink-0" />
      {!collapsed && <span>{item.label}</span>}
      {!collapsed && item.badge !== undefined && item.badge > 0 && (
        <span className="ml-auto text-xs bg-blue-500 text-white rounded-full px-1.5 py-0.5 font-mono">
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
          <TooltipContent side="right">{item.label}</TooltipContent>
        </Tooltip>
      </li>
    );
  }

  return <li>{linkContent}</li>;
}

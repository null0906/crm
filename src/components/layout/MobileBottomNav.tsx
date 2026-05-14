'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Building2, FolderKanban, Sparkles, TrendingUp, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

const mobileNav = [
  { href: '/contacts', label: 'Leads', icon: Users },
  { href: '/companies', label: 'Companies', icon: Building2 },
  { href: '/deals', label: 'Deals', icon: TrendingUp },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/ai-chat', label: 'AI', icon: Sparkles },
  { href: '/activities', label: 'Activity', icon: Activity },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border-subtle)] bg-[rgba(255,255,255,0.94)] px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 shadow-[0_-8px_24px_rgba(15,20,40,0.08)] backdrop-blur md:hidden">
      <div className="flex items-center justify-between gap-1 overflow-x-auto">
        {mobileNav.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex min-w-[56px] flex-1 flex-col items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold transition-colors',
                active
                  ? 'bg-[var(--accent-light)] text-[var(--accent)]'
                  : 'text-[var(--text-tertiary)] hover:bg-[var(--surface-input)] hover:text-[var(--text-secondary)]'
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={1.8} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

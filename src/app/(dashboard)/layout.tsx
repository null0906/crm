import { getActiveSessionUser } from '@/server/lib/auth';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { FloatingChatWidget } from '@/components/ai-chat/FloatingChatWidget';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getActiveSessionUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--surface-page)]">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto bg-[var(--surface-page)] pb-20 md:pb-0">
          {children}
        </main>
      </div>
      <FloatingChatWidget />
      <MobileBottomNav />
    </div>
  );
}

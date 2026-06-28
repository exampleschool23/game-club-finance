'use client';

import { useEffect, useState, createContext, useContext } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Gamepad2, Menu } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { DashboardContentLoading } from './DashboardContentLoading';
import { createClient } from '@/lib/supabase/client';
import type { UserRole } from '@/types';
import { todayIso } from '@/lib/utils';

interface DashboardShellProps {
  initialEmail?: string;
  children: React.ReactNode;
}

// Context so child pages can access the selected date
interface DateContextValue {
  selectedDate: string;
  setSelectedDate: (date: string) => void;
}

export const DateContext = createContext<DateContextValue>({
  selectedDate: todayIso(),
  setSelectedDate: () => {},
});

export function useDashboardDate() {
  return useContext(DateContext);
}

function isUserRole(role: string | null | undefined): role is UserRole {
  return role === 'owner' || role === 'admin' || role === 'viewer';
}

export function DashboardShell({ initialEmail = '', children }: DashboardShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [role, setRole] = useState<UserRole>('viewer');
  const [fullName, setFullName] = useState(initialEmail);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) {
        router.replace('/login');
        return;
      }

      const { data } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', session.user.id)
        .maybeSingle();

      if (cancelled) return;
      setFullName(data?.full_name ?? session.user.email ?? initialEmail);
      setRole(isUserRole(data?.role) ? data.role : 'viewer');
    }

    loadProfile().catch(() => {
      if (!cancelled) {
        setFullName(initialEmail);
        setRole('viewer');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [initialEmail, router]);

  useEffect(() => {
    if (pendingPath === pathname) {
      setPendingPath(null);
    }
  }, [pathname, pendingPath]);

  useEffect(() => {
    if (!pendingPath) return;
    const timeout = window.setTimeout(() => setPendingPath(null), 10000);
    return () => window.clearTimeout(timeout);
  }, [pendingPath]);

  function handleNavigate(href: string) {
    setSidebarOpen(false);
    if (href !== pathname) {
      setPendingPath(href);
    }
  }

  return (
    <DateContext.Provider value={{ selectedDate, setSelectedDate }}>
      <div className="min-h-screen overflow-x-hidden" style={{ backgroundColor: '#f1f5f9' }}>
        <Sidebar
          role={role}
          fullName={fullName}
          mobileOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onNavigate={handleNavigate}
        />

        <div className="flex min-w-0 flex-1 flex-col xl:pl-64">
          <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-gray-200 bg-white/95 px-4 shadow-sm backdrop-blur xl:hidden">
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 shadow-sm"
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary-600 text-white">
                <Gamepad2 size={20} />
              </div>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-extrabold text-gray-950">Game Club</p>
                <p className="truncate text-xs font-bold text-primary-700">Finance</p>
              </div>
            </div>
          </div>

          <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
            <div className="mx-auto w-full max-w-[1680px] px-3 pb-5 pt-16 sm:px-5 md:px-6 xl:px-8 xl:py-6 2xl:px-10">
              {pendingPath ? <DashboardContentLoading /> : children}
            </div>
          </main>
        </div>
      </div>
    </DateContext.Provider>
  );
}

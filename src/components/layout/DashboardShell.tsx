'use client';

import { useState, createContext, useContext } from 'react';
import { Menu } from 'lucide-react';
import { Sidebar } from './Sidebar';
import type { UserRole } from '@/types';
import { todayIso } from '@/lib/utils';

interface DashboardShellProps {
  role: UserRole;
  fullName: string;
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

export function DashboardShell({ role, fullName, children }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayIso);

  return (
    <DateContext.Provider value={{ selectedDate, setSelectedDate }}>
      <div className="flex min-h-screen" style={{ backgroundColor: '#f1f5f9' }}>
        <Sidebar
          role={role}
          fullName={fullName}
          mobileOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <div className="flex-1 flex flex-col min-w-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="fixed left-4 top-4 z-30 flex h-10 w-10 items-center justify-center rounded-lg bg-white text-gray-700 shadow-sm border border-gray-100 lg:hidden"
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>

          <main className="flex-1 p-4 sm:p-6 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </DateContext.Provider>
  );
}

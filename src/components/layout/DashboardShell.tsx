'use client';

import { useState, createContext, useContext } from 'react';
import { Menu, Bell, ChevronLeft, ChevronRight } from 'lucide-react';
import { Sidebar } from './Sidebar';
import type { UserRole } from '@/types';
import { todayIso } from '@/lib/utils';

interface DashboardShellProps {
  role: UserRole;
  fullName: string;
  children: React.ReactNode;
  pageTitle?: string;
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

function formatHeaderDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

function offsetDate(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export function DashboardShell({ role, fullName, children, pageTitle = 'Dashboard' }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayIso);

  const initials = fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

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
          {/* Top header bar */}
          <header className="bg-white border-b border-gray-200 sticky top-0 z-30 px-4 sm:px-6">
            <div className="flex items-center justify-between h-14">
              {/* Left: hamburger (mobile) + page title */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 lg:hidden"
                >
                  <Menu size={20} />
                </button>
                <h1 className="font-semibold text-gray-900 text-base">{pageTitle}</h1>
              </div>

              {/* Center: date navigator */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedDate(offsetDate(selectedDate, -1))}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm font-medium text-gray-700 min-w-[140px] text-center">
                  {formatHeaderDate(selectedDate)}
                </span>
                <button
                  onClick={() => setSelectedDate(offsetDate(selectedDate, 1))}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
                  disabled={selectedDate >= todayIso()}
                >
                  <ChevronRight size={16} className={selectedDate >= todayIso() ? 'opacity-30' : ''} />
                </button>
              </div>

              {/* Right: notifications + user */}
              <div className="flex items-center gap-3">
                <button className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 relative">
                  <Bell size={18} />
                </button>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center
                                  text-white text-xs font-bold">
                    {initials}
                  </div>
                  <span className="hidden sm:block text-sm font-medium text-gray-700">{fullName}</span>
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 p-4 sm:p-6 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </DateContext.Provider>
  );
}

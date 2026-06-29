'use client';

import { useCallback, useEffect, useMemo, useState, createContext, useContext } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Clock3, Gamepad2, LogOut, Menu, ShieldCheck } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { DashboardContentLoading } from './DashboardContentLoading';
import { createClient } from '@/lib/supabase/client';
import type { Club, ClubMembership, UserRole } from '@/types';
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

interface ClubOption {
  club: Club;
  role: UserRole;
}

interface ClubContextValue {
  selectedClubId: string;
  selectedClub: Club | null;
  memberships: ClubOption[];
  role: UserRole;
  loading: boolean;
  setSelectedClubId: (clubId: string) => void;
  refreshClubs: () => Promise<void>;
}

export const DateContext = createContext<DateContextValue>({
  selectedDate: todayIso(),
  setSelectedDate: () => {},
});

export const ClubContext = createContext<ClubContextValue>({
  selectedClubId: '',
  selectedClub: null,
  memberships: [],
  role: 'viewer',
  loading: true,
  setSelectedClubId: () => {},
  refreshClubs: async () => {},
});

export function useDashboardDate() {
  return useContext(DateContext);
}

export function useClub() {
  return useContext(ClubContext);
}

function isUserRole(role: string | null | undefined): role is UserRole {
  return role === 'owner' || role === 'admin' || role === 'viewer';
}

function relatedClub(relation: ClubMembership['clubs']): Club | null {
  if (!relation) return null;
  return Array.isArray(relation) ? relation[0] ?? null : relation;
}

const SELECTED_CLUB_STORAGE_KEY = 'game-club-finance:selected-club-id';

function PendingApproval({ fullName }: { fullName: string }) {
  const router = useRouter();
  const t = useTranslations('approval');

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-xl items-center justify-center">
      <div className="w-full rounded-xl border border-amber-100 bg-white p-6 text-center shadow-sm sm:p-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
          <Clock3 size={28} />
        </div>
        <h1 className="mt-5 text-2xl font-bold text-gray-950">{t('title')}</h1>
        <p className="mt-3 text-sm leading-6 text-gray-600">
          {t('description', { name: fullName || t('fallbackName') })}
        </p>
        <div className="mt-5 flex items-center justify-center gap-2 rounded-lg border border-primary-100 bg-primary-50 px-4 py-3 text-sm font-semibold text-primary-800">
          <ShieldCheck size={17} />
          {t('ownerOnly')}
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
        >
          <LogOut size={16} />
          {t('signOut')}
        </button>
      </div>
    </div>
  );
}

export function DashboardShell({ initialEmail = '', children }: DashboardShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [profileRole, setProfileRole] = useState<UserRole>('viewer');
  const [fullName, setFullName] = useState(initialEmail);
  const [memberships, setMemberships] = useState<ClubOption[]>([]);
  const [selectedClubId, setSelectedClubIdState] = useState('');
  const [clubLoading, setClubLoading] = useState(true);

  const selectedMembership = useMemo(
    () => memberships.find((membership) => membership.club.id === selectedClubId) ?? null,
    [memberships, selectedClubId],
  );
  const role = selectedMembership?.role ?? profileRole;
  const selectedClub = selectedMembership?.club ?? null;

  const setSelectedClubId = useCallback((clubId: string) => {
    setSelectedClubIdState(clubId);
    window.localStorage.setItem(SELECTED_CLUB_STORAGE_KEY, clubId);
  }, []);

  const refreshClubs = useCallback(async () => {
    const supabase = createClient();
    setClubLoading(true);
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      router.replace('/login');
      return;
    }

    const [profileRes, membershipRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', session.user.id)
        .maybeSingle(),
      supabase
        .from('club_memberships')
        .select('club_id, role, created_at, updated_at, clubs(id, name, address, is_active, created_at, updated_at)')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: true }),
    ]);

    setFullName(profileRes.data?.full_name ?? session.user.email ?? initialEmail);
    setProfileRole(isUserRole(profileRes.data?.role) ? profileRes.data.role : 'viewer');

    const nextMemberships = ((membershipRes.data as ClubMembership[] | null) ?? [])
      .map((membership) => ({
        club: relatedClub(membership.clubs),
        role: isUserRole(membership.role) ? membership.role : 'viewer',
      }))
      .filter((membership): membership is ClubOption => Boolean(membership.club?.is_active))
      .sort((a, b) => a.club.name.localeCompare(b.club.name));

    setMemberships(nextMemberships);
    setSelectedClubIdState((currentClubId) => {
      const storedClubId = window.localStorage.getItem(SELECTED_CLUB_STORAGE_KEY) ?? '';
      const preferredClubId = currentClubId || storedClubId;
      const nextClubId =
        nextMemberships.find((membership) => membership.club.id === preferredClubId)?.club.id ??
        nextMemberships[0]?.club.id ??
        '';

      if (nextClubId) {
        window.localStorage.setItem(SELECTED_CLUB_STORAGE_KEY, nextClubId);
      } else {
        window.localStorage.removeItem(SELECTED_CLUB_STORAGE_KEY);
      }

      return nextClubId;
    });
    setClubLoading(false);
  }, [initialEmail, router]);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      await refreshClubs();
      if (cancelled) return;
    }

    loadProfile().catch(() => {
      if (!cancelled) {
        setFullName(initialEmail);
        setProfileRole('viewer');
        setMemberships([]);
        setSelectedClubIdState('');
        setClubLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [initialEmail, refreshClubs]);

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

  const clubContextValue = useMemo(
    () => ({
      selectedClubId,
      selectedClub,
      memberships,
      role,
      loading: clubLoading,
      setSelectedClubId,
      refreshClubs,
    }),
    [clubLoading, memberships, refreshClubs, role, selectedClub, selectedClubId, setSelectedClubId],
  );

  return (
    <DateContext.Provider value={{ selectedDate, setSelectedDate }}>
      <ClubContext.Provider value={clubContextValue}>
      <div className="min-h-screen overflow-x-hidden" style={{ backgroundColor: '#f1f5f9' }}>
        <Sidebar
          role={role}
          fullName={fullName}
          memberships={memberships}
          selectedClubId={selectedClubId}
          onSelectClub={setSelectedClubId}
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
                <p className="truncate text-sm font-extrabold text-gray-950">{selectedClub?.name ?? 'Game Club'}</p>
                <p className="truncate text-xs font-bold text-primary-700">Finance</p>
              </div>
            </div>
          </div>

          <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
            <div className="mx-auto w-full max-w-[1680px] px-3 pb-5 pt-16 sm:px-5 md:px-6 xl:px-8 xl:py-6 2xl:px-10">
              {clubLoading ? (
                <DashboardContentLoading />
              ) : memberships.length === 0 ? (
                <PendingApproval fullName={fullName} />
              ) : pendingPath ? (
                <DashboardContentLoading />
              ) : (
                children
              )}
            </div>
          </main>
        </div>
      </div>
      </ClubContext.Provider>
    </DateContext.Provider>
  );
}

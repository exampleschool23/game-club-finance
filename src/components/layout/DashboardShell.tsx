'use client';

// Dashboard layout shell and shared club/date context.

import { useCallback, useEffect, useMemo, useState, createContext, useContext } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Clock3, Gamepad2, LogOut, Menu, ShieldCheck } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { DashboardContentLoading } from './DashboardContentLoading';
import { createClient } from '@/lib/supabase/client';
import { isMissingDatabaseColumn } from '@/lib/supabase/errors';
import { normalizePaymentMethods } from '@/lib/paymentMethods';
import { PAYMENT_METHODS, type Club, type ClubMembership, type EntryPaymentMethod, type UserRole } from '@/types';
import {
  canAccessPath,
  defaultPathForAccess,
  featureAccessForMembership,
  type FeatureKey,
} from '@/lib/permissions';
import { normalizeBusinessDayStartHour, todayIso } from '@/lib/utils';

interface DashboardShellProps {
  initialEmail?: string;
  initialFullName?: string;
  initialProfileRole?: UserRole;
  initialMembershipRows?: ClubMembership[];
  initialSelectedClubId?: string;
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
  featureAccess: FeatureKey[] | null;
}

interface ClubContextValue {
  selectedClubId: string;
  selectedClub: Club | null;
  memberships: ClubOption[];
  role: UserRole;
  featureAccess: FeatureKey[];
  businessDayStartHour: number;
  enabledPaymentMethods: EntryPaymentMethod[];
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
  featureAccess: [],
  businessDayStartHour: 0,
  enabledPaymentMethods: [...PAYMENT_METHODS],
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
const SELECTED_CLUB_COOKIE = 'game-club-finance-selected-club-id';

function persistSelectedClubId(clubId: string) {
  if (clubId) {
    window.localStorage.setItem(SELECTED_CLUB_STORAGE_KEY, clubId);
    document.cookie = `${SELECTED_CLUB_COOKIE}=${encodeURIComponent(clubId)}; path=/; max-age=31536000; samesite=lax`;
  } else {
    window.localStorage.removeItem(SELECTED_CLUB_STORAGE_KEY);
    document.cookie = `${SELECTED_CLUB_COOKIE}=; path=/; max-age=0; samesite=lax`;
  }
}

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

function membershipOptions(rows: ClubMembership[]): ClubOption[] {
  return rows
    .map((membership) => ({
      club: relatedClub(membership.clubs),
      role: isUserRole(membership.role) ? membership.role : 'viewer',
      featureAccess: Array.isArray(membership.feature_access)
        ? membership.feature_access as FeatureKey[]
        : null,
    }))
    .filter((membership): membership is ClubOption => Boolean(membership.club?.is_active))
    .sort((a, b) => a.club.name.localeCompare(b.club.name));
}

export function DashboardShell({
  initialEmail = '',
  initialFullName = '',
  initialProfileRole = 'viewer',
  initialMembershipRows = [],
  initialSelectedClubId = '',
  children,
}: DashboardShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const tc = useTranslations('common');
  const initialMemberships = useMemo(() => membershipOptions(initialMembershipRows), [initialMembershipRows]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [profileRole, setProfileRole] = useState<UserRole>(initialProfileRole);
  const [fullName, setFullName] = useState(initialFullName || initialEmail);
  const [memberships, setMemberships] = useState<ClubOption[]>(initialMemberships);
  const [selectedClubId, setSelectedClubIdState] = useState(() =>
    initialMemberships.some((membership) => membership.club.id === initialSelectedClubId)
      ? initialSelectedClubId
      : initialMemberships[0]?.club.id ?? '',
  );
  const [clubLoading, setClubLoading] = useState(false);
  const [navigatingTo, setNavigatingTo] = useState('');

  const selectedMembership = useMemo(
    () => memberships.find((membership) => membership.club.id === selectedClubId) ?? null,
    [memberships, selectedClubId],
  );
  const role = selectedMembership?.role ?? profileRole;
  const featureAccess = useMemo(
    () => featureAccessForMembership(role, selectedMembership?.featureAccess),
    [role, selectedMembership?.featureAccess],
  );
  const selectedClub = selectedMembership?.club ?? null;
  const businessDayStartHour = normalizeBusinessDayStartHour(selectedClub?.business_day_start_hour);
  const enabledPaymentMethods = useMemo(
    () => normalizePaymentMethods(selectedClub?.enabled_payment_methods),
    [selectedClub?.enabled_payment_methods],
  );

  const setSelectedClubId = useCallback((clubId: string) => {
    setSelectedClubIdState(clubId);
    persistSelectedClubId(clubId);
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
        .select('club_id, role, feature_access, created_at, updated_at, clubs(id, name, address, business_day_start_hour, enabled_payment_methods, is_active, created_at, updated_at)')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: true }),
    ]);

    setFullName(profileRes.data?.full_name ?? session.user.email ?? initialEmail);
    setProfileRole(isUserRole(profileRes.data?.role) ? profileRes.data.role : 'viewer');

    let membershipRows = (membershipRes.data as ClubMembership[] | null) ?? [];
    if (isMissingDatabaseColumn(membershipRes.error, 'enabled_payment_methods')) {
      const withoutPaymentMethodsRes = await supabase
        .from('club_memberships')
        .select('club_id, role, feature_access, created_at, updated_at, clubs(id, name, address, business_day_start_hour, is_active, created_at, updated_at)')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: true });
      membershipRows = (withoutPaymentMethodsRes.data as ClubMembership[] | null) ?? [];

      if (isMissingDatabaseColumn(withoutPaymentMethodsRes.error, 'feature_access')) {
        const legacyMembershipRes = await supabase
          .from('club_memberships')
          .select('club_id, role, created_at, updated_at, clubs(id, name, address, business_day_start_hour, is_active, created_at, updated_at)')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: true });
        membershipRows = (legacyMembershipRes.data as ClubMembership[] | null) ?? [];
      }
    } else if (isMissingDatabaseColumn(membershipRes.error, 'feature_access')) {
      const withoutFeatureAccessRes = await supabase
        .from('club_memberships')
        .select('club_id, role, created_at, updated_at, clubs(id, name, address, business_day_start_hour, enabled_payment_methods, is_active, created_at, updated_at)')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: true });
      membershipRows = (withoutFeatureAccessRes.data as ClubMembership[] | null) ?? [];

      if (isMissingDatabaseColumn(withoutFeatureAccessRes.error, 'enabled_payment_methods')) {
        const legacyMembershipRes = await supabase
          .from('club_memberships')
          .select('club_id, role, created_at, updated_at, clubs(id, name, address, business_day_start_hour, is_active, created_at, updated_at)')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: true });
        membershipRows = (legacyMembershipRes.data as ClubMembership[] | null) ?? [];
      }
    }

    const nextMemberships = membershipOptions(membershipRows);

    setMemberships(nextMemberships);
    setSelectedClubIdState((currentClubId) => {
      const storedClubId = window.localStorage.getItem(SELECTED_CLUB_STORAGE_KEY) ?? '';
      const preferredClubId = currentClubId || storedClubId;
      const nextClubId =
        nextMemberships.find((membership) => membership.club.id === preferredClubId)?.club.id ??
        nextMemberships[0]?.club.id ??
        '';

      persistSelectedClubId(nextClubId);

      return nextClubId;
    });
    setClubLoading(false);
  }, [initialEmail, router]);

  useEffect(() => {
    const nextClubId = selectedClubId || initialMemberships[0]?.club.id || '';

    if (nextClubId) {
      setSelectedClubIdState(nextClubId);
      persistSelectedClubId(nextClubId);
    }
  }, [initialMemberships, selectedClubId]);

  useEffect(() => {
    if (initialMembershipRows.length > 0) return;

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
  }, [initialEmail, initialMembershipRows.length, refreshClubs]);

  useEffect(() => {
    if (selectedClubId) {
      setSelectedDate(todayIso(new Date(), businessDayStartHour));
    }
  }, [businessDayStartHour, selectedClubId]);

  useEffect(() => {
    setNavigatingTo('');
  }, [pathname]);

  function handleNavigate(href: string) {
    if (href !== pathname) setNavigatingTo(href);
    setSidebarOpen(false);
  }

  const navigationPending = Boolean(navigatingTo && navigatingTo !== pathname);
  const pathAllowed = canAccessPath(role, selectedMembership?.featureAccess, pathname);
  const fallbackPath = pathAllowed ? null : defaultPathForAccess(role, selectedMembership?.featureAccess);

  useEffect(() => {
    if (memberships.length === 0 || pathAllowed || !fallbackPath || fallbackPath === pathname) return;
    setNavigatingTo(fallbackPath);
    router.replace(fallbackPath);
  }, [fallbackPath, memberships.length, pathAllowed, pathname, router]);

  const clubContextValue = useMemo(
    () => ({
      selectedClubId,
      selectedClub,
      memberships,
      role,
      featureAccess,
      businessDayStartHour,
      enabledPaymentMethods,
      loading: clubLoading,
      setSelectedClubId,
      refreshClubs,
    }),
    [businessDayStartHour, clubLoading, enabledPaymentMethods, featureAccess, memberships, refreshClubs, role, selectedClub, selectedClubId, setSelectedClubId],
  );

  return (
    <DateContext.Provider value={{ selectedDate, setSelectedDate }}>
      <ClubContext.Provider value={clubContextValue}>
      <div className="min-h-screen overflow-x-hidden" style={{ backgroundColor: '#f1f5f9' }}>
        {navigationPending && (
          <div
            className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-1 overflow-hidden bg-primary-100"
            role="status"
            aria-label={tc('loading')}
          >
            <div className="h-full w-full origin-left animate-pulse bg-primary-600" />
          </div>
        )}
        <Sidebar
          role={role}
          fullName={fullName}
          memberships={memberships}
          selectedClubId={selectedClubId}
          activePathname={navigatingTo || pathname}
          featureAccess={featureAccess}
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
              {clubLoading || (!pathAllowed && Boolean(fallbackPath)) ? (
                <DashboardContentLoading />
              ) : memberships.length === 0 ? (
                <PendingApproval fullName={fullName} />
              ) : !pathAllowed ? (
                <div className="mx-auto max-w-xl rounded-xl border border-amber-200 bg-white p-8 text-center shadow-sm">
                  <ShieldCheck className="mx-auto text-amber-500" size={32} />
                  <h1 className="mt-4 text-xl font-bold text-gray-950">{tc('accessDeniedTitle')}</h1>
                  <p className="mt-2 text-sm text-gray-600">{tc('accessDeniedDescription')}</p>
                </div>
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

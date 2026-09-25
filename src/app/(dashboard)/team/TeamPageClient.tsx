'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useClub } from '@/components/layout/DashboardShell';
import { PageHeader } from '@/components/ui/PageHeader';
import { TableSkeleton } from '@/components/ui/LoadingSkeleton';
import { useAppLocale } from '@/components/i18n/AppLocaleContext';
import { formatDateTime } from '@/lib/formatters';
import { isMissingDatabaseColumn } from '@/lib/supabase/errors';
import {
  Building2,
  ChevronDown,
  Search,
  RefreshCw,
  Settings2,
  X,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import type { Club, Profile, UserRole } from '@/types';
import {
  FEATURE_DEFINITIONS,
  featureAccessForMembership,
  normalizeFeatureAccess,
  updateFeatureAccessSelection,
  type FeatureKey,
} from '@/lib/permissions';

const ROLES: UserRole[] = ['owner', 'admin', 'viewer'];

interface TeamMembership {
  clubId: string;
  clubName: string;
  role: UserRole;
  featureAccess: FeatureKey[] | null;
  createdAt: string;
  updatedAt: string;
}

interface TeamMember extends Profile {
  memberships: TeamMembership[];
}

interface AccessDraft {
  clubId: string;
  role: UserRole;
}

interface TeamPageClientProps {
  currentUserId?: string;
}

function normalizeRole(role: string | null | undefined): UserRole {
  return role === 'owner' || role === 'admin' || role === 'viewer' ? role : 'viewer';
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';
}

export default function TeamPageClient({ currentUserId: initialCurrentUserId }: TeamPageClientProps) {
  const router = useRouter();
  const t = useTranslations('team');
  const tc = useTranslations('common');
  const { locale } = useAppLocale();
  const { selectedClubId, role: currentClubRole, loading: clubLoading, refreshClubs } = useClub();
  const [currentUserId, setCurrentUserId] = useState(initialCurrentUserId ?? '');
  const [authorized, setAuthorized] = useState(Boolean(initialCurrentUserId));
  const [profiles, setProfiles] = useState<TeamMember[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [accessDrafts, setAccessDrafts] = useState<Record<string, AccessDraft>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
  const [expandedAddAccessId, setExpandedAddAccessId] = useState<string | null>(null);
  const [membershipSelection, setMembershipSelection] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [featureAccessAvailable, setFeatureAccessAvailable] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadProfiles = useCallback(async () => {
    if (!selectedClubId) {
      setProfiles([]);
      setClubs([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    const supabase = createClient();
    const [membershipRes, profileRes, clubRes] = await Promise.all([
      supabase
        .from('club_memberships')
        .select('club_id, user_id, role, feature_access, created_at, updated_at')
        .order('created_at', { ascending: true }),
      supabase
        .from('profiles')
        .select('id, full_name, email, role, created_at, updated_at')
        .order('full_name', { ascending: true }),
      supabase
        .from('clubs')
        .select('id, name, address, is_active, created_at, updated_at')
        .eq('is_active', true)
        .order('name', { ascending: true }),
    ]);

    let membershipRows = (membershipRes.data ?? []) as Array<{
      club_id: string;
      user_id: string;
      role: string;
      feature_access?: string[] | null;
      created_at: string;
      updated_at: string;
    }>;
    let membershipError = membershipRes.error;

    if (isMissingDatabaseColumn(membershipRes.error, 'feature_access')) {
      const fallbackMembershipRes = await supabase
        .from('club_memberships')
        .select('club_id, user_id, role, created_at, updated_at')
        .order('created_at', { ascending: true });
      membershipRows = (fallbackMembershipRes.data ?? []) as typeof membershipRows;
      membershipError = fallbackMembershipRes.error;
      setFeatureAccessAvailable(false);
    } else {
      setFeatureAccessAvailable(true);
    }

    if (membershipError || profileRes.error || clubRes.error) {
      setError(membershipError?.message ?? profileRes.error?.message ?? clubRes.error?.message ?? 'Error');
      setProfiles([]);
      setClubs([]);
      setLoading(false);
      return;
    }

    const clubRows = ((clubRes.data as Club[] | null) ?? []);
    const clubById = new Map(clubRows.map((club) => [club.id, club]));
    const membershipsByUser = new Map<string, TeamMembership[]>();

    for (const membership of membershipRows) {
      const club = clubById.get(membership.club_id);
      if (!club) continue;

      const userMemberships = membershipsByUser.get(membership.user_id) ?? [];
      userMemberships.push({
        clubId: club.id,
        clubName: club.name,
        role: normalizeRole(membership.role),
        featureAccess: normalizeFeatureAccess(membership.feature_access),
        createdAt: membership.created_at,
        updatedAt: membership.updated_at,
      });
      membershipsByUser.set(membership.user_id, userMemberships);
    }

    for (const userMemberships of Array.from(membershipsByUser.values())) {
      userMemberships.sort((a, b) => a.clubName.localeCompare(b.clubName));
    }

    const teamRows = ((profileRes.data as Profile[] | null) ?? []).map((profile) => ({
      ...profile,
      memberships: membershipsByUser.get(profile.id) ?? [],
    }));

    setClubs(clubRows);
    setProfiles(teamRows);
    setAccessDrafts((current) => {
      const next: Record<string, AccessDraft> = {};

      for (const profile of teamRows) {
        const assignedClubIds = new Set(profile.memberships.map((membership) => membership.clubId));
        const availableClubs = clubRows.filter((club) => !assignedClubIds.has(club.id));
        const currentDraft = current[profile.id];
        const preferredClubId =
          (currentDraft?.clubId && availableClubs.some((club) => club.id === currentDraft.clubId)
            ? currentDraft.clubId
            : '') ||
          availableClubs.find((club) => club.id === selectedClubId)?.id ||
          availableClubs[0]?.id ||
          '';

        next[profile.id] = {
          clubId: preferredClubId,
          role: currentDraft?.role ?? 'viewer',
        };
      }

      return next;
    });
    setLoading(false);
  }, [selectedClubId]);

  useEffect(() => {
    let cancelled = false;

    async function authorize() {
      if (clubLoading) return;

      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) {
        router.replace('/login');
        return;
      }

      if (cancelled) return;

      if (currentClubRole !== 'owner') {
        router.replace('/');
        return;
      }

      setCurrentUserId(session.user.id);
      setAuthorized(true);
    }

    authorize().catch((err) => {
      if (!cancelled) setError(String(err));
    });

    return () => {
      cancelled = true;
    };
  }, [clubLoading, currentClubRole, router]);

  useEffect(() => {
    if (!authorized) return;
    loadProfiles().catch((err) => setError(String(err)));
  }, [authorized, loadProfiles]);

  const pendingProfiles = useMemo(
    () => profiles.filter((profile) => profile.memberships.length === 0),
    [profiles],
  );

  const activeProfiles = useMemo(
    () => profiles.filter((profile) => profile.memberships.length > 0),
    [profiles],
  );

  const filteredActiveProfiles = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase(locale);
    if (!query) return activeProfiles;

    return activeProfiles.filter((profile) =>
      profile.full_name.toLocaleLowerCase(locale).includes(query)
      || profile.email?.toLocaleLowerCase(locale).includes(query)
      || profile.memberships.some((membership) => membership.clubName.toLocaleLowerCase(locale).includes(query)),
    );
  }, [activeProfiles, locale, searchQuery]);

  function ownerCountForClub(clubId: string) {
    return profiles.filter((profile) =>
      profile.memberships.some((membership) => membership.clubId === clubId && membership.role === 'owner'),
    ).length;
  }

  function availableClubsForProfile(profile: TeamMember) {
    const assignedClubIds = new Set(profile.memberships.map((membership) => membership.clubId));
    return clubs.filter((club) => !assignedClubIds.has(club.id));
  }

  function draftForProfile(profile: TeamMember) {
    const availableClubs = availableClubsForProfile(profile);
    const currentDraft = accessDrafts[profile.id];
    const clubId =
      (currentDraft?.clubId && availableClubs.some((club) => club.id === currentDraft.clubId)
        ? currentDraft.clubId
        : '') ||
      availableClubs.find((club) => club.id === selectedClubId)?.id ||
      availableClubs[0]?.id ||
      '';

    return {
      clubId,
      role: currentDraft?.role ?? 'viewer',
    };
  }

  function selectedMembershipForProfile(profile: TeamMember): TeamMembership | undefined {
    const preferredClubId = membershipSelection[profile.id];
    return profile.memberships.find((membership) => membership.clubId === preferredClubId)
      ?? profile.memberships.find((membership) => membership.clubId === selectedClubId)
      ?? profile.memberships[0];
  }

  function updateAccessDraft(profileId: string, patch: Partial<AccessDraft>) {
    setAccessDrafts((current) => ({
      ...current,
      [profileId]: {
        clubId: current[profileId]?.clubId ?? '',
        role: current[profileId]?.role ?? 'viewer',
        ...patch,
      },
    }));
  }

  function isSavingProfile(profileId: string) {
    return savingId?.startsWith(`${profileId}:`) ?? false;
  }

  async function addClubAccess(profile: TeamMember) {
    const draft = draftForProfile(profile);

    if (!draft.clubId) {
      setError(t('selectClubFirst'));
      return;
    }

    setSavingId(`${profile.id}:${draft.clubId}:add`);
    setError('');
    setMessage('');

    const supabase = createClient();
    const { error: insertError } = await supabase
      .from('club_memberships')
      .insert({
        club_id: draft.clubId,
        user_id: profile.id,
        role: draft.role,
      });

    setSavingId(null);
    if (insertError) {
      setError(insertError.message);
      return;
    }

    setMessage(t('accessAdded'));
    await loadProfiles();

    if (profile.id === currentUserId) {
      await refreshClubs();
    }
  }

  async function updateMembershipRole(profile: TeamMember, membership: TeamMembership, role: UserRole) {
    if (membership.role === role) return;

    if (profile.id === currentUserId && membership.role === 'owner' && role !== 'owner') {
      setError(t('selfDemoteBlocked'));
      return;
    }

    if (membership.role === 'owner' && role !== 'owner' && ownerCountForClub(membership.clubId) <= 1) {
      setError(t('lastOwnerBlocked'));
      return;
    }

    setSavingId(`${profile.id}:${membership.clubId}:role`);
    setError('');
    setMessage('');

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from('club_memberships')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('club_id', membership.clubId)
      .eq('user_id', profile.id);

    setSavingId(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }

    setMessage(t('saved'));
    await loadProfiles();

    if (profile.id === currentUserId) {
      await refreshClubs();
    }
  }

  async function removeClubAccess(profile: TeamMember, membership: TeamMembership) {
    if (profile.id === currentUserId) {
      setError(t('selfRemoveBlocked'));
      return;
    }

    if (membership.role === 'owner' && ownerCountForClub(membership.clubId) <= 1) {
      setError(t('lastOwnerBlocked'));
      return;
    }

    if (!window.confirm(t('removeClubConfirm', { club: membership.clubName }))) return;

    setSavingId(`${profile.id}:${membership.clubId}:remove`);
    setError('');
    setMessage('');

    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from('club_memberships')
      .delete()
      .eq('club_id', membership.clubId)
      .eq('user_id', profile.id);

    setSavingId(null);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setMessage(t('removed'));
    await loadProfiles();
  }

  async function updateMembershipFeatureAccess(
    profile: TeamMember,
    membership: TeamMembership,
    featureKey: FeatureKey,
    enabled: boolean,
  ) {
    const definition = FEATURE_DEFINITIONS.find((feature) => feature.key === featureKey);
    if (membership.role === 'owner' || (definition && 'ownerOnly' in definition && definition.ownerOnly)) return;

    const currentAccess = featureAccessForMembership(membership.role, membership.featureAccess);
    const nextAccess = updateFeatureAccessSelection(currentAccess, featureKey, enabled);
    const membershipSavingId = `${profile.id}:${membership.clubId}:features`;

    setSavingId(membershipSavingId);
    setError('');
    setMessage('');
    setProfiles((current) => current.map((member) => member.id !== profile.id
      ? member
      : {
          ...member,
          memberships: member.memberships.map((item) => item.clubId === membership.clubId
            ? { ...item, featureAccess: nextAccess }
            : item),
        }));

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from('club_memberships')
      .update({ feature_access: nextAccess, updated_at: new Date().toISOString() })
      .eq('club_id', membership.clubId)
      .eq('user_id', profile.id);

    setSavingId(null);
    if (updateError) {
      setProfiles((current) => current.map((member) => member.id !== profile.id
        ? member
        : {
            ...member,
            memberships: member.memberships.map((item) => item.clubId === membership.clubId
              ? { ...item, featureAccess: membership.featureAccess }
              : item),
          }));
      setError(updateError.message);
      return;
    }

    setMessage(t('featureAccessSaved'));
    if (profile.id === currentUserId) await refreshClubs();
  }

  function renderAccessControls(profile: TeamMember, buttonLabel: string) {
    const availableClubs = availableClubsForProfile(profile);
    const draft = draftForProfile(profile);
    const saving = isSavingProfile(profile.id);

    if (availableClubs.length === 0) {
      return (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-500">
          <ShieldCheck size={16} className="text-success-500" />
          {t('allClubsAdded')}
        </div>
      );
    }

    return (
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px_auto]">
        <div className="relative">
          <Building2 className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <select
            className="input-field h-11 pl-9"
            aria-label={t('gameClubs')}
            value={draft.clubId}
            disabled={saving}
            onChange={(event) => updateAccessDraft(profile.id, { clubId: event.target.value })}
          >
            {availableClubs.map((club) => (
              <option key={club.id} value={club.id}>
                {club.name}
              </option>
            ))}
          </select>
        </div>
        <select
          className="input-field h-11"
          aria-label={t('memberRole')}
          value={draft.role}
          disabled={saving}
          onChange={(event) => updateAccessDraft(profile.id, { role: event.target.value as UserRole })}
        >
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {t(`roles.${role}`)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn-primary h-11 whitespace-nowrap px-5"
          disabled={saving || !draft.clubId}
          onClick={() => addClubAccess(profile)}
        >
          <UserPlus size={16} />
          {buttonLabel}
        </button>
      </div>
    );
  }

  function renderFeatureAccessPanel(profile: TeamMember, membership: TeamMembership) {
    const membershipId = `${profile.id}:${membership.clubId}`;
    const featureAccess = featureAccessForMembership(membership.role, membership.featureAccess);
    const savingFeatures = savingId === `${membershipId}:features`;

    return (
      <div className="border-t border-gray-200/70 pt-5">
        <div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-gray-600">
                <ShieldCheck size={16} className="text-primary-600" />
                {t('pageAccess')}
              </div>
              <p className="mt-1 text-sm text-gray-500">
                {membership.role === 'owner' ? t('ownerFeatureAccessHelp') : t('featureAccessHelp')}
              </p>
            </div>
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-bold text-gray-600">
              <Building2 size={13} />
              {membership.clubName}
            </span>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {FEATURE_DEFINITIONS.map((feature) => {
              const ownerOnly = 'ownerOnly' in feature && feature.ownerOnly;
              const disabled = savingFeatures || isSavingProfile(profile.id) || membership.role === 'owner' || ownerOnly;
              const checked = membership.role === 'owner'
                ? true
                : !ownerOnly && featureAccess.includes(feature.key);

              return (
                <label
                  key={feature.key}
                  className={`flex min-h-[76px] gap-3 rounded-xl border p-3 transition ${checked ? 'border-primary-300 bg-primary-50/50' : 'border-gray-200 bg-white'} ${disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:border-primary-300'}`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 flex-none accent-primary-600"
                    checked={checked}
                    disabled={disabled}
                    onChange={(event) => updateMembershipFeatureAccess(profile, membership, feature.key, event.target.checked)}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-gray-900">{t(`features.${feature.labelKey}`)}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-gray-500">{t(`features.${feature.descriptionKey}`)}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (!authorized) {
    return <TableSkeleton rows={6} columns={4} />;
  }

  return (
    <div>
      <PageHeader
        title={t('title')}
        description={t('description')}
        action={
          <button className="btn-secondary flex items-center gap-2" disabled={loading || Boolean(savingId)} onClick={loadProfiles}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            {t('refresh')}
          </button>
        }
      />

      {error && (
        <div role="alert" className="mb-4 rounded-xl border border-danger-100 bg-danger-50 px-4 py-3 text-sm font-medium text-danger-600">
          {error}
        </div>
      )}
      {message && (
        <div role="status" className="mb-4 rounded-xl border border-success-100 bg-success-50 px-4 py-3 text-sm font-medium text-success-600">
          {message}
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={7} columns={4} />
      ) : (
        <div className="space-y-6">
          {pendingProfiles.length > 0 && (
            <section className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/40">
              <div className="flex items-center justify-between px-4 py-3 sm:px-5">
                <div className="flex items-center gap-2.5">
                  <UserPlus size={17} className="text-amber-600" />
                  <h2 className="text-sm font-bold text-amber-950">{t('pendingApproval')}</h2>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-amber-700">
                  {pendingProfiles.length}
                </span>
              </div>
              <div className="divide-y divide-amber-100">
                {pendingProfiles.map((profile) => (
                  <div
                    key={profile.id}
                    className="grid gap-4 bg-white p-4 sm:px-5 lg:grid-cols-[minmax(240px,1fr)_minmax(440px,1.5fr)] lg:items-center"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-gray-950 text-sm font-black text-white">
                        {initials(profile.full_name)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-bold text-gray-950">{profile.full_name}</p>
                        {profile.email && <p className="truncate text-xs text-gray-500">{profile.email}</p>}
                        <p className="mt-0.5 text-xs text-gray-400">{formatDateTime(profile.created_at, locale)}</p>
                      </div>
                    </div>
                    {renderAccessControls(profile, t('approve'))}
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeProfiles.length === 0 ? (
            <div className="card py-12 text-center text-gray-500">{tc('noData')}</div>
          ) : (
            <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="flex flex-col gap-4 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div>
                  <div className="flex items-center gap-2.5">
                    <Users size={19} className="text-primary-600" />
                    <h2 className="text-base font-bold text-gray-950">{t('members')}</h2>
                    <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-bold tabular-nums text-primary-700">
                      {activeProfiles.length}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-gray-500">{t('manageHelp')}</p>
                </div>
                <div className="relative w-full sm:w-72 sm:shrink-0">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
                  <input
                    type="search"
                    className="input-field h-11 rounded-xl bg-gray-50/70 pl-10"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={t('searchPlaceholder')}
                    aria-label={t('searchPlaceholder')}
                  />
                </div>
              </div>

              {filteredActiveProfiles.length === 0 ? (
                <div className="px-5 py-14 text-center">
                  <Search size={25} className="mx-auto mb-3 text-gray-300" />
                  <p className="text-sm text-gray-500">{t('noSearchResults')}</p>
                  <button className="mt-3 text-sm font-semibold text-primary-600 hover:text-primary-800" onClick={() => setSearchQuery('')}>
                    {t('clearSearch')}
                  </button>
                </div>
              ) : (
                <>
                  <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_148px] gap-5 border-b border-gray-100 bg-gray-50/70 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 lg:grid">
                    <span>{t('member')}</span>
                    <span>{t('clubAccess')}</span>
                    <span className="text-right">{t('actions')}</span>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {filteredActiveProfiles.map((profile) => {
                      const membership = selectedMembershipForProfile(profile);
                      if (!membership) return null;
                      const expanded = expandedMemberId === profile.id;
                      const addAccessExpanded = expandedAddAccessId === profile.id;
                      const hasAvailableClubs = availableClubsForProfile(profile).length > 0;
                      const accessCount = FEATURE_DEFINITIONS.filter((feature) => (
                        !('ownerOnly' in feature && feature.ownerOnly)
                        && featureAccessForMembership(membership.role, membership.featureAccess).includes(feature.key)
                      )).length;
                      const saving = isSavingProfile(profile.id);
                      const protectedOwner = membership.role === 'owner'
                        && (profile.id === currentUserId || ownerCountForClub(membership.clubId) <= 1);
                      const roleStyle = membership.role === 'owner'
                        ? 'bg-amber-50 text-amber-800 ring-amber-200/70'
                        : membership.role === 'admin'
                          ? 'bg-primary-50 text-primary-700 ring-primary-200/70'
                          : 'bg-gray-100 text-gray-600 ring-gray-200/70';

                      return (
                        <article key={profile.id} className={expanded ? 'bg-primary-50/20' : 'bg-white'}>
                          <div className="grid items-center gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_148px] lg:gap-5">
                            <div className="flex min-w-0 items-center gap-3">
                              <span className={`flex h-11 w-11 flex-none items-center justify-center rounded-2xl text-sm font-bold ring-1 ring-inset ${roleStyle}`}>
                                {initials(profile.full_name)}
                              </span>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <h3 className="break-words text-sm font-bold text-gray-950">{profile.full_name}</h3>
                                  {profile.id === currentUserId && (
                                    <span className="shrink-0 rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-semibold text-primary-700">{t('you')}</span>
                                  )}
                                </div>
                                {profile.email && <p className="mt-1 truncate text-xs text-gray-500" title={profile.email}>{profile.email}</p>}
                              </div>
                            </div>

                            <div className="min-w-0 sm:order-3 sm:col-span-2 lg:order-none lg:col-span-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Building2 size={15} className="shrink-0 text-gray-400" />
                                <span className="break-words text-sm font-medium text-gray-800">{membership.clubName}</span>
                                <span className={`inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${roleStyle}`}>
                                  {t(`roles.${membership.role}`)}
                                </span>
                              </div>
                              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 pl-[23px] text-xs text-gray-500">
                                {featureAccessAvailable && <span>{membership.role === 'owner' ? t('allPages') : t('enabledPages', { count: accessCount })}</span>}
                                {profile.memberships.length > 1 && <span className="font-medium text-primary-600">{t('additionalClubs', { count: profile.memberships.length - 1 })}</span>}
                              </p>
                            </div>

                            <button
                              type="button"
                              className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition sm:order-2 lg:order-none ${expanded ? 'border-primary-200 bg-primary-50 text-primary-700' : 'border-gray-200 bg-white text-gray-700 hover:border-primary-200 hover:bg-primary-50/50 hover:text-primary-700'}`}
                              onClick={() => {
                                setExpandedMemberId(expanded ? null : profile.id);
                                setExpandedAddAccessId(null);
                              }}
                              aria-label={t('manageMember', { name: profile.full_name })}
                              aria-expanded={expanded}
                              aria-controls={`member-access-${profile.id}`}
                            >
                              <Settings2 size={15} />
                              {t('manageAccess')}
                              <ChevronDown size={14} className={`shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                            </button>
                          </div>

                          {expanded && (
                            <div id={`member-access-${profile.id}`} className="border-t border-primary-100 bg-gray-50/80 px-4 py-5 sm:px-5">
                              <div className="mb-5 flex items-start justify-between gap-3">
                                <div>
                                  <h4 className="text-sm font-bold text-gray-900">{t('accessSettings')}</h4>
                                  <p className="mt-1 text-xs text-gray-500">{t('autoSave')}</p>
                                </div>
                                <button
                                  type="button"
                                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                                  onClick={() => setExpandedMemberId(null)}
                                  aria-label={t('hideAccess')}
                                >
                                  <X size={17} />
                                </button>
                              </div>
                              <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
                                <label className="block min-w-0">
                                  <span className="label">{t('gameClubs')}</span>
                                  <select
                                    className="input-field h-11 font-medium"
                                    value={membership.clubId}
                                    disabled={saving}
                                    onChange={(event) => {
                                      setMembershipSelection((current) => ({ ...current, [profile.id]: event.target.value }));
                                      setExpandedAddAccessId(null);
                                    }}
                                  >
                                    {profile.memberships.map((item) => <option key={item.clubId} value={item.clubId}>{item.clubName}</option>)}
                                  </select>
                                </label>
                                <label className="block min-w-0">
                                  <span className="label">{t('memberRole')}</span>
                                  <select
                                    className="input-field h-11 font-medium disabled:bg-gray-100 disabled:text-gray-500"
                                    value={membership.role}
                                    disabled={saving || protectedOwner}
                                    onChange={(event) => updateMembershipRole(profile, membership, event.target.value as UserRole)}
                                  >
                                    {ROLES.map((role) => <option key={role} value={role}>{t(`roles.${role}`)}</option>)}
                                  </select>
                                </label>
                                {hasAvailableClubs && (
                                  <button
                                    type="button"
                                    className="btn-secondary h-11 border border-gray-200 bg-white"
                                    disabled={saving}
                                    onClick={() => setExpandedAddAccessId(addAccessExpanded ? null : profile.id)}
                                    aria-expanded={addAccessExpanded}
                                    aria-controls={`add-access-${profile.id}`}
                                  >
                                    <UserPlus size={16} />
                                    {t('addAccess')}
                                  </button>
                                )}
                              </div>
                              {addAccessExpanded && (
                                <div id={`add-access-${profile.id}`} className="mb-5 rounded-xl border border-primary-200 bg-white p-4">
                                  <p className="mb-3 text-sm font-semibold text-gray-800">{t('addAccessHelp')}</p>
                                  {renderAccessControls(profile, t('addAccess'))}
                                </div>
                              )}
                              {featureAccessAvailable && renderFeatureAccessPanel(profile, membership)}
                              <div className="mt-5 flex flex-col gap-3 border-t border-gray-200/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-xs leading-5 text-gray-500">
                                  {profile.id === currentUserId ? t('selfRemoveBlocked') : protectedOwner ? t('lastOwnerBlocked') : t('removeAccessHelp', { club: membership.clubName })}
                                </p>
                                <button
                                  type="button"
                                  className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-danger-600 transition hover:bg-danger-50 disabled:cursor-not-allowed disabled:text-gray-400"
                                  disabled={saving || profile.id === currentUserId || protectedOwner}
                                  onClick={() => removeClubAccess(profile, membership)}
                                  aria-label={t('removeClubAccess', { club: membership.clubName })}
                                >
                                  <Trash2 size={15} />
                                  {t('removeAccess')}
                                </button>
                              </div>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

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
  const [expandedFeatureAccessId, setExpandedFeatureAccessId] = useState<string | null>(null);
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
      <div className="border-t border-gray-100 bg-gray-50/70 px-4 py-5 sm:px-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-gray-600">
                <ShieldCheck size={16} className="text-primary-600" />
                {t('featureAccess')}
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

          <div className="mt-4">
            <p className="text-sm font-bold text-gray-800">{t('pageAccess')}</p>
            <p className="mt-0.5 text-xs text-gray-400">{t('pageAccessHelp')}</p>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {FEATURE_DEFINITIONS.map((feature) => {
              const ownerOnly = 'ownerOnly' in feature && feature.ownerOnly;
              const disabled = savingFeatures || membership.role === 'owner' || ownerOnly;
              const checked = membership.role === 'owner'
                ? true
                : !ownerOnly && featureAccess.includes(feature.key);

              return (
                <label
                  key={feature.key}
                  className={`flex min-h-[64px] gap-2.5 rounded-xl border p-3 transition ${checked ? 'border-primary-300 bg-primary-50/50' : 'border-gray-200 bg-white'} ${disabled ? 'cursor-not-allowed opacity-65' : 'cursor-pointer hover:border-primary-300'}`}
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
                    <span className="mt-0.5 block text-xs leading-4 text-gray-400">{t(`features.${feature.descriptionKey}`)}</span>
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
          <button className="btn-secondary flex items-center gap-2" onClick={loadProfiles}>
            <Users size={16} />
            {t('refresh')}
          </button>
        }
      />

      {error && (
        <div className="mb-4 rounded-xl border border-danger-100 bg-danger-50 px-4 py-3 text-sm font-medium text-danger-600">
          {error}
        </div>
      )}
      {message && (
        <div className="mb-4 rounded-xl border border-success-100 bg-success-50 px-4 py-3 text-sm font-medium text-success-600">
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
            <section>
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-400">{t('membersCount', { count: activeProfiles.length })}</p>
                </div>
                <div className="relative w-full sm:w-80">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
                  <input
                    type="search"
                    className="input-field h-11 rounded-xl pl-10"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={t('searchPlaceholder')}
                    aria-label={t('searchPlaceholder')}
                  />
                </div>
              </div>

              {filteredActiveProfiles.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-white py-12 text-center text-sm text-gray-500">
                  {t('noSearchResults')}
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                  <div className="hidden min-h-12 grid-cols-[56px_minmax(240px,1.2fr)_120px_minmax(500px,2fr)] items-center border-b border-gray-100 bg-gray-50/80 px-5 text-xs font-bold uppercase tracking-wider text-gray-500 xl:grid">
                    <span>#</span>
                    <span>{t('member')}</span>
                    <span>{t('status')}</span>
                    <span>{t('actions')}</span>
                  </div>

                  <div className="divide-y divide-gray-100">
                    {filteredActiveProfiles.map((profile, index) => {
                      const membership = selectedMembershipForProfile(profile);
                      if (!membership) return null;
                      const membershipId = `${profile.id}:${membership.clubId}`;
                      const featureAccess = featureAccessForMembership(membership.role, membership.featureAccess);
                      const featuresExpanded = expandedFeatureAccessId === membershipId;
                      const addAccessExpanded = expandedAddAccessId === profile.id;
                      const hasAvailableClubs = availableClubsForProfile(profile).length > 0;

                      return (
                        <article key={profile.id} className="bg-white">
                          <div className="grid gap-4 px-4 py-4 sm:px-5 xl:grid-cols-[56px_minmax(240px,1.2fr)_120px_minmax(500px,2fr)] xl:items-center">
                            <div className="hidden xl:block">
                              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-sm font-bold text-gray-500">
                                {index + 1}
                              </span>
                            </div>

                            <div className="flex min-w-0 items-center gap-3">
                              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-gray-950 text-sm font-black text-white">
                                {initials(profile.full_name)}
                              </span>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="truncate font-bold text-gray-950">{profile.full_name}</p>
                                  {profile.id === currentUserId && (
                                    <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-bold text-primary-700">{t('you')}</span>
                                  )}
                                </div>
                                {profile.email && <p className="truncate text-xs text-gray-400">{profile.email}</p>}
                                <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">{t(`roles.${membership.role}`)}</p>
                              </div>
                            </div>

                            <div>
                              <span className="inline-flex items-center rounded-full border border-success-200 bg-success-50 px-2.5 py-1 text-xs font-bold text-success-600">
                                {t('active')}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <select
                                className="input-field h-11 min-w-40 flex-1 font-semibold lg:max-w-48"
                                value={membership.clubId}
                                disabled={isSavingProfile(profile.id)}
                                onChange={(event) => {
                                  setMembershipSelection((current) => ({ ...current, [profile.id]: event.target.value }));
                                  setExpandedFeatureAccessId(null);
                                }}
                                aria-label={t('gameClubs')}
                              >
                                {profile.memberships.map((item) => (
                                  <option key={item.clubId} value={item.clubId}>{item.clubName}</option>
                                ))}
                              </select>

                              <select
                                className="input-field h-11 w-32 font-semibold"
                                value={membership.role}
                                disabled={isSavingProfile(profile.id)}
                                onChange={(event) => updateMembershipRole(profile, membership, event.target.value as UserRole)}
                                aria-label={t('changeAccess')}
                              >
                                {ROLES.map((role) => (
                                  <option key={role} value={role}>{t(`roles.${role}`)}</option>
                                ))}
                              </select>

                              {featureAccessAvailable ? (
                                <button
                                  type="button"
                                  className={`inline-flex h-11 items-center gap-2 rounded-xl border px-3 text-sm font-bold transition ${featuresExpanded ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-gray-200 bg-white text-gray-600 hover:border-primary-200 hover:text-primary-700'}`}
                                  onClick={() => {
                                    setExpandedFeatureAccessId(featuresExpanded ? null : membershipId);
                                    setExpandedAddAccessId(null);
                                  }}
                                  aria-expanded={featuresExpanded}
                                >
                                  <ShieldCheck size={16} />
                                  {t('featureAccess')}
                                  <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">{featureAccess.length}</span>
                                  <ChevronDown size={14} className={`transition ${featuresExpanded ? 'rotate-180' : ''}`} />
                                </button>
                              ) : null}

                              {hasAvailableClubs ? (
                                <button
                                  type="button"
                                  className={`inline-flex h-11 items-center gap-2 rounded-xl border px-3 text-sm font-bold transition ${addAccessExpanded ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
                                  onClick={() => {
                                    setExpandedAddAccessId(addAccessExpanded ? null : profile.id);
                                    setExpandedFeatureAccessId(null);
                                  }}
                                  aria-expanded={addAccessExpanded}
                                >
                                  <UserPlus size={16} />
                                  <span className="hidden xl:inline">{t('addAccess')}</span>
                                </button>
                              ) : null}

                              <button
                                type="button"
                                className="inline-flex h-11 items-center gap-2 rounded-xl border border-danger-100 bg-danger-50 px-3 text-sm font-bold text-danger-600 transition hover:bg-danger-100 disabled:opacity-40"
                                disabled={isSavingProfile(profile.id) || profile.id === currentUserId}
                                onClick={() => removeClubAccess(profile, membership)}
                                aria-label={t('removeClubAccess', { club: membership.clubName })}
                              >
                                <Trash2 size={16} />
                                <span className="hidden xl:inline">{t('removeAccess')}</span>
                              </button>
                            </div>
                          </div>

                          {addAccessExpanded ? (
                            <div className="border-t border-gray-100 bg-gray-50/70 px-4 py-4 sm:px-6">
                              <div className="ml-auto max-w-2xl rounded-xl border border-gray-200 bg-white p-4">
                                <p className="mb-3 text-sm font-bold text-gray-900">{t('addAccessHelp')}</p>
                                {renderAccessControls(profile, t('addAccess'))}
                              </div>
                            </div>
                          ) : null}

                          {featuresExpanded ? renderFeatureAccessPanel(profile, membership) : null}
                        </article>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

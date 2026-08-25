'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useClub } from '@/components/layout/DashboardShell';
import { PageHeader } from '@/components/ui/PageHeader';
import { MetricGridSkeleton, TableSkeleton } from '@/components/ui/LoadingSkeleton';
import { useAppLocale } from '@/components/i18n/AppLocaleContext';
import { formatDateTime } from '@/lib/formatters';
import { ChevronDown, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react';
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

    if (membershipRes.error || profileRes.error || clubRes.error) {
      setError(membershipRes.error?.message ?? profileRes.error?.message ?? clubRes.error?.message ?? 'Error');
      setProfiles([]);
      setClubs([]);
      setLoading(false);
      return;
    }

    const clubRows = ((clubRes.data as Club[] | null) ?? []);
    const clubById = new Map(clubRows.map((club) => [club.id, club]));
    const membershipsByUser = new Map<string, TeamMembership[]>();

    for (const membership of (membershipRes.data ?? []) as Array<{
      club_id: string;
      user_id: string;
      role: string;
      feature_access: string[] | null;
      created_at: string;
      updated_at: string;
    }>) {
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

  const selectedClubMembers = useMemo(
    () => profiles.filter((profile) => profile.memberships.some((membership) => membership.clubId === selectedClubId)),
    [profiles, selectedClubId],
  );

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
      return <p className="text-xs font-medium text-gray-400">{t('allClubsAdded')}</p>;
    }

    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          className="input-field h-10 w-full sm:w-44"
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
        <select
          className="input-field h-10 w-full sm:w-32"
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
          className="btn-primary h-10 whitespace-nowrap"
          disabled={saving || !draft.clubId}
          onClick={() => addClubAccess(profile)}
        >
          <UserPlus size={16} />
          {buttonLabel}
        </button>
      </div>
    );
  }

  function renderMemberships(profile: TeamMember) {
    if (profile.memberships.length === 0) {
      return <span className="text-xs font-medium text-gray-400">{t('noClubAccess')}</span>;
    }

    return (
      <div className="flex flex-col gap-2">
        {profile.memberships.map((membership) => {
          const membershipId = `${profile.id}:${membership.clubId}`;
          const featureAccess = featureAccessForMembership(membership.role, membership.featureAccess);
          const expanded = expandedFeatureAccessId === membershipId;
          const savingFeatures = savingId === `${membershipId}:features`;

          return (
          <div
            key={membership.clubId}
            className="max-w-full rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900">{membership.clubName}</p>
                <p className="text-xs text-gray-400">{formatDateTime(membership.createdAt, locale)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="input-field h-9 w-32"
                  value={membership.role}
                  disabled={isSavingProfile(profile.id)}
                  onChange={(event) => updateMembershipRole(profile, membership, event.target.value as UserRole)}
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {t(`roles.${role}`)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-bold transition ${expanded ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-gray-200 bg-white text-gray-600 hover:border-primary-200'}`}
                  onClick={() => setExpandedFeatureAccessId(expanded ? null : membershipId)}
                  aria-expanded={expanded}
                >
                  <ShieldCheck size={15} />
                  {t('featureAccess')}
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">{featureAccess.length}</span>
                  <ChevronDown size={14} className={expanded ? 'rotate-180' : ''} />
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-danger-100 text-danger-600 transition hover:bg-danger-50 disabled:opacity-40"
                  disabled={isSavingProfile(profile.id) || profile.id === currentUserId}
                  onClick={() => removeClubAccess(profile, membership)}
                  aria-label={t('removeClubAccess', { club: membership.clubName })}
                  title={t('removeClubAccess', { club: membership.clubName })}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            {expanded ? (
              <div className="mt-3 border-t border-gray-200 pt-3">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-600">{t('featureAccess')}</p>
                <p className="mt-1 text-xs text-gray-500">
                  {membership.role === 'owner' ? t('ownerFeatureAccessHelp') : t('featureAccessHelp')}
                </p>
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
                        className={`flex gap-2 rounded-lg border p-3 transition ${checked ? 'border-primary-200 bg-primary-50/60' : 'border-gray-200 bg-white'} ${disabled ? 'cursor-not-allowed opacity-65' : 'cursor-pointer hover:border-primary-200'}`}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 accent-primary-600"
                          checked={checked}
                          disabled={disabled}
                          onChange={(event) => updateMembershipFeatureAccess(profile, membership, feature.key, event.target.checked)}
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-bold text-gray-900">{t(`features.${feature.labelKey}`)}</span>
                          <span className="mt-0.5 block text-xs leading-4 text-gray-500">{t(`features.${feature.descriptionKey}`)}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
          );
        })}
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

      {loading ? (
        <MetricGridSkeleton count={3} className="mb-4 sm:grid-cols-3 xl:grid-cols-3" />
      ) : (
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {ROLES.map((role) => (
          <div key={role} className="card flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                {t(`roles.${role}`)}
              </p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {
                  selectedClubMembers.filter((profile) =>
                    profile.memberships.some(
                      (membership) => membership.clubId === selectedClubId && membership.role === role,
                    ),
                  ).length
                }
              </p>
            </div>
            <ShieldCheck className="text-primary-500" size={22} />
          </div>
        ))}
      </div>
      )}

      {error && <p className="mb-3 text-sm text-danger-500">{error}</p>}
      {message && <p className="mb-3 text-sm text-success-600">{message}</p>}

      {loading ? (
        <TableSkeleton rows={7} columns={4} />
      ) : (
        <div className="space-y-6">
          {pendingProfiles.length > 0 && (
            <section className="rounded-xl border border-amber-100 bg-amber-50/40 p-4">
              <div className="mb-3 flex items-center gap-2">
                <UserPlus size={18} className="text-amber-600" />
                <h2 className="text-sm font-bold uppercase tracking-wide text-amber-900">{t('pendingApproval')}</h2>
              </div>
              <div className="space-y-2">
                {pendingProfiles.map((profile) => (
                  <div
                    key={profile.id}
                    className="flex flex-col gap-3 rounded-lg border border-amber-100 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">{profile.full_name}</p>
                      {profile.email && <p className="text-xs text-gray-500">{profile.email}</p>}
                      <p className="text-xs text-gray-500">{formatDateTime(profile.created_at, locale)}</p>
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
            <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
              <table className="w-full min-w-[1080px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                      {t('member')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                      {t('gameClubs')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                      {t('addAccess')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                      {t('joined')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {activeProfiles.map((profile) => (
                    <tr key={profile.id} className="hover:bg-gray-50">
                      <td className="w-[260px] px-4 py-3 align-top">
                        <p className="font-medium text-gray-900">{profile.full_name}</p>
                        {profile.email && <p className="text-xs text-gray-500">{profile.email}</p>}
                        {profile.id === currentUserId && (
                          <p className="text-xs text-gray-400">{t('you')}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">{renderMemberships(profile)}</td>
                      <td className="w-[420px] px-4 py-3 align-top">
                        {renderAccessControls(profile, t('addAccess'))}
                      </td>
                      <td className="px-4 py-3 align-top text-gray-500">
                        {formatDateTime(profile.created_at, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useClub } from '@/components/layout/DashboardShell';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { useAppLocale } from '@/components/i18n/AppLocaleContext';
import { formatDateTime } from '@/lib/formatters';
import { ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react';
import type { Profile, UserRole } from '@/types';

const ROLES: UserRole[] = ['owner', 'admin', 'viewer'];

interface TeamMember extends Profile {
  membershipRole: UserRole;
  membershipCreatedAt: string;
}

interface TeamPageClientProps {
  currentUserId?: string;
}

export default function TeamPageClient({ currentUserId: initialCurrentUserId }: TeamPageClientProps) {
  const router = useRouter();
  const t = useTranslations('team');
  const tc = useTranslations('common');
  const { locale } = useAppLocale();
  const { selectedClubId, role: currentClubRole, loading: clubLoading } = useClub();
  const [currentUserId, setCurrentUserId] = useState(initialCurrentUserId ?? '');
  const [authorized, setAuthorized] = useState(Boolean(initialCurrentUserId));
  const [profiles, setProfiles] = useState<TeamMember[]>([]);
  const [pendingProfiles, setPendingProfiles] = useState<Profile[]>([]);
  const [pendingRoles, setPendingRoles] = useState<Record<string, UserRole>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadProfiles = useCallback(async () => {
    if (!selectedClubId) {
      setProfiles([]);
      setPendingProfiles([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    const supabase = createClient();
    const { data: memberships, error: loadError } = await supabase
      .from('club_memberships')
      .select('user_id, role, created_at, updated_at')
      .eq('club_id', selectedClubId);

    const { data: allProfiles, error: allProfilesError } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, created_at, updated_at')
      .order('full_name', { ascending: true });

    if (loadError || allProfilesError) {
      setError(loadError?.message ?? allProfilesError?.message ?? 'Error');
      setProfiles([]);
      setPendingProfiles([]);
      setLoading(false);
      return;
    }

    const userIds = ((memberships ?? []) as Array<{ user_id: string }>).map((membership) => membership.user_id);
    const selectedClubUserIds = new Set(userIds);
    const profileRows = ((allProfiles as Profile[] | null) ?? []);

    setPendingProfiles(profileRows.filter((profile) => !selectedClubUserIds.has(profile.id)));
    setPendingRoles((current) => {
      const next: Record<string, UserRole> = {};
      for (const profile of profileRows) {
        if (!selectedClubUserIds.has(profile.id)) {
          next[profile.id] = current[profile.id] ?? 'viewer';
        }
      }
      return next;
    });

    const membershipByUser = new Map(
      ((memberships ?? []) as Array<{ user_id: string; role: UserRole; created_at: string }>).map((membership) => [
        membership.user_id,
        membership,
      ]),
    );
    setProfiles(
      profileRows
        .filter((profile) => selectedClubUserIds.has(profile.id))
        .map((profile) => {
          const membership = membershipByUser.get(profile.id);
          return {
            ...profile,
            membershipRole: membership?.role ?? 'viewer',
            membershipCreatedAt: membership?.created_at ?? profile.created_at,
          };
        }) as TeamMember[],
    );
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

  const ownerCount = useMemo(
    () => profiles.filter((profile) => profile.membershipRole === 'owner').length,
    [profiles],
  );

  async function updateRole(profile: TeamMember, role: UserRole) {
    if (profile.membershipRole === role || !selectedClubId) return;

    if (profile.id === currentUserId && profile.membershipRole === 'owner' && role !== 'owner') {
      setError(t('selfDemoteBlocked'));
      return;
    }

    if (profile.membershipRole === 'owner' && role !== 'owner' && ownerCount <= 1) {
      setError(t('lastOwnerBlocked'));
      return;
    }

    setSavingId(profile.id);
    setError('');
    setMessage('');

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from('club_memberships')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('club_id', selectedClubId)
      .eq('user_id', profile.id);

    setSavingId(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }

    setProfiles((current) =>
      current.map((row) => (row.id === profile.id ? { ...row, membershipRole: role } : row)),
    );
    setMessage(t('saved'));
  }

  async function approveProfile(profile: Profile) {
    if (!selectedClubId) return;

    const role = pendingRoles[profile.id] ?? 'viewer';
    setSavingId(profile.id);
    setError('');
    setMessage('');

    const supabase = createClient();
    const { error: insertError } = await supabase
      .from('club_memberships')
      .insert({
        club_id: selectedClubId,
        user_id: profile.id,
        role,
      });

    setSavingId(null);
    if (insertError) {
      setError(insertError.message);
      return;
    }

    setMessage(t('approved'));
    await loadProfiles();
  }

  async function removeProfile(profile: TeamMember) {
    if (!selectedClubId) return;

    if (profile.id === currentUserId) {
      setError(t('selfRemoveBlocked'));
      return;
    }

    if (profile.membershipRole === 'owner' && ownerCount <= 1) {
      setError(t('lastOwnerBlocked'));
      return;
    }

    if (!window.confirm(t('removeConfirm'))) return;

    setSavingId(profile.id);
    setError('');
    setMessage('');

    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from('club_memberships')
      .delete()
      .eq('club_id', selectedClubId)
      .eq('user_id', profile.id);

    setSavingId(null);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setMessage(t('removed'));
    await loadProfiles();
  }

  function roleBadge(role: UserRole) {
    if (role === 'owner') return <Badge variant="success">{t('roles.owner')}</Badge>;
    if (role === 'admin') return <Badge variant="warning">{t('roles.admin')}</Badge>;
    return <Badge variant="default">{t('roles.viewer')}</Badge>;
  }

  if (!authorized) {
    return <p className="text-gray-500">{tc('loading')}</p>;
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

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {ROLES.map((role) => (
          <div key={role} className="card flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                {t(`roles.${role}`)}
              </p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {profiles.filter((profile) => profile.membershipRole === role).length}
              </p>
            </div>
            <ShieldCheck className="text-primary-500" size={22} />
          </div>
        ))}
      </div>

      {error && <p className="mb-3 text-sm text-danger-500">{error}</p>}
      {message && <p className="mb-3 text-sm text-success-600">{message}</p>}

      {loading ? (
        <p className="text-gray-500">{tc('loading')}</p>
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
                  <div key={profile.id} className="flex flex-col gap-3 rounded-lg border border-amber-100 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">{profile.full_name}</p>
                      {profile.email && <p className="text-xs text-gray-500">{profile.email}</p>}
                      <p className="text-xs text-gray-500">{formatDateTime(profile.created_at, locale)}</p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <select
                        className="input-field h-10 w-full sm:w-36"
                        value={pendingRoles[profile.id] ?? 'viewer'}
                        disabled={savingId === profile.id}
                        onChange={(event) =>
                          setPendingRoles((current) => ({
                            ...current,
                            [profile.id]: event.target.value as UserRole,
                          }))
                        }
                      >
                        {ROLES.map((role) => (
                          <option key={role} value={role}>
                            {t(`roles.${role}`)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn-primary h-10"
                        disabled={savingId === profile.id}
                        onClick={() => approveProfile(profile)}
                      >
                        <UserPlus size={16} />
                        {t('approve')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {profiles.length === 0 ? (
            <div className="card py-12 text-center text-gray-500">{tc('noData')}</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                      {t('member')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                      {t('currentAccess')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                      {t('changeAccess')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                      {t('joined')}
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500">
                      {tc('actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {profiles.map((profile) => (
                    <tr key={profile.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{profile.full_name}</p>
                        {profile.email && <p className="text-xs text-gray-500">{profile.email}</p>}
                        {profile.id === currentUserId && (
                          <p className="text-xs text-gray-400">{t('you')}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">{roleBadge(profile.membershipRole)}</td>
                      <td className="px-4 py-3">
                        <select
                          className="input-field w-40"
                          value={profile.membershipRole}
                          disabled={savingId === profile.id}
                          onChange={(event) => updateRole(profile, event.target.value as UserRole)}
                        >
                          {ROLES.map((role) => (
                            <option key={role} value={role}>
                              {t(`roles.${role}`)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{formatDateTime(profile.membershipCreatedAt, locale)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-danger-100 px-3 text-xs font-semibold text-danger-600 transition hover:bg-danger-50 disabled:opacity-40"
                          disabled={savingId === profile.id || profile.id === currentUserId}
                          onClick={() => removeProfile(profile)}
                          aria-label={t('removeAccess')}
                        >
                          <Trash2 size={16} />
                          {t('removeAccess')}
                        </button>
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

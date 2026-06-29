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
import { ShieldCheck, Users } from 'lucide-react';
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
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadProfiles = useCallback(async () => {
    if (!selectedClubId) {
      setProfiles([]);
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

    if (loadError) {
      setError(loadError.message);
      setProfiles([]);
      setLoading(false);
      return;
    }

    const userIds = ((memberships ?? []) as Array<{ user_id: string }>).map((membership) => membership.user_id);

    if (userIds.length === 0) {
      setProfiles([]);
      setLoading(false);
      return;
    }

    const { data: profileRows, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, role, created_at, updated_at')
      .in('id', userIds)
      .order('full_name', { ascending: true });

    if (profileError) {
      setError(profileError.message);
      setProfiles([]);
    } else {
      const membershipByUser = new Map(
        ((memberships ?? []) as Array<{ user_id: string; role: UserRole; created_at: string }>).map((membership) => [
          membership.user_id,
          membership,
        ]),
      );
      setProfiles(
        (((profileRows as Profile[] | null) ?? []).map((profile) => {
          const membership = membershipByUser.get(profile.id);
          return {
            ...profile,
            membershipRole: membership?.role ?? 'viewer',
            membershipCreatedAt: membership?.created_at ?? profile.created_at,
          };
        }) as TeamMember[]),
      );
    }
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
      ) : profiles.length === 0 ? (
        <div className="card py-12 text-center text-gray-500">{tc('noData')}</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
          <table className="w-full min-w-[760px] text-sm">
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
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {profiles.map((profile) => (
                <tr key={profile.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{profile.full_name}</p>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

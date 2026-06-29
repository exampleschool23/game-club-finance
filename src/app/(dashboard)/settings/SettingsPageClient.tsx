'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { PageHeader } from '@/components/ui/PageHeader';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { createClient } from '@/lib/supabase/client';
import { useClub } from '@/components/layout/DashboardShell';

interface SettingsPageClientProps {
  email?: string | null;
  fullName?: string | null;
  role?: string | null;
}

export function SettingsPageClient({ email, fullName, role }: SettingsPageClientProps) {
  const t = useTranslations('settings');
  const { memberships, role: clubRole, selectedClub, setSelectedClubId, refreshClubs } = useClub();
  const [account, setAccount] = useState({
    email,
    fullName,
    role,
  });
  const [clubForm, setClubForm] = useState({ name: '', address: '' });
  const [clubSaving, setClubSaving] = useState(false);
  const [clubMessage, setClubMessage] = useState('');
  const [clubError, setClubError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadAccount() {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) return;

      const { data } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', session.user.id)
        .maybeSingle();

      if (!cancelled) {
        setAccount({
          email: session.user.email,
          fullName: data?.full_name,
          role: data?.role,
        });
      }
    }

    loadAccount().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreateClub(event: React.FormEvent) {
    event.preventDefault();
    if (!clubForm.name.trim()) {
      setClubError(t('clubNameRequired'));
      return;
    }

    setClubSaving(true);
    setClubMessage('');
    setClubError('');

    const supabase = createClient();
    const { data, error } = await supabase.rpc('create_club_with_owner', {
      p_name: clubForm.name.trim(),
      p_address: clubForm.address.trim() || null,
    });

    setClubSaving(false);

    if (error) {
      setClubError(error.message);
      return;
    }

    const createdClub = Array.isArray(data) ? data[0] : data;
    if (createdClub?.id) {
      setSelectedClubId(createdClub.id);
    }
    setClubForm({ name: '', address: '' });
    setClubMessage(t('clubCreated'));
    await refreshClubs();
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <PageHeader title={t('title')} />

      <div className="space-y-4">
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {t('language')}
          </h2>
          <LanguageSwitcher />
        </div>

        <div className="card">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {t('account')}
          </h2>
          <div className="space-y-1 text-sm">
            <p className="text-gray-700">
              <span className="font-medium">{t('emailLabel')}: </span>
              {account.email ?? '-'}
            </p>
            {account.fullName && (
              <p className="text-gray-700">
                <span className="font-medium">{t('nameLabel')}: </span>
                {account.fullName}
              </p>
            )}
            {account.role && (
              <p className="text-gray-700">
                <span className="font-medium">{t('roleLabel')}: </span>
                <span className="capitalize">{account.role}</span>
              </p>
            )}
          </div>
        </div>

        <div className="card">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {t('clubs')}
          </h2>
          <div className="space-y-2 text-sm">
            {memberships.map((membership) => (
              <button
                key={membership.club.id}
                type="button"
                onClick={() => setSelectedClubId(membership.club.id)}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left ${
                  selectedClub?.id === membership.club.id
                    ? 'border-primary-200 bg-primary-50 text-primary-800'
                    : 'border-gray-100 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className="font-semibold">{membership.club.name}</span>
                <span className="text-xs capitalize text-gray-500">{membership.role}</span>
              </button>
            ))}
          </div>

          {clubRole === 'owner' && (
            <form onSubmit={handleCreateClub} className="mt-4 space-y-3 border-t border-gray-100 pt-4">
              <div>
                <label className="label">{t('clubName')}</label>
                <input
                  className="input-field"
                  value={clubForm.name}
                  onChange={(event) => setClubForm((current) => ({ ...current, name: event.target.value }))}
                />
              </div>
              <div>
                <label className="label">{t('clubAddress')}</label>
                <input
                  className="input-field"
                  value={clubForm.address}
                  onChange={(event) => setClubForm((current) => ({ ...current, address: event.target.value }))}
                />
              </div>
              {clubError && <p className="text-sm text-danger-500">{clubError}</p>}
              {clubMessage && <p className="text-sm text-success-600">{clubMessage}</p>}
              <button type="submit" className="btn-primary" disabled={clubSaving}>
                {clubSaving ? t('savingClub') : t('createClub')}
              </button>
            </form>
          )}
        </div>

        <div className="card">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {t('appInfo')}
          </h2>
          <p className="text-sm text-gray-500">{t('version')}: 2.0.0</p>
          <p className="text-sm text-gray-500 mt-1">GameClub Finance</p>
        </div>
      </div>
    </div>
  );
}

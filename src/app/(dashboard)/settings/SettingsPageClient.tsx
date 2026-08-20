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

function hourToTimeValue(hour: number | null | undefined): string {
  const safeHour = Number.isInteger(hour) && Number(hour) >= 0 && Number(hour) <= 23 ? Number(hour) : 0;
  return `${String(safeHour).padStart(2, '0')}:00`;
}

function timeValueToHour(value: string): number | null {
  const [hour = '', minute = ''] = value.split(':');
  const parsedHour = Number(hour);
  const parsedMinute = Number(minute);

  if (!Number.isInteger(parsedHour) || parsedHour < 0 || parsedHour > 23) return null;
  if (!Number.isInteger(parsedMinute) || parsedMinute < 0 || parsedMinute > 59) return null;

  return parsedHour;
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
  const [businessDayStartTime, setBusinessDayStartTime] = useState('00:00');
  const [businessDaySaving, setBusinessDaySaving] = useState(false);
  const [businessDayMessage, setBusinessDayMessage] = useState('');
  const [businessDayError, setBusinessDayError] = useState('');
  const [accountLoadError, setAccountLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadAccount() {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) return;

      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', session.user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!cancelled) {
        setAccount({
          email: session.user.email,
          fullName: data?.full_name,
          role: data?.role,
        });
      }
    }

    loadAccount().catch((loadError) => {
      if (!cancelled) {
        setAccountLoadError(loadError instanceof Error ? loadError.message : String(loadError));
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setBusinessDayStartTime(hourToTimeValue(selectedClub?.business_day_start_hour));
    setBusinessDayMessage('');
    setBusinessDayError('');
  }, [selectedClub?.business_day_start_hour, selectedClub?.id]);

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

  async function handleSaveBusinessDay(event: React.FormEvent) {
    event.preventDefault();

    const hour = timeValueToHour(businessDayStartTime);
    if (!selectedClub || clubRole !== 'owner' || hour === null) {
      setBusinessDayError(t('businessDayInvalid'));
      return;
    }

    setBusinessDaySaving(true);
    setBusinessDayMessage('');
    setBusinessDayError('');

    const supabase = createClient();
    const { error } = await supabase
      .from('clubs')
      .update({
        business_day_start_hour: hour,
        updated_at: new Date().toISOString(),
      })
      .eq('id', selectedClub.id);

    setBusinessDaySaving(false);

    if (error) {
      setBusinessDayError(error.message);
      return;
    }

    setBusinessDayMessage(t('businessDaySaved'));
    await refreshClubs();
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <PageHeader title={t('title')} />

      <div className="space-y-4">
        {accountLoadError && (
          <p className="rounded-lg bg-danger-50 p-3 text-sm text-danger-600">{accountLoadError}</p>
        )}
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
            {t('businessDay')}
          </h2>
          <form onSubmit={handleSaveBusinessDay} className="space-y-3">
            <div>
              <label className="label">{t('businessDayStartTime')}</label>
              <input
                type="time"
                step={3600}
                className="input-field"
                value={businessDayStartTime}
                disabled={!selectedClub || clubRole !== 'owner' || businessDaySaving}
                onChange={(event) => setBusinessDayStartTime(event.target.value)}
              />
              <p className="mt-2 text-xs leading-5 text-gray-500">
                {t('businessDayHelp')}
              </p>
            </div>
            {businessDayError && <p className="text-sm text-danger-500">{businessDayError}</p>}
            {businessDayMessage && <p className="text-sm text-success-600">{businessDayMessage}</p>}
            {clubRole === 'owner' ? (
              <button type="submit" className="btn-primary" disabled={!selectedClub || businessDaySaving}>
                {businessDaySaving ? t('savingBusinessDay') : t('saveBusinessDay')}
              </button>
            ) : (
              <p className="text-sm text-gray-500">{t('businessDayOwnerOnly')}</p>
            )}
          </form>
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

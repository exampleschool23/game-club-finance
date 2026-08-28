'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Banknote,
  Building2,
  Check,
  Clock3,
  CreditCard,
  MapPin,
  Plus,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { createClient } from '@/lib/supabase/client';
import { useClub } from '@/components/layout/DashboardShell';
import { normalizePaymentMethods } from '@/lib/paymentMethods';
import { PAYMENT_METHODS, type EntryPaymentMethod } from '@/types';

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
  const tc = useTranslations('common');
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
  const [createClubOpen, setCreateClubOpen] = useState(false);
  const [businessDayStartTime, setBusinessDayStartTime] = useState('00:00');
  const [businessDaySaving, setBusinessDaySaving] = useState(false);
  const [businessDayMessage, setBusinessDayMessage] = useState('');
  const [businessDayError, setBusinessDayError] = useState('');
  const [paymentMethods, setPaymentMethods] = useState<EntryPaymentMethod[]>([...PAYMENT_METHODS]);
  const [paymentMethodsSaving, setPaymentMethodsSaving] = useState(false);
  const [paymentMethodsMessage, setPaymentMethodsMessage] = useState('');
  const [paymentMethodsError, setPaymentMethodsError] = useState('');
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

  useEffect(() => {
    setPaymentMethods(normalizePaymentMethods(selectedClub?.enabled_payment_methods));
    setPaymentMethodsMessage('');
    setPaymentMethodsError('');
  }, [selectedClub?.enabled_payment_methods, selectedClub?.id]);

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
    setCreateClubOpen(false);
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

  function togglePaymentMethod(method: EntryPaymentMethod) {
    setPaymentMethodsMessage('');
    setPaymentMethodsError('');
    setPaymentMethods((current) => {
      if (!current.includes(method)) {
        return PAYMENT_METHODS.filter((candidate) => current.includes(candidate) || candidate === method);
      }
      if (current.length === 1) {
        setPaymentMethodsError(t('paymentMethodsRequired'));
        return current;
      }
      return current.filter((candidate) => candidate !== method);
    });
  }

  async function handleSavePaymentMethods(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedClub || clubRole !== 'owner' || paymentMethods.length === 0) {
      setPaymentMethodsError(t('paymentMethodsRequired'));
      return;
    }

    setPaymentMethodsSaving(true);
    setPaymentMethodsMessage('');
    setPaymentMethodsError('');

    const supabase = createClient();
    const { error } = await supabase
      .from('clubs')
      .update({
        enabled_payment_methods: paymentMethods,
        updated_at: new Date().toISOString(),
      })
      .eq('id', selectedClub.id);

    setPaymentMethodsSaving(false);
    if (error) {
      setPaymentMethodsError(error.message);
      return;
    }

    setPaymentMethodsMessage(t('paymentMethodsSaved'));
    await refreshClubs();
  }

  const savedPaymentMethods = normalizePaymentMethods(selectedClub?.enabled_payment_methods);
  const paymentMethodsChanged = paymentMethods.join(',') !== savedPaymentMethods.join(',');
  const businessDayChanged = businessDayStartTime !== hourToTimeValue(selectedClub?.business_day_start_hour);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title={t('title')} description={t('description')} action={<LanguageSwitcher />} />

      {accountLoadError && (
        <p className="mb-4 rounded-xl border border-danger-100 bg-danger-50 p-3 text-sm text-danger-600">{accountLoadError}</p>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3.5">
              <div>
                <h2 className="font-bold text-gray-950">{t('clubs')}</h2>
                <p className="mt-0.5 text-xs text-gray-500">{t('selectClubHelp')}</p>
              </div>
              {clubRole === 'owner' && (
                <button
                  type="button"
                  aria-label={t('addClub')}
                  onClick={() => {
                    setCreateClubOpen((current) => !current);
                    setClubError('');
                    setClubMessage('');
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary-700 transition hover:bg-primary-100"
                >
                  {createClubOpen ? <X size={18} /> : <Plus size={18} />}
                </button>
              )}
            </div>

            <div className="space-y-1.5 p-2">
              {memberships.map((membership) => {
                const selected = selectedClub?.id === membership.club.id;
                return (
                  <button
                    key={membership.club.id}
                    type="button"
                    onClick={() => setSelectedClubId(membership.club.id)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition ${
                      selected ? 'bg-primary-50 text-primary-800' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${selected ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                      <Building2 size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{membership.club.name}</span>
                      <span className="block text-xs capitalize text-gray-500">{membership.role}</span>
                    </span>
                    {selected && <Check size={17} className="shrink-0 text-primary-600" />}
                  </button>
                );
              })}
            </div>

            {createClubOpen && clubRole === 'owner' && (
              <form onSubmit={handleCreateClub} className="space-y-3 border-t border-gray-100 bg-gray-50/70 p-4">
                <div>
                  <label className="label" htmlFor="new-club-name">{t('clubName')}</label>
                  <input
                    id="new-club-name"
                    autoFocus
                    className="input-field"
                    value={clubForm.name}
                    onChange={(event) => setClubForm((current) => ({ ...current, name: event.target.value }))}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="new-club-address">{t('clubAddress')}</label>
                  <input
                    id="new-club-address"
                    className="input-field"
                    value={clubForm.address}
                    onChange={(event) => setClubForm((current) => ({ ...current, address: event.target.value }))}
                  />
                </div>
                {clubError && <p className="text-sm text-danger-500">{clubError}</p>}
                <button type="submit" className="btn-primary w-full" disabled={clubSaving}>
                  {clubSaving ? t('savingClub') : t('createClub')}
                </button>
              </form>
            )}
            {clubMessage && <p className="border-t border-gray-100 px-4 py-3 text-sm text-success-600">{clubMessage}</p>}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600">
                <UserRound size={19} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">{account.fullName || t('account')}</p>
                <p className="truncate text-xs text-gray-500">{account.email ?? '-'}</p>
              </div>
            </div>
            {account.role && (
              <span className="mt-3 inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold capitalize text-gray-600">
                {account.role}
              </span>
            )}
          </section>
        </aside>

        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-5 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wider text-primary-600">{t('clubSettings')}</p>
                <h2 className="mt-1 truncate text-xl font-bold text-gray-950">{selectedClub?.name ?? t('clubs')}</h2>
                {selectedClub?.address && (
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500"><MapPin size={14} />{selectedClub.address}</p>
                )}
              </div>
              <span className="inline-flex w-fit rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold capitalize text-primary-700">
                {clubRole}
              </span>
            </div>
          </div>

          <form onSubmit={handleSaveBusinessDay} className="grid gap-5 border-b border-gray-100 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_190px] sm:px-6">
            <div className="flex gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600"><Clock3 size={19} /></span>
              <div>
                <h3 className="font-bold text-gray-900">{t('businessDay')}</h3>
                <p className="mt-1 max-w-xl text-sm leading-5 text-gray-500">{t('businessDayHelp')}</p>
              </div>
            </div>
            <div className="space-y-2">
              <label className="label" htmlFor="business-day-time">{t('businessDayStartTime')}</label>
              <input
                id="business-day-time"
                type="time"
                step={3600}
                className="input-field h-11"
                value={businessDayStartTime}
                disabled={!selectedClub || clubRole !== 'owner' || businessDaySaving}
                onChange={(event) => {
                  setBusinessDayStartTime(event.target.value);
                  setBusinessDayMessage('');
                  setBusinessDayError('');
                }}
              />
              {businessDayError && <p className="text-sm text-danger-500">{businessDayError}</p>}
              {businessDayMessage && <p className="text-sm text-success-600">{businessDayMessage}</p>}
              {clubRole === 'owner' ? (
                <button type="submit" className="btn-primary w-full" disabled={!selectedClub || businessDaySaving || !businessDayChanged}>
                  {businessDaySaving ? t('savingBusinessDay') : t('saveBusinessDay')}
                </button>
              ) : <p className="text-xs text-gray-500">{t('businessDayOwnerOnly')}</p>}
            </div>
          </form>

          <form onSubmit={handleSavePaymentMethods} className="px-5 py-5 sm:px-6">
            <div className="flex gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600"><CreditCard size={19} /></span>
              <div>
                <h3 className="font-bold text-gray-900">{t('paymentMethods')}</h3>
                <p className="mt-1 max-w-xl text-sm leading-5 text-gray-500">{t('paymentMethodsHelp')}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {PAYMENT_METHODS.map((method) => {
                const enabled = paymentMethods.includes(method);
                const MethodIcon = method === 'cash' ? Banknote : method === 'terminal' ? CreditCard : WalletCards;
                return (
                  <button
                    key={method}
                    type="button"
                    aria-pressed={enabled}
                    disabled={!selectedClub || clubRole !== 'owner' || paymentMethodsSaving}
                    onClick={() => togglePaymentMethod(method)}
                    className={`group flex min-h-24 flex-col items-start justify-between rounded-xl border p-3.5 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      enabled
                        ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500'
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <span className="flex w-full items-center justify-between">
                      <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${enabled ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-500'}`}><MethodIcon size={18} /></span>
                      <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${enabled ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-300 bg-white'}`}>
                        {enabled && <Check size={13} strokeWidth={3} />}
                      </span>
                    </span>
                    <span>
                      <span className={`block text-sm font-bold ${enabled ? 'text-primary-800' : 'text-gray-700'}`}>{tc(`paymentMethods.${method}`)}</span>
                      <span className={`mt-0.5 block text-xs font-medium ${enabled ? 'text-primary-600' : 'text-gray-400'}`}>{enabled ? t('enabled') : t('disabled')}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                {paymentMethodsError && <p className="text-sm text-danger-500">{paymentMethodsError}</p>}
                {paymentMethodsMessage && <p className="text-sm text-success-600">{paymentMethodsMessage}</p>}
                {!paymentMethodsError && !paymentMethodsMessage && <p className="text-xs text-gray-400">{t('paymentMethodsHint')}</p>}
              </div>
              {clubRole === 'owner' ? (
                <button type="submit" className="btn-primary shrink-0" disabled={!selectedClub || paymentMethodsSaving || !paymentMethodsChanged}>
                  {paymentMethodsSaving ? t('savingPaymentMethods') : t('savePaymentMethods')}
                </button>
              ) : <p className="text-sm text-gray-500">{t('paymentMethodsOwnerOnly')}</p>}
            </div>
          </form>
        </section>
      </div>

      <p className="mt-5 text-center text-xs text-gray-400">GameClub Finance · {t('version')} 2.0.0</p>
    </div>
  );
}

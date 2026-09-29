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
import { MigrationHealthPanel } from './MigrationHealthPanel';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  IconButton,
  InlineAlert,
  Input,
  LanguageSwitcher,
  PageHeader,
  SectionHeading,
  Select,
  useToast,
} from '@/components/PresentationFoundation';
import { createClient } from '@/lib/supabase/client';
import { useClub } from '@/components/layout/DashboardShell';
import { normalizePaymentMethods } from '@/lib/paymentMethods';
import { normalizeBusinessDayStartHour } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { PAYMENT_METHODS, type EntryPaymentMethod } from '@/types';

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

export function SettingsPageClient() {
  const t = useTranslations('settings');
  const tc = useTranslations('common');
  const { memberships, role: clubRole, selectedClub, setSelectedClubId, refreshClubs } = useClub();
  const { showToast, toastElement } = useToast();
  const [account, setAccount] = useState<{ email?: string | null; fullName?: string | null; role?: string | null }>({});
  const [accountLoading, setAccountLoading] = useState(true);
  const [clubForm, setClubForm] = useState({ name: '', address: '' });
  const [clubSaving, setClubSaving] = useState(false);
  const [clubError, setClubError] = useState('');
  const [createClubOpen, setCreateClubOpen] = useState(false);
  const [businessDayStartHour, setBusinessDayStartHour] = useState(0);
  const [businessDaySaving, setBusinessDaySaving] = useState(false);
  const [businessDayError, setBusinessDayError] = useState('');
  const [paymentMethods, setPaymentMethods] = useState<EntryPaymentMethod[]>([...PAYMENT_METHODS]);
  const [paymentMethodsSaving, setPaymentMethodsSaving] = useState(false);
  const [paymentMethodsError, setPaymentMethodsError] = useState('');
  const [accountLoadError, setAccountLoadError] = useState('');
  const isOwner = clubRole === 'owner';

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

    loadAccount()
      .catch((loadError) => {
        if (!cancelled) {
          setAccountLoadError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      })
      .finally(() => {
        if (!cancelled) setAccountLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setBusinessDayStartHour(normalizeBusinessDayStartHour(selectedClub?.business_day_start_hour));
    setBusinessDayError('');
  }, [selectedClub?.business_day_start_hour, selectedClub?.id]);

  useEffect(() => {
    setPaymentMethods(normalizePaymentMethods(selectedClub?.enabled_payment_methods));
    setPaymentMethodsError('');
  }, [selectedClub?.enabled_payment_methods, selectedClub?.id]);

  async function handleCreateClub(event: React.FormEvent) {
    event.preventDefault();
    if (!clubForm.name.trim()) {
      setClubError(t('clubNameRequired'));
      return;
    }

    setClubSaving(true);
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
    setCreateClubOpen(false);
    showToast(t('clubCreated'));
    await refreshClubs();
  }

  async function handleSaveBusinessDay(event: React.FormEvent) {
    event.preventDefault();

    if (!selectedClub || !isOwner) {
      setBusinessDayError(t('businessDayInvalid'));
      return;
    }

    setBusinessDaySaving(true);
    setBusinessDayError('');

    const supabase = createClient();
    const { error } = await supabase
      .from('clubs')
      .update({
        business_day_start_hour: businessDayStartHour,
        updated_at: new Date().toISOString(),
      })
      .eq('id', selectedClub.id);

    setBusinessDaySaving(false);

    if (error) {
      setBusinessDayError(error.message);
      return;
    }

    showToast(t('businessDaySaved'));
    await refreshClubs();
  }

  function togglePaymentMethod(method: EntryPaymentMethod) {
    setPaymentMethodsError('');
    if (!paymentMethods.includes(method)) {
      setPaymentMethods(PAYMENT_METHODS.filter((candidate) => paymentMethods.includes(candidate) || candidate === method));
      return;
    }
    if (paymentMethods.length === 1) {
      setPaymentMethodsError(t('paymentMethodsRequired'));
      return;
    }
    setPaymentMethods(paymentMethods.filter((candidate) => candidate !== method));
  }

  async function handleSavePaymentMethods(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedClub || !isOwner || paymentMethods.length === 0) {
      setPaymentMethodsError(t('paymentMethodsRequired'));
      return;
    }

    setPaymentMethodsSaving(true);
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

    showToast(t('paymentMethodsSaved'));
    await refreshClubs();
  }

  const savedPaymentMethods = normalizePaymentMethods(selectedClub?.enabled_payment_methods);
  const paymentMethodsChanged = paymentMethods.join(',') !== savedPaymentMethods.join(',');
  const businessDayChanged = businessDayStartHour !== normalizeBusinessDayStartHour(selectedClub?.business_day_start_hour);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title={t('title')} description={t('description')} action={<LanguageSwitcher />} />

      {accountLoadError && <InlineAlert variant="danger" className="mb-4">{accountLoadError}</InlineAlert>}

      <div className="grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <Card as="section" padding="none" className="overflow-hidden">
            <CardHeader className="py-3.5">
              <SectionHeading
                size="sm"
                title={t('clubs')}
                description={t('selectClubHelp')}
                action={isOwner ? (
                  <IconButton
                    variant="soft"
                    size="sm"
                    label={t('addClub')}
                    aria-expanded={createClubOpen}
                    icon={createClubOpen ? <X size={18} /> : <Plus size={18} />}
                    onClick={() => {
                      setCreateClubOpen((current) => !current);
                      setClubError('');
                    }}
                  />
                ) : undefined}
              />
            </CardHeader>

            <div className="space-y-1.5 p-2" role="listbox" aria-label={t('clubs')}>
              {memberships.map((membership) => {
                const selected = selectedClub?.id === membership.club.id;
                return (
                  <button
                    key={membership.club.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => setSelectedClubId(membership.club.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
                      selected ? 'bg-primary-50 text-primary-800' : 'text-gray-700 hover:bg-gray-50',
                    )}
                  >
                    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', selected ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-500')}>
                      <Building2 size={17} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{membership.club.name}</span>
                      <span className="block text-xs capitalize text-gray-500">{membership.role}</span>
                    </span>
                    {selected && <Check size={17} className="shrink-0 text-primary-600" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>

            {createClubOpen && isOwner && (
              <form onSubmit={handleCreateClub} className="space-y-3 border-t border-gray-100 bg-gray-50/70 p-4">
                <Field label={t('clubName')} htmlFor="new-club-name" required>
                  <Input
                    id="new-club-name"
                    autoFocus
                    maxLength={120}
                    value={clubForm.name}
                    onChange={(event) => setClubForm((current) => ({ ...current, name: event.target.value }))}
                  />
                </Field>
                <Field label={t('clubAddress')} htmlFor="new-club-address">
                  <Input
                    id="new-club-address"
                    maxLength={200}
                    value={clubForm.address}
                    onChange={(event) => setClubForm((current) => ({ ...current, address: event.target.value }))}
                  />
                </Field>
                {clubError && <InlineAlert variant="danger">{clubError}</InlineAlert>}
                <Button type="submit" fullWidth loading={clubSaving} loadingLabel={t('savingClub')}>{t('createClub')}</Button>
              </form>
            )}
          </Card>

          <Card as="section">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600">
                <UserRound size={19} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                {accountLoading ? (
                  <div className="space-y-2" role="status" aria-label={tc('loading')}>
                    <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
                    <div className="h-3 w-40 animate-pulse rounded bg-gray-100" />
                  </div>
                ) : (
                  <>
                    <p className="truncate text-sm font-semibold text-gray-900">{account.fullName || t('account')}</p>
                    <p className="truncate text-xs text-gray-500">{account.email ?? '—'}</p>
                  </>
                )}
              </div>
            </div>
            {account.role && <Badge variant="neutral" className="mt-3 capitalize">{account.role}</Badge>}
          </Card>
        </aside>

        <Card as="section" padding="none" className="overflow-hidden">
          <CardHeader className="py-5 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wider text-primary-600">{t('clubSettings')}</p>
                <h2 className="mt-1 truncate text-xl font-bold text-gray-950">{selectedClub?.name ?? t('clubs')}</h2>
                {selectedClub?.address && (
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500"><MapPin size={14} aria-hidden="true" />{selectedClub.address}</p>
                )}
              </div>
              <Badge variant="primary" className="w-fit capitalize">{clubRole}</Badge>
            </div>
          </CardHeader>

          <form onSubmit={handleSaveBusinessDay} className="grid gap-5 border-b border-gray-100 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_200px] sm:px-6">
            <SectionHeading
              icon={<Clock3 size={19} aria-hidden="true" />}
              iconClassName="bg-amber-50 text-amber-600"
              title={t('businessDay')}
              description={t('businessDayHelp')}
            />
            <div className="space-y-2">
              <Field label={t('businessDayStartTime')} htmlFor="business-day-hour" error={businessDayError || undefined}>
                <Select
                  id="business-day-hour"
                  value={businessDayStartHour}
                  disabled={!selectedClub || !isOwner || businessDaySaving}
                  onChange={(event) => {
                    setBusinessDayStartHour(Number(event.target.value));
                    setBusinessDayError('');
                  }}
                >
                  {HOURS.map((hour) => <option key={hour} value={hour}>{hourLabel(hour)}</option>)}
                </Select>
              </Field>
              {isOwner ? (
                <Button type="submit" fullWidth disabled={!selectedClub || !businessDayChanged} loading={businessDaySaving} loadingLabel={t('savingBusinessDay')}>
                  {t('saveBusinessDay')}
                </Button>
              ) : <p className="text-xs text-gray-500">{t('businessDayOwnerOnly')}</p>}
            </div>
          </form>

          <form onSubmit={handleSavePaymentMethods} className="px-5 py-5 sm:px-6">
            <SectionHeading
              icon={<CreditCard size={19} aria-hidden="true" />}
              title={t('paymentMethods')}
              description={t('paymentMethodsHelp')}
            />

            <div className="mt-4 grid gap-3 sm:grid-cols-3" role="group" aria-label={t('paymentMethods')}>
              {PAYMENT_METHODS.map((method) => {
                const enabled = paymentMethods.includes(method);
                const MethodIcon = method === 'cash' ? Banknote : method === 'terminal' ? CreditCard : WalletCards;
                return (
                  <button
                    key={method}
                    type="button"
                    aria-pressed={enabled}
                    disabled={!selectedClub || !isOwner || paymentMethodsSaving}
                    onClick={() => togglePaymentMethod(method)}
                    className={cn(
                      'group flex min-h-24 flex-col items-start justify-between rounded-xl border p-3.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-60',
                      enabled ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500' : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50',
                    )}
                  >
                    <span className="flex w-full items-center justify-between">
                      <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', enabled ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-500')}><MethodIcon size={18} aria-hidden="true" /></span>
                      <span className={cn('flex h-5 w-5 items-center justify-center rounded-full border', enabled ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-300 bg-white')} aria-hidden="true">
                        {enabled && <Check size={13} strokeWidth={3} />}
                      </span>
                    </span>
                    <span>
                      <span className={cn('block text-sm font-bold', enabled ? 'text-primary-800' : 'text-gray-700')}>{tc(`paymentMethods.${method}`)}</span>
                      <span className={cn('mt-0.5 block text-xs font-medium', enabled ? 'text-primary-600' : 'text-gray-400')}>{enabled ? t('enabled') : t('disabled')}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                {paymentMethodsError
                  ? <InlineAlert variant="danger" hideIcon className="py-2">{paymentMethodsError}</InlineAlert>
                  : <p className="text-xs text-gray-400">{t('paymentMethodsHint')}</p>}
              </div>
              {isOwner ? (
                <Button type="submit" className="shrink-0" disabled={!selectedClub || !paymentMethodsChanged} loading={paymentMethodsSaving} loadingLabel={t('savingPaymentMethods')}>
                  {t('savePaymentMethods')}
                </Button>
              ) : <p className="text-sm text-gray-500">{t('paymentMethodsOwnerOnly')}</p>}
            </div>
          </form>
        </Card>
      </div>

      {isOwner && selectedClub && <MigrationHealthPanel key={selectedClub.id} clubId={selectedClub.id} />}

      {toastElement}
    </div>
  );
}

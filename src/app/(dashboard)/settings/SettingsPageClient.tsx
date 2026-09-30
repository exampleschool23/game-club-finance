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
  Checkbox,
  Skeleton,
  useToast,
} from '@/components/PresentationFoundation';
import { createClient } from '@/lib/supabase/client';
import { useClub } from '@/components/layout/DashboardShell';
import { normalizePaymentMethods } from '@/lib/paymentMethods';
import { normalizeBusinessDayStartHour } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { PAYMENT_METHODS, type EntryPaymentMethod, type UserRole } from '@/types';

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

export function SettingsPageClient() {
  const t = useTranslations('settings');
  const tc = useTranslations('common');
  const tRoles = useTranslations('team.roles');
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
  const savedPaymentMethodsKey = normalizePaymentMethods(selectedClub?.enabled_payment_methods).join(',');

  function roleLabel(role: string | null | undefined): string {
    return role === 'owner' || role === 'admin' || role === 'viewer' ? tRoles(role as UserRole) : (role ?? '');
  }

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
          console.error('Failed to load account', loadError);
          setAccountLoadError(t('accountLoadError'));
        }
      })
      .finally(() => {
        if (!cancelled) setAccountLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    setBusinessDayStartHour(normalizeBusinessDayStartHour(selectedClub?.business_day_start_hour));
    setBusinessDayError('');
  }, [selectedClub?.business_day_start_hour, selectedClub?.id]);

  // Depend on the joined value, not the array reference: a silent club refresh
  // returns a new array and must not wipe an unsaved draft.
  useEffect(() => {
    setPaymentMethods(normalizePaymentMethods(savedPaymentMethodsKey ? savedPaymentMethodsKey.split(',') : []));
    setPaymentMethodsError('');
  }, [savedPaymentMethodsKey, selectedClub?.id]);

  async function handleCreateClub(event: React.FormEvent) {
    event.preventDefault();
    if (!clubForm.name.trim()) {
      setClubError(t('clubNameRequired'));
      return;
    }

    setClubSaving(true);
    setClubError('');

    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('create_club_with_owner', {
        p_name: clubForm.name.trim(),
        p_address: clubForm.address.trim() || null,
      });

      if (error) {
        console.error('Failed to create club', error);
        setClubError(t('saveError'));
        return;
      }

      setClubForm({ name: '', address: '' });
      setCreateClubOpen(false);
      showToast(t('clubCreated'));

      const createdClub = Array.isArray(data) ? data[0] : data;
      try {
        // Load the new membership first so the selection points at a known club.
        await refreshClubs();
      } catch (refreshError) {
        console.error('Failed to refresh clubs', refreshError);
      }
      if (createdClub?.id) {
        setSelectedClubId(createdClub.id);
      }
    } catch (saveError) {
      console.error('Failed to create club', saveError);
      setClubError(t('saveError'));
    } finally {
      setClubSaving(false);
    }
  }

  async function handleSaveBusinessDay(event: React.FormEvent) {
    event.preventDefault();

    if (!selectedClub || !isOwner) {
      setBusinessDayError(t('businessDayInvalid'));
      return;
    }

    setBusinessDaySaving(true);
    setBusinessDayError('');

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('clubs')
        .update({
          business_day_start_hour: businessDayStartHour,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedClub.id);

      if (error) {
        console.error('Failed to save business day', error);
        setBusinessDayError(t('saveError'));
        return;
      }

      showToast(t('businessDaySaved'));
      await refreshClubs();
    } catch (saveError) {
      console.error('Failed to save business day', saveError);
      setBusinessDayError(t('saveError'));
    } finally {
      setBusinessDaySaving(false);
    }
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

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('clubs')
        .update({
          enabled_payment_methods: paymentMethods,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedClub.id);

      if (error) {
        console.error('Failed to save payment methods', error);
        setPaymentMethodsError(t('saveError'));
        return;
      }

      showToast(t('paymentMethodsSaved'));
      await refreshClubs();
    } catch (saveError) {
      console.error('Failed to save payment methods', saveError);
      setPaymentMethodsError(t('saveError'));
    } finally {
      setPaymentMethodsSaving(false);
    }
  }

  const paymentMethodsChanged = paymentMethods.join(',') !== savedPaymentMethodsKey;
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

            <ul className="space-y-1.5 p-2" aria-label={t('clubs')}>
              {memberships.map((membership) => {
                const selected = selectedClub?.id === membership.club.id;
                return (
                  <li key={membership.club.id}>
                    <button
                      type="button"
                      aria-current={selected ? 'true' : undefined}
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
                        <span className="block text-xs text-gray-500">{roleLabel(membership.role)}</span>
                      </span>
                      {selected && <Check size={17} className="shrink-0 text-primary-600" aria-hidden="true" />}
                    </button>
                  </li>
                );
              })}
            </ul>

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
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-40 bg-gray-100" />
                  </div>
                ) : (
                  <>
                    <p className="truncate text-sm font-semibold text-gray-900">{account.fullName || t('account')}</p>
                    <p className="truncate text-xs text-gray-500">{account.email ?? '—'}</p>
                  </>
                )}
              </div>
            </div>
            {account.role && <Badge variant="neutral" className="mt-3">{roleLabel(account.role)}</Badge>}
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
              <Badge variant="primary" className="w-fit">{roleLabel(clubRole)}</Badge>
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
                  <Checkbox
                    key={method}
                    variant="card"
                    checked={enabled}
                    disabled={!selectedClub || !isOwner || paymentMethodsSaving}
                    onChange={() => togglePaymentMethod(method)}
                    label={(
                      <span className="flex items-center gap-2">
                        <MethodIcon size={16} aria-hidden="true" className={enabled ? 'text-primary-600' : 'text-gray-400'} />
                        {tc(`paymentMethods.${method}`)}
                      </span>
                    )}
                    description={enabled ? t('enabled') : t('disabled')}
                  />
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

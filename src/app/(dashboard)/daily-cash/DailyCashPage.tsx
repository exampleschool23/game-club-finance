'use client';

// Route: /daily-cash

import { useCallback, useEffect, useMemo, useRef, useState, type ElementType, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import {
  Banknote,
  Clock3,
  CreditCard,
  Gamepad2,
  MonitorSmartphone,
  RefreshCcw,
  Save,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { calculateFinancialReportTotals } from '@/lib/calculations/dailyReport';
import { canReadFinancialTotals } from '@/lib/permissions';
import { loadDailyCashSummary, emptyDailyCashSummary, type DailyCashSummary } from '@/lib/supabase/dailyCashSummary';
import { calculateGameClubIncome } from '@/lib/calculations/dailyCash';
import { canEditEntryForRole, getEditDeadline } from '@/lib/time/editWindow';
import { useClub } from '@/components/layout/DashboardShell';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CurrencyInput,
  DatePicker,
  Field,
  FormSkeleton,
  InlineAlert,
  MetricGridSkeleton,
  Money,
  PageHeader,
  SectionHeading,
  StatTile,
  Textarea,
  toneForAmount,
  useConfirm,
  useToast,
} from '@/components/PresentationFoundation';
import { useAppLocale } from '@/components/i18n/AppLocaleContext';
import { todayIso } from '@/lib/utils';
import { formatCurrency, formatCurrencyInput, formatDateTime, parseCurrencyInput } from '@/lib/formatters';
import type { DailyCashEntry } from '@/types';

interface CashFormData {
  date: string;
  cash_income: string;
  terminal_income: string;
  card_income: string;
  playstation_income: string;
  comment: string;
}

const emptyForm = (date = todayIso()): CashFormData => ({
  date,
  cash_income: '',
  terminal_income: '',
  card_income: '',
  playstation_income: '',
  comment: '',
});

function parseAmount(value: string): number {
  const parsed = parseCurrencyInput(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

function amountToInput(value: number | null | undefined): string {
  return value && value > 0 ? formatCurrencyInput(value) : '';
}

const savedBreakdownGrid: Record<number, string> = {
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
};

function formatRemaining(ms: number): string {
  const safe = Math.max(0, ms);
  const minutes = Math.floor(safe / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function entryToForm(entry: DailyCashEntry): CashFormData {
  return {
    date: entry.date,
    cash_income: amountToInput(entry.cash_income),
    terminal_income: amountToInput(entry.terminal_income),
    card_income: amountToInput(entry.card_income),
    playstation_income: amountToInput(entry.playstation_income),
    comment: entry.comment ?? '',
  };
}

interface PaymentCardProps {
  id: string;
  label: string;
  value: string;
  icon: ElementType;
  iconClassName: string;
  iconBgClassName: string;
  disabled: boolean;
  onChange: (value: string) => void;
}

function PaymentCard({ id, label, value, icon: Icon, iconClassName, iconBgClassName, disabled, onChange }: PaymentCardProps) {
  const amount = parseAmount(value);

  return (
    <Card padding="sm">
      <label htmlFor={id} className="flex items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconBgClassName}`}>
          <Icon size={19} className={iconClassName} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-bold text-gray-700">{label}</span>
          <span className="mt-1 block break-words text-lg font-bold leading-tight tabular-nums text-gray-950">
            <Money amount={amount} currencyClassName="text-[11px] text-gray-500" />
          </span>
        </span>
      </label>
      <CurrencyInput id={id} controlSize="sm" className="mt-3 font-semibold" value={value} disabled={disabled} onValueChange={onChange} />
    </Card>
  );
}

export default function DailyCashPage() {
  const t = useTranslations('dailyCash');
  const tc = useTranslations('common');
  const { selectedClubId, role: currentRole, businessDayStartHour, enabledPaymentMethods, featureAccess } = useClub();
  const { locale } = useAppLocale();
  const { showToast, toastElement } = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const businessToday = useMemo(() => todayIso(new Date(), businessDayStartHour), [businessDayStartHour]);
  const [form, setForm] = useState<CashFormData>(() => emptyForm(businessToday));
  const [entry, setEntry] = useState<DailyCashEntry | null>(null);
  const [createdByName, setCreatedByName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => new Date());
  const [financeSummary, setFinanceSummary] = useState<DailyCashSummary | null>(null);
  const canSeeNetProfit = canReadFinancialTotals(currentRole, featureAccess);
  const loadSequence = useRef(0);
  const cancelLoads = useCallback(() => { loadSequence.current++; }, []);
  const isOwner = currentRole === 'owner';

  useEffect(() => {
    setForm(emptyForm(businessToday));
  }, [businessToday, selectedClubId]);

  const fetchExisting = useCallback(
    async (date: string, { silent = false } = {}) => {
      const requestId = ++loadSequence.current;
      if (!selectedClubId) {
        setEntry(null);
        setForm(emptyForm(date));
        setFinanceSummary(null);
        setLoading(false);
        return;
      }

      const supabase = createClient();
      if (!silent) setLoading(true);
      setError('');

      try {
        const [cashRes, summary] = await Promise.all([
          supabase
            .from('daily_cash_entries')
            .select('*')
            .eq('club_id', selectedClubId)
            .eq('date', date)
            .maybeSingle(),
          loadDailyCashSummary(supabase, selectedClubId, date, canSeeNetProfit),
        ]);

        if (requestId !== loadSequence.current) return;
        const { data, error: fetchError } = cashRes;

        if (fetchError) {
          setError(fetchError.message);
          setEntry(null);
          setForm(emptyForm(date));
          setFinanceSummary(null);
          setLoading(false);
          return;
        }

        setFinanceSummary(summary);

        const cashEntry = data as DailyCashEntry | null;
        setEntry(cashEntry);
        setForm(cashEntry ? entryToForm(cashEntry) : emptyForm(date));

        if (cashEntry?.created_by) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', cashEntry.created_by)
            .maybeSingle();
          if (requestId !== loadSequence.current) return;
          setCreatedByName(profile?.full_name ?? '');
        } else {
          setCreatedByName('');
        }

        setLoading(false);
      } catch (loadError) {
        if (requestId !== loadSequence.current) return;
        setError(loadError instanceof Error ? loadError.message : String(loadError));
        setFinanceSummary(null);
        setLoading(false);
      }
    },
    [selectedClubId, canSeeNetProfit],
  );

  useEffect(() => {
    void fetchExisting(form.date);
    return cancelLoads;
  }, [form.date, fetchExisting, cancelLoads]);

  // The countdown is only shown to non-owners with a saved entry.
  const showCountdown = Boolean(entry) && !isOwner;
  useEffect(() => {
    if (!showCountdown) return;
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, [showCountdown]);

  function setField(field: keyof CashFormData, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setError('');
  }

  const values = useMemo(
    () => ({
      cashIncome: parseAmount(form.cash_income),
      terminalIncome: parseAmount(form.terminal_income),
      cardIncome: parseAmount(form.card_income),
      playstationIncome: parseAmount(form.playstation_income),
    }),
    [form.cash_income, form.terminal_income, form.card_income, form.playstation_income],
  );

  const total = calculateGameClubIncome(values);
  const totals = calculateFinancialReportTotals({ ...(financeSummary ?? emptyDailyCashSummary), manualIncome: total });
  const barSummary = { sales: totals.barSales, profit: totals.barSales - totals.barCost };
  const netProfit = totals.accountingNetProfit;
  const editable = entry ? canEditEntryForRole(currentRole, entry.created_at, now) : true;
  const locked = Boolean(entry && !editable);
  const deadline = entry ? getEditDeadline(entry.created_at) : null;
  const remainingMs = deadline ? deadline.getTime() - now.getTime() : 0;
  const disabled = loading || saving || locked;
  const isDirty = entry ? JSON.stringify(entryToForm(entry)) !== JSON.stringify(form) : Boolean(
    form.cash_income || form.terminal_income || form.card_income || form.playstation_income || form.comment,
  );

  async function handleSave(event: FormEvent) {
    event.preventDefault();

    if (locked) {
      setError(t('entryLocked'));
      return;
    }

    if (!selectedClubId) {
      setError(tc('error'));
      return;
    }

    if (form.date > businessToday) {
      setError(t('futureDateError'));
      return;
    }

    setSaving(true);
    setError('');

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const payload = {
      date: form.date,
      club_id: selectedClubId,
      cash_income: values.cashIncome,
      terminal_income: values.terminalIncome,
      card_income: values.cardIncome,
      playstation_income: values.playstationIncome,
      comment: form.comment.trim() ? form.comment.trim() : null,
      updated_at: new Date().toISOString(),
    };

    const result = entry
      ? await supabase.from('daily_cash_entries').update(payload).eq('id', entry.id).eq('club_id', selectedClubId)
      : await supabase.from('daily_cash_entries').insert({
          ...payload,
          created_by: session?.user?.id ?? null,
        });

    setSaving(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    showToast(entry ? t('entryUpdated') : t('entrySaved'));
    await fetchExisting(form.date, { silent: true });
  }

  async function handleDelete() {
    if (!entry || !isOwner || !selectedClubId) return;
    const confirmed = await confirm({
      title: tc('delete'),
      description: t('deleteConfirm'),
      confirmLabel: tc('delete'),
    });
    if (!confirmed) return;

    const supabase = createClient();
    setSaving(true);
    setError('');

    const { error: deleteError } = await supabase
      .from('daily_cash_entries')
      .delete()
      .eq('club_id', selectedClubId)
      .eq('id', entry.id);

    setSaving(false);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    showToast(t('entryDeleted'));
    setEntry(null);
    setForm(emptyForm(form.date));
    await fetchExisting(form.date, { silent: true });
  }

  function handleReset() {
    setError('');
    setForm(entry ? entryToForm(entry) : emptyForm(form.date));
  }

  const header = (
    <PageHeader
      title={t('title')}
      description={t('subtitle')}
      action={(
        <ButtonLink href="/reports" iconRight={<TrendingUp size={16} className="text-primary-600" aria-hidden="true" />}>
          {t('reports')}
        </ButtonLink>
      )}
    />
  );

  if (loading) {
    return (
      <div className="space-y-4">
        {header}
        <FormSkeleton />
        <MetricGridSkeleton count={3} className="xl:grid-cols-3" />
      </div>
    );
  }

  const paymentCards: Array<{ key: 'cash_income' | 'terminal_income' | 'card_income' | 'playstation_income'; label: string; icon: ElementType; bg: string; color: string; visible: boolean }> = [
    { key: 'cash_income', label: t('cash'), icon: Banknote, bg: 'bg-green-100', color: 'text-green-600', visible: enabledPaymentMethods.includes('cash') },
    { key: 'terminal_income', label: t('terminal'), icon: MonitorSmartphone, bg: 'bg-blue-100', color: 'text-blue-600', visible: enabledPaymentMethods.includes('terminal') },
    { key: 'card_income', label: t('card'), icon: CreditCard, bg: 'bg-purple-100', color: 'text-purple-600', visible: enabledPaymentMethods.includes('card') },
    { key: 'playstation_income', label: t('playstation'), icon: Gamepad2, bg: 'bg-amber-100', color: 'text-amber-600', visible: true },
  ];

  const savedBreakdown = entry
    ? [
        { label: t('cash'), amount: entry.cash_income, visible: enabledPaymentMethods.includes('cash') || entry.cash_income > 0 },
        { label: t('terminal'), amount: entry.terminal_income, visible: enabledPaymentMethods.includes('terminal') || entry.terminal_income > 0 },
        { label: t('card'), amount: entry.card_income, visible: enabledPaymentMethods.includes('card') || entry.card_income > 0 },
        { label: t('playstation'), amount: entry.playstation_income ?? 0, visible: true },
      ].filter((item) => item.visible)
    : [];

  return (
    <div className="space-y-4">
      {header}

      <Card as="form" onSubmit={handleSave}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <Field label={t('date')} className="w-full sm:max-w-[300px]">
            <DatePicker
              ariaLabel={t('date')}
              value={form.date}
              max={businessToday}
              onChange={(value) => setField('date', value)}
            />
          </Field>

          {entry && deadline && editable && (
            <Badge variant="success" icon={<Clock3 size={15} aria-hidden="true" />} className="self-start px-3 py-2 text-sm sm:self-end">
              {isOwner ? t('ownerAccessEdit') : (
                <>
                  {t('editUntil', { time: formatDateTime(deadline, locale) })}
                  <span className="ml-1 rounded-full bg-green-100 px-2 py-0.5 tabular-nums">{formatRemaining(remainingMs)}</span>
                </>
              )}
            </Badge>
          )}
        </div>

        <InlineAlert variant="info" title={t('gameClubOnly')} className="mt-4">
          {t('barSalesNote')}
        </InlineAlert>

        {locked && (
          <InlineAlert variant="warning" className="mt-4">{t('entryLocked')}</InlineAlert>
        )}

        <SectionHeading title={t('incomeByMethod')} description={t('enterIncome')} className="mt-5" />

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {paymentCards.filter((card) => card.visible).map((card) => (
            <PaymentCard
              key={card.key}
              id={`daily-cash-${card.key}`}
              label={card.label}
              value={form[card.key]}
              disabled={disabled}
              onChange={(value) => setField(card.key, value)}
              icon={card.icon}
              iconBgClassName={card.bg}
              iconClassName={card.color}
            />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">{t('totalGameClubIncome')}</p>
            <p className="mt-1 break-words text-2xl font-bold tabular-nums text-green-600">
              <Money amount={total} />
            </p>
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-100">
            <TrendingUp size={19} className="text-green-600" aria-hidden="true" />
          </span>
        </div>

        <div className={`mt-3 grid grid-cols-1 gap-3 ${canSeeNetProfit ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
          <StatTile label={t('barSales')} value={formatCurrency(barSummary.sales)} unit={tc('currency')} />
          <StatTile label={t('barProfit')} value={formatCurrency(barSummary.profit)} unit={tc('currency')} tone={toneForAmount(barSummary.profit)} />
          {canSeeNetProfit && financeSummary && (
            <StatTile label={t('netProfit')} value={formatCurrency(netProfit)} unit={tc('currency')} tone={toneForAmount(netProfit, 'primary')} />
          )}
        </div>

        <Field label={t('commentOptional')} htmlFor="daily-cash-comment" className="mt-6">
          <Textarea
            id="daily-cash-comment"
            maxLength={300}
            showCount
            placeholder={t('commentPlaceholder')}
            value={form.comment}
            disabled={disabled}
            onChange={(event) => setField('comment', event.target.value)}
          />
        </Field>

        {error && <InlineAlert variant="danger" className="mt-4">{error}</InlineAlert>}

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1.2fr]">
          <Button variant="outline" size="lg" disabled={saving || !isDirty} onClick={handleReset} icon={<RefreshCcw size={18} aria-hidden="true" />}>
            {t('reset')}
          </Button>
          <Button type="submit" size="lg" disabled={disabled} loading={saving} loadingLabel={tc('saving')} icon={<Save size={18} aria-hidden="true" />}>
            {t('saveEntry')}
          </Button>
        </div>
      </Card>

      {entry && (
        <Card as="section" padding="lg">
          <SectionHeading
            size="lg"
            title={t('todayEntry')}
            badge={<Badge variant="success">{t('savedBadge')}</Badge>}
            action={editable && isOwner ? (
              <Button variant="dangerOutline" size="sm" disabled={saving} onClick={handleDelete} icon={<Trash2 size={15} aria-hidden="true" />}>
                {tc('delete')}
              </Button>
            ) : undefined}
          />

          <div className={`mt-4 grid grid-cols-2 gap-3 ${savedBreakdownGrid[Math.min(savedBreakdown.length + 1, 5)]}`}>
            {savedBreakdown.map((item) => (
              <StatTile key={item.label} label={item.label} value={formatCurrency(item.amount)} unit={tc('currency')} variant="soft" size="sm" />
            ))}
            <StatTile
              label={t('total')}
              tone="success"
              variant="soft"
              size="sm"
              unit={tc('currency')}
              value={formatCurrency(calculateGameClubIncome({
                cashIncome: entry.cash_income,
                terminalIncome: entry.terminal_income,
                cardIncome: entry.card_income,
                playstationIncome: entry.playstation_income ?? 0,
              }))}
            />
          </div>

          <div className="mt-4 flex flex-col gap-2 rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between">
            <span>{t('createdLabel')} {formatDateTime(entry.created_at, locale)}</span>
            {createdByName && <span>{t('byLabel')} {createdByName}</span>}
          </div>

          <InlineAlert variant={editable ? 'warning' : 'info'} title={t('editWindowTitle')} className="mt-4">
            {editable
              ? isOwner
                ? t('ownerEditNote')
                : t('adminEditNote', { remaining: formatRemaining(remainingMs) })
              : t('entryLocked')}
          </InlineAlert>
        </Card>
      )}

      {toastElement}
      {confirmDialog}
    </div>
  );
}

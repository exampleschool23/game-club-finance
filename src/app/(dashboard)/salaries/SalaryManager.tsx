'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Banknote, Check, History, Pencil, Power, Users, Wallet, X } from 'lucide-react';
import { useClub } from '@/components/layout/DashboardShell';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  Checkbox,
  CurrencyInput,
  DataTable,
  DatePicker,
  EmptyState,
  Field,
  IconButton,
  InlineAlert,
  Input,
  MetricCard,
  MetricGridSkeleton,
  Modal,
  Money,
  PageHeader,
  SectionHeading,
  SegmentedControl,
  Select,
  StatTile,
  TableSkeleton,
  Textarea,
  useConfirm,
  useToast,
} from '@/components/PresentationFoundation';
import { useAppLocale } from '@/components/i18n/AppLocaleContext';
import { createClient } from '@/lib/supabase/client';
import { loadSalaries } from '@/lib/supabase/salaries';
import { calculateSalaries, salaryBalance, canDeleteSalaryRate, type SalaryEmployee, type SalaryEntry } from '@/lib/calculations/salaries';
import { formatCurrency, formatCurrencyInput, parseCurrencyInput, formatDateOnly, formatDateTime, formatYearMonth } from '@/lib/formatters';
import { defaultPaymentMethod } from '@/lib/paymentMethods';
import { canAccessFeature } from '@/lib/permissions';
import { todayIso } from '@/lib/utils';
import type { EntryPaymentMethod } from '@/types';

const employeeRoles = ['Manager', 'Admin', 'Cleaner'] as const;

function knownEmployeeRole(value: string) {
  return employeeRoles.find((role) => role.toLowerCase() === value.trim().toLowerCase());
}

type SetupMode = 'new' | 'salary' | 'kpi' | 'profile';
type SalaryView = 'operations' | 'employees' | 'history';
type EntryKind = SalaryEntry['kind'];

const emptyData: Awaited<ReturnType<typeof loadSalaries>> = { employees: [], rates: [], entries: [], monthlyProfit: [] };

export default function SalariesPage({ view = 'operations', employeeId }: { view?: SalaryView; employeeId?: string }) {
  const { selectedClubId } = useClub();
  if (!selectedClubId) return <MetricGridSkeleton count={3} className="sm:grid-cols-3" />;
  return <SalaryManager key={`${selectedClubId}:${view}:${employeeId ?? ''}`} clubId={selectedClubId} view={view} employeeId={employeeId} />;
}

function SalaryManager({ clubId, view, employeeId }: { clubId: string; view: SalaryView; employeeId?: string }) {
  const t = useTranslations('salaries');
  const tc = useTranslations('common');
  const tp = useTranslations('expenses');
  const { locale } = useAppLocale();
  const { businessDayStartHour, enabledPaymentMethods, role, featureAccess } = useClub();
  const { showToast, toastElement } = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const canEdit = canAccessFeature(role, featureAccess, 'salaries');
  const today = todayIso(new Date(), businessDayStartHour);
  const [data, setData] = useState(emptyData);
  const [loading, setLoading] = useState(true);
  const [deletion, setDeletion] = useState<{ id: string; kind: 'entry' | 'rate'; label: string } | null>(null);
  const [roleEdit, setRoleEdit] = useState<{ id: string; role: string } | null>(null);
  const [roleError, setRoleError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [formError, setFormError] = useState('');
  const [errorForm, setErrorForm] = useState<'entry' | 'employee' | null>(null);
  const [setupMode, setSetupMode] = useState<SetupMode>('new');
  const [entrySelected, setEntrySelected] = useState<SalaryEmployee | null>(null);
  const [selectedEmployee, setSelected] = useState<SalaryEmployee | null>(null);
  const [employeeForm, setEmployeeForm] = useState(() => ({ id: crypto.randomUUID(), name: '', job_title: '', date: today, salary_type: 'daily', amount: '0', kpi: '0', active: true }));
  const [entryForm, setEntryForm] = useState(() => ({ id: crypto.randomUUID(), kind: 'payment' as EntryKind, amount: '', date: today, comment: '', payment_method: defaultPaymentMethod(enabledPaymentMethods), payment_source: 'game_club' }));
  const generation = useRef(0);
  const mutating = useRef(false);
  const balances = useMemo(() => calculateSalaries({ ...data, throughDate: today }), [data, today]);
  const historyEmployee = data.employees.find((employee) => employee.id === employeeId);
  const currentRate = (id: string) => data.rates.filter((r) => !r.deleted_at && r.employee_id === id && r.effective_date <= today).sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0];
  const displayRate = (employee: SalaryEmployee) => currentRate(employee.id) ?? data.rates.filter((r) => !r.deleted_at && r.employee_id === employee.id).sort((a, b) => a.effective_date.localeCompare(b.effective_date))[0];
  const upcomingCount = data.employees.filter((e) => e.joined_on > today && displayRate(e)?.active).length;
  const activeCount = data.employees.filter((e) => currentRate(e.id)?.active).length;
  const due = data.employees.reduce((sum, e) => sum + Math.max(0, salaryBalance(balances[e.id] ?? [])), 0);
  const historyMonths = balances[employeeId ?? ''] ?? [];
  const paid = data.entries.filter((e) => !e.deleted_at && e.kind === 'payment').reduce((sum, e) => sum + Number(e.amount), 0);
  const roleLabel = (value: string) => {
    const known = knownEmployeeRole(value);
    return known ? t(`roles.${known}`) : value || t('noRole');
  };
  const currency = (value: number) => `${formatCurrency(value)} ${tc('currency')}`;

  const reload = useCallback(async ({ silent = false } = {}) => {
    const request = ++generation.current;
    if (!silent) setLoading(true);
    setLoadError(false);
    try {
      const next = await loadSalaries(clubId, today);
      if (request === generation.current) setData(next);
    } catch {
      if (request === generation.current) setLoadError(true);
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [clubId, today]);
  useEffect(() => {
    void reload();
    return () => { generation.current += 1; };
  }, [reload]);

  function openEmployee(employee: SalaryEmployee | null, mode: SetupMode = employee ? 'profile' : 'new') {
    if (saving || !canEdit) return;
    const rate = employee ? displayRate(employee) : undefined;
    setSetupMode(mode);
    setSelected(employee);
    setEmployeeForm({
      id: employee?.id ?? crypto.randomUUID(),
      name: employee?.name ?? '',
      job_title: knownEmployeeRole(employee?.job_title ?? '') ?? employee?.job_title ?? '',
      date: employee && employee.joined_on > today ? employee.joined_on : today,
      salary_type: rate?.salary_type ?? 'daily',
      amount: rate ? formatCurrencyInput(Number(rate.amount)) : '0',
      kpi: String(rate?.kpi_percent ?? 0),
      active: rate?.active ?? true,
    });
    setFormError('');
    requestAnimationFrame(() => document.getElementById('salary-employee-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  function openEntry(employee: SalaryEmployee | null, kind: EntryKind = 'payment') {
    if (saving || !canEdit) return;
    setEntrySelected(employee);
    setEntryForm((current) => ({ ...current, id: crypto.randomUUID(), kind, date: today }));
    setFormError('');
    requestAnimationFrame(() => document.getElementById('salary-entry-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  async function save(event: FormEvent, dialog: 'entry' | 'employee') {
    setErrorForm(dialog);
    const targetEmployee = dialog === 'entry' ? entrySelected : selectedEmployee;
    event.preventDefault();
    if (mutating.current || !canEdit) return;
    if ((dialog === 'entry' || setupMode !== 'new') && !targetEmployee) return;
    const amount = dialog === 'employee' && setupMode === 'kpi' ? Number(employeeForm.kpi) : parseCurrencyInput(dialog === 'employee' ? employeeForm.amount : entryForm.amount);
    if (!Number.isFinite(amount) || amount >= 100000000000000 || (dialog === 'employee' ? amount < 0 : amount <= 0)) {
      setFormError(tc('invalidAmount'));
      return;
    }
    mutating.current = true;
    setSaving(true);
    setFormError('');
    try {
      const db = createClient();
      const result = dialog === 'employee' && (setupMode === 'salary' || setupMode === 'kpi')
        ? await db.rpc('change_salary_term', {
          p_club_id: clubId, p_employee_id: targetEmployee!.id,
          p_kind: setupMode, p_amount: amount,
          p_salary_type: setupMode === 'salary' ? employeeForm.salary_type : null,
        })
        : dialog === 'employee'
        ? await db.rpc('save_salary_employee', {
          p_club_id: clubId, p_employee_id: employeeForm.id, p_name: employeeForm.name.trim(), p_job_title: employeeForm.job_title.trim(),
          p_effective_date: employeeForm.date, p_salary_type: employeeForm.salary_type, p_amount: amount, p_kpi_percent: Number(employeeForm.kpi), p_active: employeeForm.active,
        })
        : await db.rpc('record_salary_entry', {
          p_club_id: clubId, p_employee_id: targetEmployee!.id, p_request_id: entryForm.id, p_date: entryForm.date,
          p_kind: entryForm.kind, p_amount: amount, p_comment: entryForm.comment.trim(),
          p_payment_method: entryForm.kind === 'payment' ? entryForm.payment_method : null,
          p_payment_source: entryForm.kind === 'payment' ? entryForm.payment_source : null,
        });
      if (result.error) throw result.error;
      if (dialog === 'entry') setEntryForm((form) => ({ ...form, id: crypto.randomUUID(), amount: '', comment: '' }));
      else if (setupMode === 'new') {
        setEmployeeForm((form) => ({ ...form, id: crypto.randomUUID(), name: '', job_title: '', amount: '0', kpi: '0' }));
      }
      showToast(t('saved'));
      await reload({ silent: true });
    } catch { setFormError(t('saveError')); }
    finally { mutating.current = false; setSaving(false); }
  }

  async function saveEmployeeRole() {
    if (!roleEdit || !canEdit || mutating.current) return;
    mutating.current = true;
    setSaving(true);
    setRoleError('');
    try {
      const result = await createClient().rpc('change_salary_employee_role', { p_club_id: clubId, p_employee_id: roleEdit.id, p_job_title: roleEdit.role });
      if (result.error) throw result.error;
      setData((previous) => ({ ...previous, employees: previous.employees.map((employee) => employee.id === roleEdit.id ? { ...employee, job_title: roleEdit.role } : employee) }));
      setRoleEdit(null);
      showToast(t('saved'));
    } catch { setRoleError(t('saveError')); }
    finally { mutating.current = false; setSaving(false); }
  }

  async function deactivateEmployee(employee: SalaryEmployee) {
    if (mutating.current || !canEdit) return;
    const confirmed = await confirm({ title: `${t('deactivate')} · ${employee.name}`, description: t('deactivated'), confirmLabel: t('deactivate') });
    if (!confirmed) return;
    mutating.current = true;
    setSaving(true);
    try {
      const result = await createClient().rpc('deactivate_salary_employee', { p_club_id: clubId, p_employee_id: employee.id });
      if (result.error) throw result.error;
      showToast(t('deactivated'));
      await reload({ silent: true });
    } catch { showToast(t('saveError'), 'error'); }
    finally { mutating.current = false; setSaving(false); }
  }

  async function deleteRecord() {
    if (!deletion || !canEdit || mutating.current) return;
    mutating.current = true;
    setSaving(true);
    setFormError('');
    try {
      const result = await createClient().rpc('delete_salary_record', { p_club_id: clubId, p_id: deletion.id, p_kind: deletion.kind });
      if (result.error) throw result.error;
      setDeletion(null);
      showToast(t('deletedSuccess'));
      await reload({ silent: true });
    } catch { setFormError(t('saveError')); }
    finally { mutating.current = false; setSaving(false); }
  }

  const formDisabled = saving || loading || loadError;
  const setupModeOptions = (['new', 'salary', 'kpi', 'profile'] as const).map((mode) => ({
    value: mode,
    label: t(mode === 'new' ? 'addEmployee' : mode === 'salary' ? 'changeSalary' : mode === 'kpi' ? 'changeKpi' : 'editEmployee'),
  }));
  const entryKindOptions = (['payment', 'bonus', 'fine'] as const).map((kind) => ({ value: kind, label: t(kind) }));

  function renderEmployeeSelect(dialog: 'entry' | 'employee', selected: SalaryEmployee | null) {
    return (
      <Field label={t('employee')} htmlFor={`salary-${dialog}-employee`} required className="sm:col-span-2">
        <Select
          id={`salary-${dialog}-employee`}
          required
          value={selected?.id ?? ''}
          onChange={(event) => {
            const employee = data.employees.find((e) => e.id === event.target.value) ?? null;
            if (dialog === 'entry') openEntry(employee, entryForm.kind);
            else openEmployee(employee, setupMode);
          }}
        >
          <option value="">{t('selectEmployee')}</option>
          {data.employees.filter((e) => dialog !== 'entry' || e.joined_on <= today).map((employee) => (
            <option key={employee.id} value={employee.id}>{employee.name}{employee.joined_on > today ? ` · ${t('upcoming')}` : ''}</option>
          ))}
        </Select>
      </Field>
    );
  }

  function renderEmployeeFields() {
    return (
      <>
        {(setupMode === 'new' || setupMode === 'profile') && (
          <>
            <Field label={t('name')} htmlFor="salary-employee-name" required>
              <Input id="salary-employee-name" required maxLength={120} value={employeeForm.name} onChange={(e) => setEmployeeForm({ ...employeeForm, name: e.target.value })} />
            </Field>
            <Field label={t('role')} htmlFor="salary-employee-role">
              <Select id="salary-employee-role" value={employeeForm.job_title} onChange={(e) => setEmployeeForm({ ...employeeForm, job_title: e.target.value })}>
                <option value="">{t('selectRole')}</option>
                {employeeRoles.map((option) => <option key={option} value={option}>{t(`roles.${option}`)}</option>)}
                {employeeForm.job_title && !knownEmployeeRole(employeeForm.job_title) && <option value={employeeForm.job_title}>{employeeForm.job_title}</option>}
              </Select>
            </Field>
          </>
        )}
        {(setupMode === 'new' || setupMode === 'profile') && (
          <Field label={t('effectiveDate')} hint={t(setupMode === 'new' ? 'futureHelp' : 'rateHelp')}>
            <DatePicker
              ariaLabel={t('effectiveDate')}
              min={selectedEmployee ? (selectedEmployee.joined_on > today ? selectedEmployee.joined_on : today) : '2000-01-01'}
              max={selectedEmployee ? (selectedEmployee.joined_on > today ? selectedEmployee.joined_on : today) : undefined}
              disabled={saving}
              value={employeeForm.date}
              onChange={(date) => setEmployeeForm({ ...employeeForm, date })}
            />
          </Field>
        )}
        {(setupMode === 'salary' || setupMode === 'kpi') && (
          <p className="text-xs leading-5 text-gray-500 sm:col-span-2">{t('rateHelp')}</p>
        )}
        {setupMode !== 'kpi' && (
          <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
            <Field label={t('salaryType')} htmlFor="salary-type">
              <Select id="salary-type" value={employeeForm.salary_type} onChange={(e) => setEmployeeForm({ ...employeeForm, salary_type: e.target.value })}>
                <option value="daily">{t('daily')}</option>
                <option value="monthly">{t('monthly')}</option>
              </Select>
            </Field>
            <Field label={t('amount')} htmlFor="salary-amount" hint={t('zeroBaseHelp')}>
              <CurrencyInput id="salary-amount" value={employeeForm.amount} onValueChange={(value) => setEmployeeForm({ ...employeeForm, amount: value })} />
            </Field>
          </div>
        )}
        {setupMode !== 'salary' && (
          <Field label={t('kpiPercent')} htmlFor="salary-kpi">
            <Input id="salary-kpi" type="number" required min="0" max="100" step="0.01" inputMode="decimal" value={employeeForm.kpi} onChange={(e) => setEmployeeForm({ ...employeeForm, kpi: e.target.value })} onWheel={(event) => event.currentTarget.blur()} trailingAddon="%" />
          </Field>
        )}
        {(setupMode === 'new' || setupMode === 'profile') && (
          <Checkbox className="self-end" label={t('active')} checked={employeeForm.active} onChange={(e) => setEmployeeForm({ ...employeeForm, active: e.target.checked })} />
        )}
      </>
    );
  }

  function renderEntryFields(selected: SalaryEmployee | null) {
    const balance = salaryBalance(balances[selected?.id ?? ''] ?? []);
    return (
      <>
        <StatTile className="sm:col-span-2" variant="soft" label={t('balance')} value={formatCurrency(balance)} unit={tc('currency')} tone="primary" />
        <Field label={t('amount')} htmlFor="salary-entry-amount" required>
          <CurrencyInput id="salary-entry-amount" required value={entryForm.amount} onValueChange={(value) => setEntryForm({ ...entryForm, amount: value })} />
        </Field>
        <Field label={t('date')}>
          <DatePicker ariaLabel={t('date')} min={selected?.joined_on} max={today} disabled={saving} value={entryForm.date} onChange={(date) => setEntryForm({ ...entryForm, date })} />
        </Field>
        {entryForm.kind === 'payment' && (
          <>
            <Field label={tp('paymentMethod')} htmlFor="salary-entry-method">
              <Select id="salary-entry-method" value={entryForm.payment_method} onChange={(e) => setEntryForm({ ...entryForm, payment_method: e.target.value as EntryPaymentMethod })}>
                {enabledPaymentMethods.map((method) => <option key={method} value={method}>{tc(`paymentMethods.${method}`)}</option>)}
              </Select>
            </Field>
            <Field label={tp('paymentSource')} htmlFor="salary-entry-source">
              <Select id="salary-entry-source" value={entryForm.payment_source} onChange={(e) => setEntryForm({ ...entryForm, payment_source: e.target.value })}>
                <option value="game_club">{tp('paymentSources.game_club')}</option>
                <option value="bar">{tp('paymentSources.bar')}</option>
              </Select>
            </Field>
          </>
        )}
        <Field label={t('comment')} htmlFor="salary-entry-comment" className="sm:col-span-2">
          <Textarea id="salary-entry-comment" maxLength={1000} value={entryForm.comment} onChange={(e) => setEntryForm({ ...entryForm, comment: e.target.value })} />
        </Field>
      </>
    );
  }

  function renderForm(dialog: 'entry' | 'employee') {
    const selected = dialog === 'entry' ? entrySelected : selectedEmployee;
    const title = dialog === 'entry'
      ? t('recordOperations')
      : t(setupMode === 'new' ? 'addEmployee' : setupMode === 'salary' ? 'changeSalary' : setupMode === 'kpi' ? 'changeKpi' : 'editEmployee');
    return (
      <Card as="section" id={dialog === 'entry' ? 'salary-entry-form' : 'salary-employee-form'} tone="primary" padding="lg" className="mb-6 scroll-mt-6 rounded-2xl">
        <SectionHeading title={title} className="mb-5" />
        {dialog === 'employee' && (
          <SegmentedControl
            className="mb-5 grid-cols-2 sm:grid-cols-4"
            columns="auto"
            label={t('salarySetup')}
            options={setupModeOptions}
            value={setupMode}
            disabled={formDisabled}
            onChange={(mode) => openEmployee(selectedEmployee, mode)}
          />
        )}
        <form onSubmit={(event) => void save(event, dialog)} className="space-y-4">
          <fieldset disabled={formDisabled} className="grid gap-4 sm:grid-cols-2">
            {dialog === 'entry' && (
              <>
                <SegmentedControl
                  className="sm:col-span-2"
                  label={t('entryType')}
                  options={entryKindOptions}
                  value={entryForm.kind}
                  onChange={(kind) => openEntry(selected, kind)}
                />
                <InlineAlert variant="info" className="sm:col-span-2">{t(`${entryForm.kind}Hint`)}</InlineAlert>
              </>
            )}
            {(dialog === 'entry' || setupMode !== 'new') && renderEmployeeSelect(dialog, selected)}
            {dialog === 'employee' ? renderEmployeeFields() : renderEntryFields(selected)}
          </fieldset>
          {formError && errorForm === dialog && <InlineAlert variant="danger">{formError}</InlineAlert>}
          <Button
            type="submit"
            fullWidth
            loading={saving}
            loadingLabel={tc('saving')}
            disabled={loading || loadError || ((dialog === 'entry' || setupMode !== 'new') && !selected)}
          >
            {dialog === 'entry' ? t(`record_${entryForm.kind}`) : tc('save')}
          </Button>
        </form>
      </Card>
    );
  }

  const pageTitle = view === 'history' ? historyEmployee?.name ?? t('history') : t(view === 'employees' ? 'employees' : 'title');
  const employeesSorted = [...data.employees].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <PageHeader
        back={view === 'operations' ? undefined : view === 'history' ? '/salaries/employees' : '/salaries'}
        backLabel={t(view === 'history' ? 'employees' : 'title')}
        title={pageTitle}
        description={t(view === 'history' ? 'history' : 'description')}
        action={view === 'operations' ? (
          <ButtonLink href="/salaries/employees" icon={<Users size={18} aria-hidden="true" />}>{t('employees')}</ButtonLink>
        ) : undefined}
      />

      {loadError && (
        <InlineAlert variant="danger" className="mb-4" action={<Button variant="outline" size="sm" onClick={() => void reload()}>{t('retry')}</Button>}>
          {t('loadError')}
        </InlineAlert>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <MetricCard
          label={t(view === 'history' ? 'base' : 'activeEmployees')}
          value={view === 'history' ? currency(historyMonths.reduce((sum, month) => sum + month.base, 0)) : String(activeCount)}
          trendLabel={view !== 'history' && upcomingCount ? t('upcomingCount', { count: upcomingCount }) : undefined}
          icon={Users}
          loading={loading}
        />
        <MetricCard label={t('totalDue')} value={currency(view === 'history' ? salaryBalance(historyMonths) : due)} icon={Wallet} loading={loading} tone="primary" />
        <MetricCard label={t('totalPaid')} value={currency(view === 'history' ? historyMonths.reduce((sum, month) => sum + month.paid, 0) : paid)} icon={Banknote} loading={loading} />
      </div>

      {view !== 'employees' && (
        <details className="mb-6 rounded-xl border border-primary-100 bg-primary-50 p-4 text-sm text-primary-900">
          <summary className="cursor-pointer font-semibold">{t('howItWorks')}</summary>
          <div className="mt-3 space-y-2 leading-6"><p>{t('baseHelp')}</p><p>{t('kpiHelp')}</p><p>{t('estimateHelp')}</p><p>{t('paymentHelp')}</p></div>
        </details>
      )}

      {!canEdit && <InlineAlert variant="info" className="mb-6">{t('viewOnlyHelp')}</InlineAlert>}

      {canEdit && view === 'operations' && (
        <div className="space-y-8">
          <div>
            <SectionHeading size="lg" title={t('dailyOperations')} description={t('operationsHelp')} className="mb-4" />
            {renderForm('entry')}
          </div>
          <div>
            <SectionHeading size="lg" title={t('salarySetup')} description={t('setupHelp')} className="mb-4" />
            {renderForm('employee')}
          </div>
        </div>
      )}

      {view === 'employees' && loading && <TableSkeleton rows={4} columns={3} />}

      {view === 'employees' && !loading && !loadError && data.employees.length === 0 && (
        <Card><EmptyState icon={Users} title={t('emptyTitle')} description={t('emptyDescription')} /></Card>
      )}

      {view === 'employees' && !loading && !loadError && data.employees.length > 0 && (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {employeesSorted.map((employee) => {
            const rate = displayRate(employee);
            const upcoming = employee.joined_on > today && Boolean(rate?.active);
            const balance = salaryBalance(balances[employee.id] ?? []);
            const status = upcoming ? 'upcoming' : rate?.active ? 'active' : 'inactive';

            return (
              <Card key={employee.id} as="article" padding="lg" className="rounded-2xl">
                <div className="mb-5 flex items-start gap-3">
                  <div className="rounded-xl bg-primary-50 p-3 text-primary-600"><Users size={23} aria-hidden="true" /></div>
                  <div className="min-w-0 flex-1">
                    <h2 className="break-words text-lg font-bold text-gray-900">{employee.name}</h2>
                    <div className="mt-1 flex items-center gap-1 text-sm text-gray-500">
                      <span className="break-words">{roleLabel(employee.job_title)}</span>
                      {canEdit && roleEdit?.id !== employee.id && (
                        <IconButton
                          variant="ghost"
                          size="sm"
                          label={`${t('changeRole')} · ${employee.name}`}
                          icon={<Pencil size={15} />}
                          disabled={saving}
                          onClick={() => { setRoleError(''); setRoleEdit({ id: employee.id, role: knownEmployeeRole(employee.job_title) ?? '' }); }}
                        />
                      )}
                    </div>
                  </div>
                  <Badge variant={status === 'upcoming' ? 'info' : status === 'active' ? 'success' : 'neutral'}>{t(status)}</Badge>
                </div>
                {canEdit && roleEdit?.id === employee.id && (
                  <form className="mb-4 rounded-xl border border-primary-100 bg-primary-50 p-3" onSubmit={(event) => { event.preventDefault(); void saveEmployeeRole(); }}>
                    <Field label={t('role')} htmlFor={`employee-role-${employee.id}`} error={roleError || undefined}>
                      <div className="flex flex-wrap gap-2">
                        <Select id={`employee-role-${employee.id}`} className="min-w-0 flex-1" required disabled={saving} value={roleEdit.role} onChange={(event) => setRoleEdit({ ...roleEdit, role: event.target.value })}>
                          <option value="">{t('selectRole')}</option>
                          {employeeRoles.map((option) => <option key={option} value={option}>{t(`roles.${option}`)}</option>)}
                        </Select>
                        <IconButton type="submit" variant="soft" label={tc('save')} icon={<Check size={18} />} loading={saving} disabled={!roleEdit.role} />
                        <IconButton label={tc('cancel')} icon={<X size={18} />} disabled={saving} onClick={() => { setRoleEdit(null); setRoleError(''); }} />
                      </div>
                    </Field>
                  </form>
                )}
                <dl className="space-y-2 text-sm">
                  {[
                    [t(upcoming ? 'startsOn' : 'joined'), formatDateOnly(employee.joined_on, locale), 'text-gray-900'],
                    [t(rate?.salary_type ?? 'daily'), currency(Number(rate?.amount ?? 0)), 'text-gray-900'],
                    [t('kpi'), `${Number(rate?.kpi_percent ?? 0)}%`, 'text-primary-600'],
                  ].map(([label, value, className]) => (
                    <div key={label} className="flex items-center justify-between gap-4 rounded-xl bg-gray-50 px-4 py-3">
                      <dt className="text-gray-500">{label}</dt>
                      <dd className={`text-right font-semibold ${className}`}>{value}</dd>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-4 rounded-xl bg-primary-50 px-4 py-3">
                    <dt className="font-medium text-primary-800">{t(balance < 0 ? 'advance' : 'balance')}</dt>
                    <dd className="text-right text-lg font-bold text-primary-600">{currency(Math.abs(balance))}</dd>
                  </div>
                </dl>
                <div className="mt-5 flex flex-wrap gap-2">
                  <ButtonLink size="sm" href={`/salaries/employees/${employee.id}`} icon={<History size={16} aria-hidden="true" />}>{t('history')}</ButtonLink>
                  {canEdit && (
                    <Button variant="dangerOutline" size="sm" disabled={saving || !rate?.active} onClick={() => void deactivateEmployee(employee)} icon={<Power size={16} aria-hidden="true" />}>
                      {t('deactivate')}
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {view === 'history' && loading && <TableSkeleton rows={6} columns={7} />}
      {view === 'history' && !loading && !loadError && !historyEmployee && (
        <Card><EmptyState icon={Users} title={t('employeeNotFound')} /></Card>
      )}
      {view === 'history' && historyEmployee && (
        <Card as="section" padding="lg" className="rounded-2xl">
          <div className="space-y-6">
            <div>
              <SectionHeading size="sm" title={t('monthlyBreakdown')} description={t('estimateHelp')} className="mb-3" />
              <DataTable
                bare
                dense
                minWidth={640}
                keyExtractor={(month) => month.month}
                data={[...historyMonths].reverse()}
                columns={[
                  { key: 'month', header: t('month'), render: (month) => formatYearMonth(month.month, locale) },
                  { key: 'base', header: t('base'), align: 'right', render: (month) => formatCurrency(month.base) },
                  { key: 'kpi', header: t('kpi'), align: 'right', render: (month) => formatCurrency(month.kpi) },
                  { key: 'bonus', header: t('bonus'), align: 'right', render: (month) => formatCurrency(month.bonus) },
                  { key: 'fine', header: t('fine'), align: 'right', render: (month) => formatCurrency(month.fine) },
                  { key: 'payment', header: t('payment'), align: 'right', render: (month) => formatCurrency(month.paid) },
                  { key: 'balance', header: t('balance'), align: 'right', render: (month) => <Money amount={month.balance} currency={null} signed className="font-semibold" /> },
                ]}
              />
            </div>
            <div>
              <SectionHeading size="sm" title={t('transactions')} className="mb-3" />
              <div className="space-y-2">
                {data.entries.filter((e) => e.employee_id === historyEmployee.id).sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)).map((entry) => (
                  <div key={entry.id} className={`flex flex-wrap items-start justify-between gap-4 rounded-xl bg-gray-50 p-3 text-sm ${entry.deleted_at ? 'opacity-60' : ''}`}>
                    <div className="min-w-0">
                      <p className="font-semibold">{t(entry.kind)} · {formatDateOnly(entry.date, locale)}</p>
                      {entry.payment_method && <p className="mt-1 text-xs text-gray-500">{tc(`paymentMethods.${entry.payment_method}`)} · {tp(`paymentSources.${entry.payment_source}`)}</p>}
                      {entry.comment && <p className="mt-1 break-words text-gray-500">{entry.comment}</p>}
                    </div>
                    <strong className={entry.kind === 'bonus' ? 'text-success-600' : 'text-gray-900'}>{entry.kind === 'bonus' ? '+' : '−'}{currency(Number(entry.amount))}</strong>
                    {entry.deleted_at ? (
                      <Badge variant="neutral" size="sm">{t('deleted')} · {formatDateTime(entry.deleted_at, locale)}</Badge>
                    ) : canEdit && (
                      <Button variant="dangerOutline" size="sm" disabled={saving} onClick={() => { setFormError(''); setDeletion({ id: entry.id, kind: 'entry', label: `${t(entry.kind)} · ${formatDateOnly(entry.date, locale)} · ${currency(Number(entry.amount))}` }); }}>
                        {t('delete')}
                      </Button>
                    )}
                  </div>
                ))}
                {!data.entries.some((e) => e.employee_id === historyEmployee.id) && <EmptyState compact bordered title={t('noTransactions')} />}
              </div>
            </div>
            <div>
              <SectionHeading size="sm" title={t('rateHistory')} className="mb-3" />
              <ul className="divide-y divide-gray-100">
                {data.rates.filter((r) => r.employee_id === historyEmployee.id).sort((a, b) => b.effective_date.localeCompare(a.effective_date)).map((rate) => (
                  <li className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm text-gray-600" key={rate.id}>
                    <p className={rate.deleted_at ? 'line-through opacity-60' : ''}>
                      {formatDateOnly(rate.effective_date, locale)} · {t(rate.salary_type)} · {currency(Number(rate.amount))} · {t('kpi')}: {Number(rate.kpi_percent)}% · {t(rate.active ? 'active' : 'inactive')}
                    </p>
                    {rate.deleted_at ? (
                      <Badge variant="neutral" size="sm">{t('deleted')} · {formatDateTime(rate.deleted_at, locale)}</Badge>
                    ) : canEdit && (
                      <Button
                        variant="dangerOutline"
                        size="sm"
                        disabled={saving || !canDeleteSalaryRate(data.rates, rate)}
                        title={!canDeleteSalaryRate(data.rates, rate) ? t('lastRateHelp') : undefined}
                        onClick={() => { setFormError(''); setDeletion({ id: rate.id, kind: 'rate', label: `${formatDateOnly(rate.effective_date, locale)} · ${currency(Number(rate.amount))} · ${Number(rate.kpi_percent)}%` }); }}
                      >
                        {t('delete')}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      <Modal
        open={Boolean(deletion) && canEdit}
        onClose={() => setDeletion(null)}
        locked={saving}
        title={t('deleteTitle')}
        size="sm"
        footer={(
          <>
            <Button variant="outline" disabled={saving} onClick={() => setDeletion(null)}>{tc('cancel')}</Button>
            <Button variant="danger" loading={saving} loadingLabel={tc('saving')} onClick={() => void deleteRecord()}>{t('delete')}</Button>
          </>
        )}
      >
        <p className="mb-3 font-semibold">{deletion?.label}</p>
        <p className="text-sm leading-6 text-gray-600">{t(deletion?.kind === 'rate' ? 'deleteRateHelp' : 'deleteEntryHelp')}</p>
        {formError && <InlineAlert variant="danger" className="mt-4">{formError}</InlineAlert>}
      </Modal>

      {toastElement}
      {confirmDialog}
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Modal } from '@/components/ui/Modal';
import { useTranslations } from 'next-intl';
import { Banknote, Check, History, Pencil, Power, Users, Wallet, X } from 'lucide-react';
import { useClub } from '@/components/layout/DashboardShell';
import { PageHeader } from '@/components/ui/PageHeader';
import { MetricCard } from '@/components/ui/MetricCard';
import { DatePicker } from '@/components/ui/CalendarPicker';
import { createClient } from '@/lib/supabase/client';
import { loadSalaries } from '@/lib/supabase/salaries';
import { calculateSalaries, salaryBalance, canDeleteSalaryRate, type SalaryEmployee, type SalaryEntry } from '@/lib/calculations/salaries';
import { formatCurrency, formatCurrencyInput, parseCurrencyInput, formatDateOnly, formatDateTime, formatYearMonth } from '@/lib/formatters';
import { defaultPaymentMethod } from '@/lib/paymentMethods';
import { canAccessFeature } from '@/lib/permissions';
import { todayIso } from '@/lib/utils';

const employeeRoles = ['Manager', 'Admin', 'Cleaner'] as const;

function knownEmployeeRole(value: string) {
  return employeeRoles.find((role) => role.toLowerCase() === value.trim().toLowerCase());
}

type SetupMode = 'new' | 'salary' | 'kpi' | 'profile';

const emptyData: Awaited<ReturnType<typeof loadSalaries>> = { employees: [], rates: [], entries: [], monthlyProfit: [] };

export default function SalariesPage({ view = 'operations', employeeId }: { view?: 'operations' | 'employees' | 'history'; employeeId?: string }) {
  const { selectedClubId } = useClub();
  if (!selectedClubId) return null;
  return <SalaryManager key={`${selectedClubId}:${view}:${employeeId ?? ''}`} clubId={selectedClubId} view={view} employeeId={employeeId} />;
}

function SalaryManager({ clubId, view, employeeId }: { clubId: string; view: 'operations' | 'employees' | 'history'; employeeId?: string }) {
  const t = useTranslations('salaries');
  const tc = useTranslations('common');
  const tp = useTranslations('expenses');
  const { businessDayStartHour, enabledPaymentMethods, role, featureAccess } = useClub();
  const canEdit = canAccessFeature(role, featureAccess, 'salaries');
  const today = todayIso(new Date(), businessDayStartHour);
  const [data, setData] = useState(emptyData);
  const [loading, setLoading] = useState(true);
  const [deletion, setDeletion] = useState<{id: string; kind: 'entry' | 'rate'; label: string} | null>(null);
  const [roleEdit, setRoleEdit] = useState<{ id: string; role: string } | null>(null);
  const [roleError, setRoleError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<'' | 'loadError' | 'saveError'>('');
  const [success, setSuccess] = useState('');
  const [formError, setFormError] = useState('');
  const [errorForm, setErrorForm] = useState<'entry' | 'employee' | null>(null);
  const [setupMode, setSetupMode] = useState<SetupMode>('new');
  const [entrySelected, setEntrySelected] = useState<SalaryEmployee | null>(null);
  const [selectedEmployee, setSelected] = useState<SalaryEmployee | null>(null);
  const [employeeForm, setEmployeeForm] = useState(() => ({ id: crypto.randomUUID(), name: '', job_title: '', date: today, salary_type: 'daily', amount: '0', kpi: '0', active: true }));
  const [entryForm, setEntryForm] = useState(() => ({ id: crypto.randomUUID(), kind: 'payment' as SalaryEntry['kind'], amount: '', date: today, comment: '', payment_method: defaultPaymentMethod(enabledPaymentMethods), payment_source: 'game_club' }));
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
    const role = knownEmployeeRole(value);
    return role ? t(`roles.${role}`) : value || t('noRole');
  };
  const currency = (value: number) => `${formatCurrency(value)} UZS`;

  const reload = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    setError('');
    try {
      const next = await loadSalaries(clubId, today);
      if (request === generation.current) setData(next);
    } catch {
      if (request === generation.current) setError('loadError');
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [clubId, today]);
  const cancelLoads = useCallback(() => { generation.current++; }, []);
  useEffect(() => { void reload(); return cancelLoads; }, [reload, cancelLoads]);

  function openEmployee(employee: SalaryEmployee | null, mode: SetupMode = employee ? 'profile' : 'new') {
    if (saving || !canEdit) return;
    const rate = employee ? displayRate(employee) : undefined;
    setSetupMode(mode);
    setSelected(employee);
    setEmployeeForm({ id: employee?.id ?? crypto.randomUUID(), name: employee?.name ?? '', job_title: knownEmployeeRole(employee?.job_title ?? '') ?? employee?.job_title ?? '', date: employee && employee.joined_on > today ? employee.joined_on : today, salary_type: rate?.salary_type ?? 'daily', amount: rate ? formatCurrencyInput(Number(rate.amount)) : '0', kpi: String(rate?.kpi_percent ?? 0), active: rate?.active ?? true });
    setFormError('');
    requestAnimationFrame(() => document.getElementById('salary-employee-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  function openEntry(employee: SalaryEmployee | null, kind: SalaryEntry['kind'] = 'payment') {
    if (saving || !canEdit) return;
    setEntrySelected(employee);
    setEntryForm({ id: crypto.randomUUID(), kind, amount: '', date: today, comment: '', payment_method: defaultPaymentMethod(enabledPaymentMethods), payment_source: 'game_club' });
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
    setSuccess('');
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
      setSuccess(t('saved'));
      await reload();
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
      setSuccess(t('saved'));
    } catch { setRoleError(t('saveError')); }
    finally { mutating.current = false; setSaving(false); }
  }

  async function deactivateEmployee(employee: SalaryEmployee) {
    if (mutating.current || !canEdit) return;
    mutating.current = true;
    setSaving(true);
    setSuccess('');
    try {
      const result = await createClient().rpc('deactivate_salary_employee', { p_club_id: clubId, p_employee_id: employee.id });
      if (result.error) throw result.error;
      setSuccess(t('deactivated'));
      await reload();
    } catch { setError('saveError'); }
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
      setSuccess(t('deletedSuccess'));
      await reload();
    } catch { setFormError(t('saveError')); }
    finally { mutating.current = false; setSaving(false); }
  }

  function renderForm(dialog: 'entry' | 'employee') {
    const selected = dialog === 'entry' ? entrySelected : selectedEmployee;
    return <section id={dialog === 'entry' ? 'salary-entry-form' : 'salary-employee-form'} className="mb-6 scroll-mt-6 rounded-2xl border border-primary-100 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="font-bold text-gray-900">{dialog === 'entry' ? t('recordOperations') : t(setupMode === 'new' ? 'addEmployee' : setupMode === 'salary' ? 'changeSalary' : setupMode === 'kpi' ? 'changeKpi' : 'editEmployee')}</h2>
      </div>
      {dialog === 'employee' && <div className="mb-5 grid gap-2 sm:grid-cols-4">{(['new', 'salary', 'kpi', 'profile'] as const).map((mode) => <button key={mode} disabled={saving || loading || Boolean(error)} aria-pressed={setupMode === mode} className={`rounded-xl border px-3 py-3 text-sm font-bold ${setupMode === mode ? 'border-primary-500 bg-primary-50 text-primary-600' : 'border-gray-200 text-gray-500'}`} onClick={() => openEmployee(null, mode)}>{t(mode === 'new' ? 'addEmployee' : mode === 'salary' ? 'changeSalary' : mode === 'kpi' ? 'changeKpi' : 'editEmployee')}</button>)}</div>}
      <form onSubmit={(event) => void save(event, dialog)} className="space-y-4">
        <fieldset disabled={saving || loading || Boolean(error)} className="grid gap-4 sm:grid-cols-2">
          {dialog === 'entry' && <>
            <div className="grid grid-cols-3 gap-2 sm:col-span-2">
              {(['payment', 'bonus', 'fine'] as const).map((kind) => <button type="button" key={kind} aria-pressed={entryForm.kind === kind} className={`rounded-xl border px-3 py-3 text-sm font-semibold ${entryForm.kind === kind ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 bg-white text-gray-600'}`} onClick={() => openEntry(selected, kind)}>{t(kind)}</button>)}
            </div>
            <p className="sm:col-span-2 rounded-xl bg-primary-50 px-4 py-3 text-sm text-primary-800">{t(`${entryForm.kind}Hint`)}</p>
          </>}
          {(dialog === 'entry' || setupMode !== 'new') && (
            <label className="label sm:col-span-2">{t('employee')}
              <select className="input-field mt-1 h-11" required value={selected?.id ?? ''} onChange={(event) => {
                const employee = data.employees.find((e) => e.id === event.target.value) ?? null;
                if (dialog === 'entry') openEntry(employee, entryForm.kind);
                else openEmployee(employee, setupMode);
              }}>
                <option value="">{t('selectEmployee')}</option>
                {data.employees.filter((e) => dialog !== 'entry' || e.joined_on <= today).map((employee) => (
                  <option key={employee.id} value={employee.id}>{employee.name}{employee.joined_on > today ? ` · ${t('upcoming')}` : ''}</option>
                ))}
              </select>
            </label>
          )}
          {dialog === 'employee' ? <>
            {(setupMode === 'new' || setupMode === 'profile') && <>
            <label className="label">{t('name')}<input className="input-field mt-1" required maxLength={120} value={employeeForm.name} onChange={(e) => setEmployeeForm({ ...employeeForm, name: e.target.value })} /></label>
            <label className="label">{t('role')}
              <select className="input-field mt-1" value={employeeForm.job_title} onChange={(e) => setEmployeeForm({ ...employeeForm, job_title: e.target.value })}>
                <option value="">{t('selectRole')}</option>
                {employeeRoles.map((role) => <option key={role} value={role}>{t(`roles.${role}`)}</option>)}
                {employeeForm.job_title && !knownEmployeeRole(employeeForm.job_title) && <option value={employeeForm.job_title}>{employeeForm.job_title}</option>}
              </select>
            </label>
            </>}
            <div>
              <p className="label">{t('effectiveDate')}</p>
              <DatePicker
                ariaLabel={t('effectiveDate')}
                min={selected ? (selected.joined_on > today ? selected.joined_on : today) : '2000-01-01'}
                max={selected ? (selected.joined_on > today ? selected.joined_on : today) : undefined}
                disabled={saving || (setupMode !== 'new' && setupMode !== 'profile')}
                value={employeeForm.date}
                onChange={(date) => setEmployeeForm({ ...employeeForm, date })}
              />
            </div>
            <p className="text-xs leading-5 text-gray-500 sm:col-span-2">{t(setupMode === 'new' ? 'futureHelp' : 'rateHelp')}</p>
            {setupMode !== 'kpi' && <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2"><label className="label">{t('salaryType')}<select className="input-field mt-1" value={employeeForm.salary_type} onChange={(e) => setEmployeeForm({ ...employeeForm, salary_type: e.target.value })}><option value="daily">{t('daily')}</option><option value="monthly">{t('monthly')}</option></select></label>
              <label className="label">{t('amount')}<input
                className="input-field mt-1 tabular-nums"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="0"
                aria-describedby="salary-base-help"
                value={employeeForm.amount}
                onChange={(e) => setEmployeeForm({ ...employeeForm, amount: formatCurrencyInput(e.target.value) })}
              /><span id="salary-base-help" className="mt-1 block text-xs font-normal leading-5 text-gray-500">{t('zeroBaseHelp')}</span></label></div>}
            {setupMode !== 'salary' && <label className="label">{t('kpiPercent')}<input className="input-field mt-1" type="number" required min="0" max="100" step="0.01" value={employeeForm.kpi} onChange={(e) => setEmployeeForm({ ...employeeForm, kpi: e.target.value })} /></label>}
            {(setupMode === 'new' || setupMode === 'profile') && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={employeeForm.active} onChange={(e) => setEmployeeForm({ ...employeeForm, active: e.target.checked })} />{t('active')}</label>}
          </> : <>
            <p className="sm:col-span-2 rounded-xl bg-primary-50 p-3 text-sm font-semibold text-primary-800">{t('balance')}: {currency(salaryBalance(balances[selected?.id ?? ''] ?? []))}</p>
            <label className="label">{t('amount')}<input
              className="input-field mt-1 tabular-nums"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="0"
              required
              value={entryForm.amount}
              onChange={(e) => setEntryForm({ ...entryForm, amount: formatCurrencyInput(e.target.value) })}
            /></label>
            <div>
              <p className="label">{t('date')}</p>
              <DatePicker
                ariaLabel={t('date')}
                min={selected?.joined_on}
                max={today}
                disabled={saving}
                value={entryForm.date}
                onChange={(date) => setEntryForm({ ...entryForm, date })}
              />
            </div>
            {entryForm.kind === 'payment' && <>
              <label className="label">{tp('paymentMethod')}<select className="input-field mt-1" value={entryForm.payment_method} onChange={(e) => setEntryForm({ ...entryForm, payment_method: e.target.value as typeof entryForm.payment_method })}>{enabledPaymentMethods.map((method) => <option key={method} value={method}>{tc(`paymentMethods.${method}`)}</option>)}</select></label>
              <label className="label">{tp('paymentSource')}<select className="input-field mt-1" value={entryForm.payment_source} onChange={(e) => setEntryForm({ ...entryForm, payment_source: e.target.value })}><option value="game_club">{tp('paymentSources.game_club')}</option><option value="bar">{tp('paymentSources.bar')}</option></select></label>
              
            </>}
            <label className="label sm:col-span-2">{t('comment')}<textarea className="input-field mt-1" maxLength={1000} value={entryForm.comment} onChange={(e) => setEntryForm({ ...entryForm, comment: e.target.value })} /></label>
          </>}
        </fieldset>
        {formError && errorForm === dialog && <p role="alert" className="text-sm text-red-700">{formError}</p>}
        <button type="submit" disabled={saving || loading || Boolean(error) || ((dialog === 'entry' || setupMode !== 'new') && !selected)} className="btn-primary w-full">{saving ? tc('saving') : dialog === 'entry' ? t(`record_${entryForm.kind}`) : tc('save')}</button>
      </form>
    </section>;
  }

  return <div>
    {view !== 'operations' && <Link className="mb-4 inline-flex text-sm font-semibold text-gray-500" href={view === 'history' ? '/salaries/employees' : '/salaries'}>← {t(view === 'history' ? 'employees' : 'title')}</Link>}
    <PageHeader title={view === 'history' ? historyEmployee?.name ?? t('history') : t(view === 'employees' ? 'employees' : 'title')} description={t(view === 'history' ? 'history' : 'description')} action={view === 'operations' ? <div className="flex flex-wrap gap-2"><Link href="/salaries/employees" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-primary-200 bg-white px-5 py-2.5 font-semibold text-primary-700 shadow-sm transition-colors hover:border-primary-300 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"><Users size={18} />{t('employees')}</Link></div> : view === 'employees' ? <div className="flex flex-wrap gap-2">{[[t('activeEmployees'), String(activeCount)], [t('totalDue'), currency(due)], [t('totalPaid'), currency(paid)]].map(([label, value]) => <div key={label} className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p><p className="mt-1 text-sm font-bold text-gray-900">{loading ? '…' : value}</p></div>)}</div> : undefined} />
    {success && <p role="status" className="mb-4 rounded-xl bg-green-50 p-4 text-sm text-green-800">{success}</p>}
    {error && <div role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">{t(error)}<button className="ml-3 underline" onClick={() => void reload()}>{t('retry')}</button></div>}
    {view !== 'employees' && <div className="mb-6 grid gap-4 sm:grid-cols-3">
      <MetricCard label={t(view === 'history' ? 'base' : 'activeEmployees')} value={view === 'history' ? currency(historyMonths.reduce((sum, month) => sum + month.base, 0)) : String(activeCount)} trendLabel={view !== 'history' && upcomingCount ? t('upcomingCount', { count: upcomingCount }) : undefined} icon={Users} loading={loading} />
      <MetricCard label={t('totalDue')} value={currency(view === 'history' ? salaryBalance(historyMonths) : due)} icon={Wallet} loading={loading} valueClassName="text-primary-600" />
      <MetricCard label={t('totalPaid')} value={currency(view === 'history' ? historyMonths.reduce((sum, month) => sum + month.paid, 0) : paid)} icon={Banknote} loading={loading} />
    </div>}
    {view !== 'employees' && <details className="mb-6 rounded-xl border border-primary-100 bg-primary-50 p-4 text-sm text-primary-900">
      <summary className="cursor-pointer font-semibold">{t('howItWorks')}</summary>
      <div className="mt-3 space-y-2 leading-6"><p>{t('baseHelp')}</p><p>{t('kpiHelp')}</p><p>{t('estimateHelp')}</p><p>{t('paymentHelp')}</p></div>
    </details>}
    {!canEdit && <p className="mb-6 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-500">{t('viewOnlyHelp')}</p>}
    {canEdit && view === 'operations' && <div className="space-y-8">
      <div><h2 className="text-lg font-bold text-gray-900">{t('dailyOperations')}</h2><p className="mb-4 mt-1 text-sm text-gray-500">{t('operationsHelp')}</p>{renderForm('entry')}</div>
      <div><h2 className="text-lg font-bold text-gray-900">{t('salarySetup')}</h2><p className="mb-4 mt-1 text-sm text-gray-500">{t('setupHelp')}</p>{renderForm('employee')}</div>
    </div>}
    {view === 'employees' && !loading && !error && data.employees.length === 0 && <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center"><Users className="mx-auto mb-3 text-primary-500" size={32} /><h2 className="font-bold text-gray-900">{t('emptyTitle')}</h2><p className="mt-2 text-sm text-gray-500">{t('emptyDescription')}</p></div>}
    {view === 'employees' && !loading && !error && <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {[...data.employees].sort((a, b) => a.name.localeCompare(b.name)).map((employee) => {
        const rate = displayRate(employee);
        const upcoming = employee.joined_on > today && Boolean(rate?.active);
        const balance = salaryBalance(balances[employee.id] ?? []);
        
        return <article key={employee.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-start gap-3"><div className="rounded-xl bg-primary-50 p-3 text-primary-600"><Users size={23} /></div><div className="min-w-0 flex-1"><h2 className="break-words text-lg font-bold text-gray-900">{employee.name}</h2><div className="mt-1 flex items-center gap-1 text-sm text-gray-500"><span className="break-words">{roleLabel(employee.job_title)}</span>{canEdit && roleEdit?.id !== employee.id && <button type="button" title={t('changeRole')} aria-label={`${t('changeRole')} · ${employee.name}`} disabled={saving} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-primary-50 hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500" onClick={() => { setRoleError(''); setRoleEdit({ id: employee.id, role: knownEmployeeRole(employee.job_title) ?? '' }); }}><Pencil size={15} /></button>}</div></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${upcoming ? 'bg-blue-50 text-blue-700' : rate?.active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{t(upcoming ? 'upcoming' : rate?.active ? 'active' : 'inactive')}</span></div>
          {canEdit && roleEdit?.id === employee.id && <form className="mb-4 rounded-xl border border-primary-100 bg-primary-50 p-3" onSubmit={(event) => { event.preventDefault(); void saveEmployeeRole(); }}>
            <label className="label" htmlFor={`employee-role-${employee.id}`}>{t('role')}</label>
            <div className="mt-1 flex flex-wrap gap-2"><select id={`employee-role-${employee.id}`} className="input-field min-w-0 flex-1" required disabled={saving} value={roleEdit.role} onChange={(event) => setRoleEdit({ ...roleEdit, role: event.target.value })}><option value="">{t('selectRole')}</option>{employeeRoles.map((role) => <option key={role} value={role}>{t(`roles.${role}`)}</option>)}</select>
              <button type="submit" className="btn-primary" title={tc('save')} aria-label={tc('save')} disabled={saving || !roleEdit.role}><Check size={18} /></button>
              <button type="button" className="btn-secondary" title={tc('cancel')} aria-label={tc('cancel')} disabled={saving} onClick={() => { setRoleEdit(null); setRoleError(''); }}><X size={18} /></button>
            </div>{roleError && <p role="alert" className="mt-2 text-sm text-red-700">{roleError}</p>}
          </form>}
          <dl className="space-y-2 text-sm">
            {[[t(upcoming ? 'startsOn' : 'joined'), formatDateOnly(employee.joined_on)], [t(rate?.salary_type ?? 'daily'), currency(Number(rate?.amount ?? 0))], [t('kpi'), `${Number(rate?.kpi_percent ?? 0)}%`]].map(([label, value]) => <div key={label} className="flex items-center justify-between gap-4 rounded-xl bg-gray-50 px-4 py-3"><dt className="text-gray-500">{label}</dt><dd className={`text-right font-semibold ${label === t('kpi') ? 'text-primary-600' : 'text-gray-900'}`}>{value}</dd></div>)}
            <div className="flex items-center justify-between gap-4 rounded-xl bg-primary-50 px-4 py-3"><dt className="font-medium text-primary-800">{t(balance < 0 ? 'advance' : 'balance')}</dt><dd className="text-right text-lg font-bold text-primary-600">{currency(Math.abs(balance))}</dd></div>
          </dl>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link className="btn-secondary flex items-center gap-2 text-sm" href={`/salaries/employees/${employee.id}`}><History size={16} />{t('history')}</Link>
            {canEdit && <button className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50" disabled={saving || !rate?.active} onClick={() => void deactivateEmployee(employee)}><Power size={16} />{t('deactivate')}</button>}
          </div>
        </article>;
      })}
    </div>}
    {view === 'history' && !loading && !error && !historyEmployee && <p className="text-sm text-gray-500">{t('employeeNotFound')}</p>}
    {view === 'history' && historyEmployee && <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
      <div className="space-y-6">
        <div><h3 className="mb-2 font-semibold">{t('monthlyBreakdown')}</h3><p className="mb-3 text-xs leading-5 text-gray-500">{t('estimateHelp')}</p><div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-right text-sm"><thead><tr className="border-b text-gray-500">{['month', 'base', 'kpi', 'bonus', 'fine', 'payment', 'balance'].map((key) => <th className="px-3 py-3" key={key}>{t(key)}</th>)}</tr></thead><tbody>{[...(balances[historyEmployee.id ?? ''] ?? [])].reverse().map((month) => <tr className="border-b border-gray-100" key={month.month}><td className="px-3 py-3">{formatYearMonth(month.month)}</td>{[month.base, month.kpi, month.bonus, month.fine, month.paid, month.balance].map((value, index) => <td className="px-3 py-3 tabular-nums" key={index}>{formatCurrency(value)}</td>)}</tr>)}</tbody></table></div></div>
        <div><h3 className="mb-3 font-semibold">{t('transactions')}</h3><div className="space-y-2">{data.entries.filter((e) => e.employee_id === historyEmployee.id).sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)).map((entry) => <div key={entry.id} className={`flex flex-wrap items-start justify-between gap-4 rounded-xl bg-gray-50 p-3 text-sm ${entry.deleted_at ? 'opacity-60' : ''}`}><div><p className="font-semibold">{t(entry.kind)} · {formatDateOnly(entry.date)}</p>{entry.payment_method && <p className="mt-1 text-xs text-gray-500">{tc(`paymentMethods.${entry.payment_method}`)} · {tp(`paymentSources.${entry.payment_source}`)}</p>}{entry.comment && <p className="mt-1 break-words text-gray-500">{entry.comment}</p>}</div><strong className={entry.kind === 'bonus' ? 'text-green-700' : 'text-gray-900'}>{entry.kind === 'bonus' ? '+' : '−'}{currency(Number(entry.amount))}</strong>{entry.deleted_at ? <span className="text-xs">{t('deleted')} · {formatDateTime(entry.deleted_at)}</span> : canEdit && <button className="btn-secondary text-red-600" disabled={saving} onClick={() => { setFormError(''); setDeletion({id: entry.id, kind: 'entry', label: `${t(entry.kind)} · ${formatDateOnly(entry.date)} · ${currency(Number(entry.amount))}`}); }}>{t('delete')}</button>}</div>)}{!data.entries.some((e) => e.employee_id === historyEmployee.id) && <p className="text-sm text-gray-500">{t('noTransactions')}</p>}</div></div>
        <div><h3 className="mb-3 font-semibold">{t('rateHistory')}</h3>{data.rates.filter((r) => r.employee_id === historyEmployee.id).sort((a, b) => b.effective_date.localeCompare(a.effective_date)).map((rate) => <div className="flex flex-wrap items-center justify-between gap-3 border-b py-3 text-sm text-gray-600" key={rate.id}><p className={rate.deleted_at ? 'line-through opacity-60' : ''}>{formatDateOnly(rate.effective_date)} · {t(rate.salary_type)} · {currency(Number(rate.amount))} · {t('kpi')}: {Number(rate.kpi_percent)}% · {t(rate.active ? 'active' : 'inactive')}</p>{rate.deleted_at ? <span className="text-xs">{t('deleted')} · {formatDateTime(rate.deleted_at)}</span> : canEdit && <button className="btn-secondary text-red-600" disabled={saving || !canDeleteSalaryRate(data.rates, rate)} title={!canDeleteSalaryRate(data.rates, rate) ? t('lastRateHelp') : undefined} onClick={() => { setFormError(''); setDeletion({id: rate.id, kind: 'rate', label: `${formatDateOnly(rate.effective_date)} · ${currency(Number(rate.amount))} · ${Number(rate.kpi_percent)}%`}); }}>{t('delete')}</button>}</div>)}</div>
      </div>
    </section>}
    <Modal open={Boolean(deletion) && canEdit} onClose={() => { if (!saving) setDeletion(null); }} title={t('deleteTitle')}>
      <p className="mb-3 font-semibold">{deletion?.label}</p>
      <p className="mb-4 text-sm leading-6 text-gray-600">{t(deletion?.kind === 'rate' ? 'deleteRateHelp' : 'deleteEntryHelp')}</p>
      {formError && <p role="alert" className="mb-4 text-sm text-red-700">{formError}</p>}
      <div className="flex justify-end gap-3"><button className="btn-secondary" disabled={saving} onClick={() => setDeletion(null)}>{tc('cancel')}</button><button className="btn-primary" disabled={saving} onClick={() => void deleteRecord()}>{saving ? tc('saving') : t('delete')}</button></div>
    </Modal>
  </div>;
}

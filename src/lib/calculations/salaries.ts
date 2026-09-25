import { differenceInCalendarDays, eachMonthOfInterval, format, parseISO } from 'date-fns';
import { monthRange } from '../utils';
import type { OwnerProfitMonthlyBalanceRow } from '@/lib/calculations/ownerProfitSnapshot';

export interface SalaryEmployee {
  id: string;
  club_id: string;
  name: string;
  job_title: string;
  joined_on: string;
}

export interface SalaryRate {
  deleted_at?: string | null;
  deleted_by?: string | null;
  id: string;
  employee_id: string;
  effective_date: string;
  salary_type: 'daily' | 'monthly';
  amount: number;
  kpi_percent: number;
  active: boolean;
}

export interface SalaryEntry {
  deleted_at?: string | null;
  deleted_by?: string | null;
  id: string;
  employee_id: string;
  date: string;
  kind: 'payment' | 'bonus' | 'fine';
  amount: number;
  comment: string;
  payment_method: string | null;
  payment_source: string | null;
  created_at: string;
}

export interface SalaryMonth {
  month: string;
  base: number;
  bonus: number;
  fine: number;
  kpi: number;
  paid: number;
  earned: number;
  balance: number;
  kpiProfit: number;
  effectiveKpiPercent: number;
}

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Owner profit uses the existing owner's earned-cash definition, before withdrawals.
 * Add back linked payroll payments, then deduct salary earned (base + bonus - fine).
 * All employees share the same AFTER-payroll KPI base, including KPI itself:
 * residual = max(0, profitBeforePayroll - fixedPayroll) / (1 + sum(KPI shares)).
 * Payment timing therefore cannot change KPI or deduct salary twice.
 * Current/historical months remain estimates when underlying finance is edited.
 */
export function calculateSalaries({ employees, rates, entries, monthlyProfit, throughDate }: {
  employees: SalaryEmployee[];
  rates: SalaryRate[];
  entries: SalaryEntry[];
  monthlyProfit: OwnerProfitMonthlyBalanceRow[];
  throughDate: string;
}): Record<string, SalaryMonth[]> {
  const result: Record<string, SalaryMonth[]> = Object.fromEntries(employees.map((e) => [e.id, []]));
  const firstDate = employees.reduce((date, e) => e.joined_on < date ? e.joined_on : date, throughDate);
  const profits = new Map(monthlyProfit.map((row) => [row.period_month.slice(0, 7), Number(row.game_club_earned) + Number(row.bar_earned)]));
  const employeeRates = new Map(employees.map((e) => [e.id, rates.filter((r) => !r.deleted_at && r.employee_id === e.id).sort((a, b) => a.effective_date.localeCompare(b.effective_date))]));
  for (const date of eachMonthOfInterval({ start: parseISO(firstDate), end: parseISO(throughDate) })) {
    const month = format(date, 'yyyy-MM');
    const { from, to } = monthRange(month);
    const end = to < throughDate ? to : throughDate;
    const daysInMonth = differenceInCalendarDays(parseISO(to), parseISO(from)) + 1;
    const elapsedDays = differenceInCalendarDays(parseISO(end), parseISO(from)) + 1;
    const monthEntries = entries.filter((e) => !e.deleted_at && e.date >= from && e.date <= end);
    const rows = employees.map((employee) => {
      let base = 0;
      let weightedPercent = 0;
      const terms = employeeRates.get(employee.id) ?? [];
      terms.forEach((rate, index) => {
        if (!rate.active) return;
        const start = [from, employee.joined_on, rate.effective_date].sort().at(-1)!;
        const next = terms[index + 1]?.effective_date;
        const inclusiveDays = differenceInCalendarDays(parseISO(end), parseISO(start)) + 1;
        const days = Math.max(0, next ? Math.min(inclusiveDays, differenceInCalendarDays(parseISO(next), parseISO(start))) : inclusiveDays);
        base += Number(rate.amount) * days / (rate.salary_type === 'monthly' ? daysInMonth : 1);
        weightedPercent += Number(rate.kpi_percent) * days / elapsedDays;
      });
      const employeeEntries = monthEntries.filter((e) => e.employee_id === employee.id);
      const sum = (kind: SalaryEntry['kind']) => money(employeeEntries.filter((e) => e.kind === kind).reduce((s, e) => s + Number(e.amount), 0));
      return { employee, base: money(base), bonus: sum('bonus'), fine: sum('fine'), paid: sum('payment'), weightedPercent };
    });
    const beforePayroll = (profits.get(month) ?? 0) + rows.reduce((sum, row) => sum + row.paid, 0);
    const fixedPayroll = rows.reduce((sum, row) => sum + row.base + row.bonus - row.fine, 0);
    const totalShare = rows.reduce((sum, row) => sum + row.weightedPercent / 100, 0);
    const kpiProfit = Math.max(0, beforePayroll - fixedPayroll) / (1 + totalShare);
    for (const row of rows) {
      if (row.employee.joined_on > end) continue;
      const kpi = money(kpiProfit * row.weightedPercent / 100);
      const earned = money(row.base + row.bonus - row.fine + kpi);
      result[row.employee.id].push({ month, base: row.base, bonus: row.bonus, fine: row.fine, paid: row.paid, kpi, earned, balance: money(earned - row.paid), kpiProfit: money(kpiProfit), effectiveKpiPercent: row.weightedPercent });
    }
  }
  return result;
}

export function salaryBalance(months: SalaryMonth[]): number {
  return money(months.reduce((sum, month) => sum + month.balance, 0));
}

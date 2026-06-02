'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer
} from 'recharts';
import { formatCurrency, monthRange, currentYearMonth } from '@/lib/utils';
import * as XLSX from 'xlsx';
import type { IncomeTransaction, ExpenseTransaction } from '@/types';

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

export default function MonthlyReportPage() {
  const t  = useTranslations('monthlyReport');
  const ti = useTranslations('income');
  const te = useTranslations('expense');

  const [month, setMonth] = useState(currentYearMonth());
  const [incomes, setIncomes] = useState<IncomeTransaction[]>([]);
  const [expenses, setExpenses] = useState<ExpenseTransaction[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { from, to } = monthRange(month);
    const [{ data: inc }, { data: exp }] = await Promise.all([
      supabase.from('income_transactions').select('*').gte('transaction_date', from).lte('transaction_date', to),
      supabase.from('expense_transactions').select('*').gte('transaction_date', from).lte('transaction_date', to),
    ]);
    setIncomes((inc as IncomeTransaction[]) ?? []);
    setExpenses((exp as ExpenseTransaction[]) ?? []);
    setLoading(false);
  }, [month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalIncome  = incomes.reduce((s, r) => s + r.amount, 0);
  const totalExpense = expenses.reduce((s, r) => s + r.amount, 0);
  const profit = totalIncome - totalExpense;

  // income by category
  const incByCat: Record<string, number> = {};
  incomes.forEach((r) => { incByCat[r.category] = (incByCat[r.category] ?? 0) + r.amount; });
  const incCatData = Object.entries(incByCat).map(([name, value]) => ({ name: ti(`categories.${name}`), value }));

  // expense by category
  const expByCat: Record<string, number> = {};
  expenses.forEach((r) => { expByCat[r.category] = (expByCat[r.category] ?? 0) + r.amount; });
  const expCatData = Object.entries(expByCat).map(([name, value]) => ({ name: te(`categories.${name}`), value }));

  // income by method
  const incByMethod: Record<string, number> = {};
  incomes.forEach((r) => { incByMethod[r.payment_method] = (incByMethod[r.payment_method] ?? 0) + r.amount; });
  const methodData = Object.entries(incByMethod).map(([name, value]) => ({ name: ti(`methods.${name}`), value }));

  // Bar chart: income vs expense by week
  function getWeeklyData() {
    const weeks: Record<string, { week: string; Доход: number; Расход: number }> = {};
    [...incomes, ...expenses].forEach((r: IncomeTransaction | ExpenseTransaction) => {
      const d = new Date(r.transaction_date);
      const weekNum = Math.ceil(d.getDate() / 7);
      const key = `Нед ${weekNum}`;
      if (!weeks[key]) weeks[key] = { week: key, Доход: 0, Расход: 0 };
      if ('payment_method' in r) weeks[key]['Доход'] += r.amount;
      else weeks[key]['Расход'] += r.amount;
    });
    return Object.values(weeks);
  }

  function exportExcel() {
    const ws = XLSX.utils.json_to_sheet([
      ...incomes.map((r) => ({
        Тип: 'Доход',
        Дата: r.transaction_date,
        Сумма: r.amount,
        Категория: ti(`categories.${r.category}`),
        Метод: ti(`methods.${r.payment_method}`),
        Комментарий: r.comment ?? '',
      })),
      ...expenses.map((r) => ({
        Тип: 'Расход',
        Дата: r.transaction_date,
        Сумма: r.amount,
        Категория: te(`categories.${r.category}`),
        Метод: te(`sources.${r.payment_source}`),
        Комментарий: r.comment ?? '',
      })),
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Отчёт');
    XLSX.writeFile(wb, `report-${month}.xlsx`);
  }

  function exportCsv() {
    const rows = [
      ['Тип', 'Дата', 'Сумма', 'Категория', 'Метод', 'Комментарий'],
      ...incomes.map((r) => ['Доход', r.transaction_date, r.amount, r.category, r.payment_method, r.comment ?? '']),
      ...expenses.map((r) => ['Расход', r.transaction_date, r.amount, r.category, r.payment_source, r.comment ?? '']),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${month}.csv`;
    a.click();
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
        <div className="flex gap-2 flex-wrap">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="input-field w-auto"
          />
          <button onClick={exportExcel} className="btn-secondary text-sm">{t('export')}</button>
          <button onClick={exportCsv}   className="btn-secondary text-sm">{t('exportCsv')}</button>
        </div>
      </div>

      {loading && <p className="text-gray-500">Загрузка...</p>}

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: t('income'),  value: totalIncome,  color: 'text-success-700' },
          { label: t('expense'), value: totalExpense, color: 'text-danger-700' },
          { label: t('profit'),  value: profit,       color: profit >= 0 ? 'text-primary-700' : 'text-danger-700' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card text-center">
            <p className="text-sm text-gray-500">{label}</p>
            <p className={`text-xl font-bold mt-1 ${color}`}>{formatCurrency(value)}</p>
          </div>
        ))}
      </div>

      {/* Weekly bar chart */}
      <div className="card">
        <h3 className="font-semibold text-gray-700 mb-4">Доход vs Расход (по неделям)</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={getWeeklyData()}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="week" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: number) => formatCurrency(v)} />
            <Legend />
            <Bar dataKey="Доход"  fill="#22c55e" radius={[4,4,0,0]} />
            <Bar dataKey="Расход" fill="#ef4444" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Income by category pie */}
        {incCatData.length > 0 && (
          <div className="card">
            <h3 className="font-semibold text-gray-700 mb-4">{t('income')} — {t('byCategory')}</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={incCatData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {incCatData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Expense by category pie */}
        {expCatData.length > 0 && (
          <div className="card">
            <h3 className="font-semibold text-gray-700 mb-4">{t('expense')} — {t('byCategory')}</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={expCatData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {expCatData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Income by payment method */}
        {methodData.length > 0 && (
          <div className="card">
            <h3 className="font-semibold text-gray-700 mb-4">{t('byMethod')}</h3>
            <div className="space-y-2">
              {methodData.map(({ name, value }) => (
                <div key={name} className="flex justify-between text-sm">
                  <span className="text-gray-600">{name}</span>
                  <span className="font-medium">{formatCurrency(value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

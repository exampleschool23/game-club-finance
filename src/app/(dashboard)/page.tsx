'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Wallet,
  Receipt,
  TrendingUp,
  Coins,
  ShoppingCart,
  AlertTriangle,
  Banknote,
  CreditCard,
  QrCode,
  ArrowRightLeft,
  UserX,
  Monitor,
  CheckCircle2,
  Package,
  RefreshCcw,
  Clock,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, todayIso } from '@/lib/utils';
import { useDashboardDate } from '@/components/layout/DashboardShell';
import { calculateManualIncome } from '@/lib/calculations/dailyReport';
import type { Product, DailyStockCount } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────────

interface CashEntry {
  cash_income: number;
  terminal_income: number;
  qr_income: number;
  transfer_income: number;
  debt_income: number;
  game_income: number;
  other_income: number;
}

interface StockRow extends Product {
  stockCount?: DailyStockCount;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function emptyEntry(): CashEntry {
  return {
    cash_income: 0,
    terminal_income: 0,
    qr_income: 0,
    transfer_income: 0,
    debt_income: 0,
    game_income: 0,
    other_income: 0,
  };
}

function stockStatus(product: Product): 'Good' | 'Low Stock' | 'Out of Stock' {
  if (product.current_stock === 0) return 'Out of Stock';
  if (product.current_stock <= (product.low_stock_threshold ?? 5)) return 'Low Stock';
  return 'Good';
}

function pct(current: number, previous: number): number {
  if (!previous) return 0;
  return Math.round(((current - previous) / previous) * 100);
}

// ── Sub-components ─────────────────────────────────────────────────────────────

interface OverviewCardProps {
  title: string;
  value: number | string;
  unit?: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  trend?: { value: number; label: string };
  alert?: { label: string; href: string };
}

function OverviewCard({ title, value, unit, icon: Icon, iconBg, iconColor, trend, alert }: OverviewCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${iconBg}`}>
          <Icon size={18} className={iconColor} />
        </div>
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 leading-tight">
          {typeof value === 'number' ? formatCurrency(value) : value}
        </p>
        {unit && <p className="text-xs text-gray-400 mt-0.5">{unit}</p>}
      </div>
      {trend !== undefined && (
        <p className={`text-xs font-medium flex items-center gap-1 ${trend.value >= 0 ? 'text-green-600' : 'text-red-500'}`}>
          {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
        </p>
      )}
      {alert && (
        <Link href={alert.href} className="text-xs font-medium text-red-500 hover:underline">
          {alert.label}
        </Link>
      )}
    </div>
  );
}

interface SalesSummaryCardProps {
  title: string;
  value: number | string;
  unit?: string;
  colorClass: string;
  bgClass: string;
}

function SalesSummaryCard({ title, value, unit, colorClass, bgClass }: SalesSummaryCardProps) {
  return (
    <div className={`rounded-xl p-4 ${bgClass}`}>
      <p className="text-xs font-medium text-gray-500 mb-1">{title}</p>
      <p className={`text-xl font-bold ${colorClass}`}>
        {typeof value === 'number' ? formatCurrency(value) : value}
      </p>
      {unit && <p className="text-xs text-gray-400 mt-0.5">{unit}</p>}
    </div>
  );
}

// ── Income form field ──────────────────────────────────────────────────────────

interface IncomeFieldProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
}

function IncomeField({ label, value, onChange, icon: Icon, iconBg, iconColor }: IncomeFieldProps) {
  const [raw, setRaw] = useState(value === 0 ? '' : String(value));

  useEffect(() => {
    setRaw(value === 0 ? '' : String(value));
  }, [value]);

  return (
    <div className="flex items-center gap-3">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        <Icon size={15} className={iconColor} />
      </div>
      <div className="flex-1 min-w-0">
        <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
        <div className="relative">
          <input
            type="number"
            min="0"
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
              const n = parseFloat(e.target.value);
              onChange(isNaN(n) || n < 0 ? 0 : Math.round(n));
            }}
            placeholder="0"
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm
                       focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                       bg-white pr-14"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
            UZS
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard Page ────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { selectedDate } = useDashboardDate();
  const supabase = createClient();

  // Overview metrics state
  const [metrics, setMetrics] = useState({
    totalIncome: 0,
    totalExpense: 0,
    netProfit: 0,
    barProfit: 0,
    productsSold: 0,
    lowStockCount: 0,
    prevIncome: 0,
    prevExpense: 0,
    prevProfit: 0,
  });

  // Income form state
  const [entry, setEntry] = useState<CashEntry>(emptyEntry());
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Stock state
  const [products, setProducts] = useState<StockRow[]>([]);

  // Sales summary state
  const [barSales, setBarSales] = useState(0);
  const [barProfitSum, setBarProfitSum] = useState(0);
  const [itemsSold, setItemsSold] = useState(0);
  const [costOfGoods, setCostOfGoods] = useState(0);
  const [lastSaleTime, setLastSaleTime] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const yesterday = new Date(selectedDate + 'T00:00:00');
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayIso = yesterday.toISOString().split('T')[0];

    const [cashRes, productsRes, stockRes, expensesRes, prevCashRes, prevStockRes] =
      await Promise.all([
        supabase.from('daily_cash_entries').select('*').eq('date', selectedDate).maybeSingle(),
        supabase.from('products').select('*').eq('is_active', true).order('name'),
        supabase.from('daily_stock_counts').select('*').eq('date', selectedDate),
        supabase.from('expenses').select('amount').eq('date', selectedDate),
        supabase.from('daily_cash_entries').select('*').eq('date', yesterdayIso).maybeSingle(),
        supabase.from('daily_stock_counts').select('bar_income,bar_profit,bar_cost,sold_quantity').eq('date', yesterdayIso),
      ]);

    const cashEntry = cashRes.data;
    const manualIncome = cashEntry
      ? calculateManualIncome({
          cash_income: cashEntry.cash_income ?? 0,
          terminal_income: cashEntry.terminal_income ?? 0,
          qr_income: cashEntry.qr_income ?? 0,
          transfer_income: cashEntry.transfer_income ?? 0,
          debt_income: cashEntry.debt_income ?? 0,
          game_income: cashEntry.game_income ?? 0,
          other_income: cashEntry.other_income ?? 0,
        })
      : 0;

    const counts: DailyStockCount[] = stockRes.data ?? [];
    const barIncome = counts.reduce((s, r) => s + (r.bar_income ?? 0), 0);
    const totalIncome = manualIncome + barIncome;
    const totalExpense = (expensesRes.data ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);
    const netProfit = totalIncome - totalExpense;
    const barProfitTotal = counts.reduce((s, r) => s + (r.bar_profit ?? 0), 0);
    const productsSoldTotal = counts.reduce((s, r) => s + (r.sold_quantity ?? 0), 0);
    const costOfGoodsTotal = counts.reduce((s, r) => s + (r.bar_cost ?? 0), 0);

    const allProducts: Product[] = productsRes.data ?? [];
    const lowCount = allProducts.filter(
      (p) => p.current_stock <= (p.low_stock_threshold ?? 5),
    ).length;

    // Yesterday's numbers for trend
    const prevCash = prevCashRes.data;
    const prevManual = prevCash
      ? calculateManualIncome({
          cash_income: prevCash.cash_income ?? 0,
          terminal_income: prevCash.terminal_income ?? 0,
          qr_income: prevCash.qr_income ?? 0,
          transfer_income: prevCash.transfer_income ?? 0,
          debt_income: prevCash.debt_income ?? 0,
          game_income: prevCash.game_income ?? 0,
          other_income: prevCash.other_income ?? 0,
        })
      : 0;
    const prevBarIncome = (prevStockRes.data ?? []).reduce((s: number, r: { bar_income?: number }) => s + (r.bar_income ?? 0), 0);
    const prevIncome = prevManual + prevBarIncome;

    // Stock rows merged with counts
    const stockMap = new Map(counts.map((c) => [c.product_id, c]));
    const stockRows: StockRow[] = allProducts.map((p) => ({
      ...p,
      stockCount: stockMap.get(p.id),
    }));

    // Pre-fill form
    if (cashEntry) {
      setEntry({
        cash_income: cashEntry.cash_income ?? 0,
        terminal_income: cashEntry.terminal_income ?? 0,
        qr_income: cashEntry.qr_income ?? 0,
        transfer_income: cashEntry.transfer_income ?? 0,
        debt_income: cashEntry.debt_income ?? 0,
        game_income: cashEntry.game_income ?? 0,
        other_income: cashEntry.other_income ?? 0,
      });
    } else {
      setEntry(emptyEntry());
    }

    setMetrics({
      totalIncome,
      totalExpense,
      netProfit,
      barProfit: barProfitTotal,
      productsSold: productsSoldTotal,
      lowStockCount: lowCount,
      prevIncome,
      prevExpense: 0,
      prevProfit: 0,
    });
    setProducts(stockRows);
    setBarSales(barIncome);
    setBarProfitSum(barProfitTotal);
    setItemsSold(productsSoldTotal);
    setCostOfGoods(costOfGoodsTotal);

    // Last sale time from most recent stock count
    if (counts.length > 0) {
      const sorted = [...counts].sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      );
      const d = new Date(sorted[0].updated_at);
      setLastSaleTime(d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    } else {
      setLastSaleTime(null);
    }
  }, [selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalEntryIncome = Object.values(entry).reduce((s, v) => s + v, 0);

  async function handleSaveIncome() {
    setSaving(true);
    setSaveSuccess(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await supabase.from('daily_cash_entries').upsert(
        {
          date: selectedDate,
          ...entry,
          created_by: session?.user?.id ?? null,
        },
        { onConflict: 'date' },
      );
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      fetchData();
    } finally {
      setSaving(false);
    }
  }

  function setField(field: keyof CashEntry, value: number) {
    setEntry((prev) => ({ ...prev, [field]: value }));
  }

  const avgProfitPct =
    barSales > 0 ? Math.round((barProfitSum / barSales) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* ── Today Overview ────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Today Overview
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          <OverviewCard
            title="Total Income"
            value={metrics.totalIncome}
            unit="UZS"
            icon={Wallet}
            iconBg="bg-green-100"
            iconColor="text-green-600"
            trend={{ value: pct(metrics.totalIncome, metrics.prevIncome), label: 'vs yesterday' }}
          />
          <OverviewCard
            title="Total Expense"
            value={metrics.totalExpense}
            unit="UZS"
            icon={Receipt}
            iconBg="bg-red-100"
            iconColor="text-red-500"
            trend={{ value: 0, label: 'vs yesterday' }}
          />
          <OverviewCard
            title="Net Profit"
            value={metrics.netProfit}
            unit="UZS"
            icon={TrendingUp}
            iconBg="bg-blue-100"
            iconColor="text-blue-600"
            trend={{ value: pct(metrics.netProfit, metrics.prevProfit), label: 'vs yesterday' }}
          />
          <OverviewCard
            title="Bar Profit"
            value={metrics.barProfit}
            unit="UZS"
            icon={Coins}
            iconBg="bg-orange-100"
            iconColor="text-orange-600"
            trend={{ value: 0, label: 'vs yesterday' }}
          />
          <OverviewCard
            title="Products Sold"
            value={metrics.productsSold}
            unit="items"
            icon={ShoppingCart}
            iconBg="bg-purple-100"
            iconColor="text-purple-600"
            trend={{ value: 0, label: 'vs yesterday' }}
          />
          <OverviewCard
            title="Low Stock Items"
            value={metrics.lowStockCount}
            unit="products"
            icon={AlertTriangle}
            iconBg="bg-blue-100"
            iconColor="text-blue-600"
            alert={metrics.lowStockCount > 0 ? { label: 'Check inventory', href: '/products' } : undefined}
          />
        </div>
      </section>

      {/* ── Middle two-column ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* LEFT: Income Form */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col gap-4">
          <div>
            <h2 className="font-semibold text-gray-900 text-base">1. Add Today Income</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Enter how much income you had today by payment method
            </p>
          </div>

          <div className="space-y-3">
            <IncomeField
              label="Cash Income (UZS)"
              value={entry.cash_income}
              onChange={(v) => setField('cash_income', v)}
              icon={Banknote}
              iconBg="bg-green-100"
              iconColor="text-green-600"
            />
            <IncomeField
              label="Terminal Income (UZS)"
              value={entry.terminal_income}
              onChange={(v) => setField('terminal_income', v)}
              icon={Monitor}
              iconBg="bg-blue-100"
              iconColor="text-blue-600"
            />
            <IncomeField
              label="Card Income (UZS)"
              value={entry.game_income}
              onChange={(v) => setField('game_income', v)}
              icon={CreditCard}
              iconBg="bg-purple-100"
              iconColor="text-purple-600"
            />
            <IncomeField
              label="QR Code Income (UZS)"
              value={entry.qr_income}
              onChange={(v) => setField('qr_income', v)}
              icon={QrCode}
              iconBg="bg-orange-100"
              iconColor="text-orange-600"
            />
            <IncomeField
              label="Transfer Income (UZS)"
              value={entry.transfer_income}
              onChange={(v) => setField('transfer_income', v)}
              icon={ArrowRightLeft}
              iconBg="bg-teal-100"
              iconColor="text-teal-600"
            />
            <IncomeField
              label="Debt Income (UZS)"
              value={entry.debt_income}
              onChange={(v) => setField('debt_income', v)}
              icon={UserX}
              iconBg="bg-red-100"
              iconColor="text-red-500"
            />
          </div>

          <button
            onClick={handleSaveIncome}
            disabled={saving}
            className="w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold
                       py-2.5 rounded-xl transition-colors disabled:opacity-50 flex items-center
                       justify-center gap-2 text-sm"
          >
            {saving ? (
              'Saving...'
            ) : saveSuccess ? (
              <>
                <CheckCircle2 size={16} /> Saved!
              </>
            ) : (
              <>
                <CheckCircle2 size={16} /> Save Today Income
              </>
            )}
          </button>

          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <span className="text-sm font-medium text-gray-600">Total Income Today</span>
            <span className="text-sm font-bold text-green-600">
              {formatCurrency(totalEntryIncome)} UZS
            </span>
          </div>
        </div>

        {/* RIGHT: Stock table */}
        <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-gray-900 text-base">2. Current Stock (Inventory)</h2>
                <p className="text-xs text-gray-500 mt-0.5">Live product stock levels</p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Link
                  href="/products"
                  className="flex items-center gap-1 px-3 py-1.5 border border-gray-200
                             rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <Package size={13} /> Add Product
                </Link>
                <Link
                  href="/closing-stock"
                  className="flex items-center gap-1 px-3 py-1.5 border border-gray-200
                             rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <RefreshCcw size={13} /> Adjust Stock
                </Link>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-2.5 text-left">Product</th>
                  <th className="px-4 py-2.5 text-left hidden sm:table-cell">Category</th>
                  <th className="px-4 py-2.5 text-right">Sale Price</th>
                  <th className="px-4 py-2.5 text-right hidden md:table-cell">Cost Price</th>
                  <th className="px-4 py-2.5 text-right">Stock</th>
                  <th className="px-4 py-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {products.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">
                      No products found
                    </td>
                  </tr>
                ) : (
                  products.map((p) => {
                    const status = stockStatus(p);
                    const stockValue = p.current_stock * p.cost_price;
                    return (
                      <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                        <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                          {p.category ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">
                          {formatCurrency(p.sale_price)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700 hidden md:table-cell">
                          {formatCurrency(p.cost_price)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">
                          {p.current_stock}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              status === 'Good'
                                ? 'bg-green-100 text-green-700'
                                : status === 'Low Stock'
                                ? 'bg-orange-100 text-orange-700'
                                : 'bg-red-100 text-red-600'
                            }`}
                          >
                            {status}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Total stock value footer */}
          {products.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50 rounded-b-xl">
              <span className="text-sm font-semibold text-gray-600">Total Stock Value</span>
              <span className="text-sm font-bold text-gray-900">
                {formatCurrency(products.reduce((s, p) => s + p.current_stock * p.cost_price, 0))} UZS
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom: Sales Summary ─────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          3. Today Sales Summary (Auto Calculated)
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          <SalesSummaryCard
            title="Bar Sales (Total)"
            value={barSales}
            unit="UZS"
            colorClass="text-green-700"
            bgClass="bg-green-50 border border-green-100"
          />
          <SalesSummaryCard
            title="Bar Profit"
            value={barProfitSum}
            unit="UZS"
            colorClass="text-orange-700"
            bgClass="bg-orange-50 border border-orange-100"
          />
          <SalesSummaryCard
            title="Items Sold"
            value={itemsSold}
            unit="items"
            colorClass="text-purple-700"
            bgClass="bg-purple-50 border border-purple-100"
          />
          <SalesSummaryCard
            title="Cost of Sold Goods"
            value={costOfGoods}
            unit="UZS"
            colorClass="text-gray-700"
            bgClass="bg-gray-100 border border-gray-200"
          />
          <SalesSummaryCard
            title="Average Profit %"
            value={`${avgProfitPct}%`}
            colorClass="text-green-700"
            bgClass="bg-green-50 border border-green-100"
          />
          <div className="rounded-xl p-4 bg-blue-50 border border-blue-100">
            <p className="text-xs font-medium text-gray-500 mb-1">Last Sale</p>
            <div className="flex items-center gap-1.5 mt-1">
              <Clock size={16} className="text-blue-600" />
              <span className="text-base font-bold text-blue-700">
                {lastSaleTime ?? '—'}
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

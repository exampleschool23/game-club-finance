'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, todayIso } from '@/lib/utils';
import { formatDateOnly } from '@/lib/formatters';
import {
  calculateClosingStockDefaults,
  calculateStockCountSummary,
} from '@/lib/calculations/stock';
import {
  Box,
  Calendar,
  ChevronDown,
  Coins,
  FileBox,
  HelpCircle,
  Info,
  Package,
  Save,
  Search,
  TrendingUp,
  Upload,
} from 'lucide-react';
import type { Product } from '@/types';

interface PurchaseQuantity {
  product_id: string;
  quantity: number;
}

interface RowData {
  product: Product;
  previousStock: string;
  addedToday: string;
  closingStock: string;
}

function parseNum(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}


function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export default function ClosingStockPage() {
  const t = useTranslations('closingStock');
  const tc = useTranslations('common');
  const [date, setDate] = useState(todayIso());
  const [rows, setRows] = useState<RowData[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const loadData = useCallback(async (selectedDate: string) => {
    setLoading(true);
    const supabase = createClient();

    const [productsRes, countsRes, purchasesRes] = await Promise.all([
      supabase.from('products').select('*').eq('is_active', true).order('name'),
      supabase.from('daily_stock_counts').select('*').eq('date', selectedDate),
      supabase.from('stock_purchases').select('product_id, quantity').eq('date', selectedDate),
    ]);

    if (productsRes.error || countsRes.error || purchasesRes.error) {
      setError(productsRes.error?.message ?? countsRes.error?.message ?? purchasesRes.error?.message ?? tc('error'));
      setRows([]);
      setLoading(false);
      return;
    }

    const products = productsRes.data ?? [];
    const counts = countsRes.data ?? [];
    const purchasesByProduct = ((purchasesRes.data as PurchaseQuantity[]) ?? []).reduce<Record<string, number>>(
      (acc, purchase) => {
        acc[purchase.product_id] = (acc[purchase.product_id] ?? 0) + Number(purchase.quantity ?? 0);
        return acc;
      },
      {},
    );

    setRows(
      products.map((product) => {
        const existing = counts.find((count) => count.product_id === product.id);
        const defaults = calculateClosingStockDefaults({
          currentStock: product.current_stock,
          purchasedToday: purchasesByProduct[product.id] ?? 0,
        });
        return {
          product,
          previousStock: existing ? String(existing.previous_stock) : String(defaults.previousStock),
          addedToday: existing ? String(existing.added_today) : String(defaults.addedToday),
          closingStock: existing ? String(existing.closing_stock) : String(defaults.closingStock),
        };
      }),
    );
    setLoading(false);
  }, [tc]);

  useEffect(() => {
    loadData(date).catch((err) => {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    });
  }, [date, loadData]);

  function updateRow(index: number, field: 'previousStock' | 'addedToday' | 'closingStock', value: string) {
    setRows((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  }

  function rowSummary(row: RowData) {
    return calculateStockCountSummary({
      previousStock: parseNum(row.previousStock),
      addedToday: parseNum(row.addedToday),
      closingStock: parseNum(row.closingStock),
      salePrice: row.product.sale_price,
      costPrice: row.product.cost_price,
    });
  }

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => row.product.name.toLowerCase().includes(needle));
  }, [query, rows]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        const summary = rowSummary(row);
        acc.sold += summary.soldQuantity;
        acc.income += summary.barIncome;
        acc.profit += summary.barProfit;
        acc.stockValue += parseNum(row.closingStock) * row.product.cost_price;
        acc.previous += parseNum(row.previousStock);
        acc.added += parseNum(row.addedToday);
        return acc;
      },
      { sold: 0, income: 0, profit: 0, stockValue: 0, previous: 0, added: 0 },
    );
  }, [rows]);

  async function handleSave() {
    setSaving(true);
    setError('');
    setSuccess('');
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    const upserts = rows.map((row) => {
      const prev = parseNum(row.previousStock);
      const added = parseNum(row.addedToday);
      const closing = parseNum(row.closingStock);
      const { soldQuantity, barIncome, barCost, barProfit } = calculateStockCountSummary({
        previousStock: prev,
        addedToday: added,
        closingStock: closing,
        salePrice: row.product.sale_price,
        costPrice: row.product.cost_price,
      });

      return {
        date,
        product_id: row.product.id,
        previous_stock: prev,
        added_today: added,
        closing_stock: closing,
        sold_quantity: soldQuantity,
        sale_price: row.product.sale_price,
        cost_price: row.product.cost_price,
        bar_income: barIncome,
        bar_cost: barCost,
        bar_profit: barProfit,
        created_by: session?.user?.id ?? null,
        updated_at: new Date().toISOString(),
      };
    });

    const { error: err } = await supabase
      .from('daily_stock_counts')
      .upsert(upserts, { onConflict: 'date,product_id' });

    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }

    setSuccess(t('success'));
    await loadData(date);
  }

  const kpis = [
    { label: 'Total Products', value: rows.length, unit: 'items', icon: Box, color: 'text-primary-600', bg: 'bg-primary-50' },
    { label: 'Total Sold (Est.)', value: totals.sold, unit: 'pcs', icon: FileBox, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: 'Bar Income (Est.)', value: formatCurrency(totals.income), unit: tc('currency'), icon: Coins, color: 'text-success-600', bg: 'bg-success-50' },
    { label: 'Bar Profit (Est.)', value: formatCurrency(totals.profit), unit: tc('currency'), icon: TrendingUp, color: 'text-success-600', bg: 'bg-success-50' },
    { label: 'Stock Value', value: formatCurrency(totals.stockValue), unit: tc('currency'), icon: Coins, color: 'text-gray-900', bg: 'bg-gray-100' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-950">{t('title')}</h1>
          <div className="mt-2 flex items-center gap-2 text-sm text-gray-500">
            <span>Dashboard</span>
            <span>›</span>
            <span>{t('title')}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="flex min-h-11 items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 shadow-sm">
            <Calendar size={17} className="text-gray-500" />
            <input
              type="date"
              className="w-[128px] bg-transparent text-gray-900 outline-none"
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                setSuccess('');
                setError('');
              }}
            />
            <span className="hidden min-w-[118px] sm:inline">{formatDateOnly(date)}</span>
            <ChevronDown size={16} className="text-gray-400" />
          </label>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="btn-secondary flex min-h-11 items-center justify-center gap-2 border border-gray-200 bg-white"
          >
            <Save size={16} />
            Save Draft
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="btn-primary flex min-h-11 items-center justify-center gap-2 px-5"
          >
            <Package size={16} />
            {saving ? tc('saving') : t('submit')}
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-primary-200 bg-primary-50/40 px-5 py-4">
        <div className="flex gap-3">
          <Info size={20} className="mt-0.5 flex-shrink-0 text-primary-600" />
          <div>
            <p className="font-semibold text-gray-900">Enter remaining (closing) stock for each product</p>
            <p className="mt-1 text-sm text-gray-600">Sold quantity, bar income and profit will be calculated automatically.</p>
          </div>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {kpis.map(({ label, value, unit, icon: Icon, color, bg }) => (
          <div key={label} className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
            <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-4">
              <div className={`flex h-12 w-12 items-center justify-center rounded-full ${bg}`}>
                <Icon size={22} className={color} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-600">{label}</p>
                <p className={`mt-1 break-words text-2xl font-bold leading-tight tabular-nums ${color}`}>{value}</p>
                <p className="mt-1 text-xs font-medium text-gray-500">{unit}</p>
              </div>
            </div>
          </div>
        ))}
      </section>

      {error && <p className="rounded-lg bg-danger-50 px-4 py-3 text-sm font-medium text-danger-600">{error}</p>}
      {success && <p className="rounded-lg bg-success-50 px-4 py-3 text-sm font-medium text-success-600">{success}</p>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="min-w-0 overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <h2 className="text-lg font-bold text-gray-900">Products</h2>
              <div className="relative w-full md:w-72">
                <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  className="input-field h-10 pl-9"
                  placeholder="Search product..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            </div>
            <button className="btn-secondary flex min-h-10 items-center justify-center gap-2 border border-gray-200 bg-white">
              <Upload size={16} />
              Import from Excel
            </button>
          </div>

          {loading ? (
            <div className="p-8 text-gray-500">{tc('loading')}</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-gray-500">{tc('noData')}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <th className="w-12 px-5 py-4 text-left">#</th>
                    <th className="min-w-[250px] px-4 py-4 text-left">{t('product')}</th>
                    <th className="px-4 py-4 text-right">Cost Basis<br /><span className="font-normal normal-case">({tc('currency')})</span></th>
                    <th className="px-4 py-4 text-center">{t('previousStock')}<br /><span className="font-normal normal-case">(pcs)</span></th>
                    <th className="px-4 py-4 text-center">{t('addedToday')}<br /><span className="font-normal normal-case">(pcs)</span></th>
                    <th className="px-4 py-4 text-center">{t('closingStock')}<br /><span className="rounded-full bg-primary-100 px-2 py-0.5 text-primary-700 normal-case">You enter</span></th>
                    <th className="px-4 py-4 text-center">{t('soldQty')}<br /><span className="font-normal normal-case">(pcs)</span></th>
                    <th className="px-4 py-4 text-right">{t('barIncome')}<br /><span className="font-normal normal-case">({tc('currency')})</span></th>
                    <th className="px-5 py-4 text-right">{t('barProfit')}<br /><span className="font-normal normal-case">({tc('currency')})</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredRows.map((row) => {
                    const originalIndex = rows.findIndex((candidate) => candidate.product.id === row.product.id);
                    const summary = rowSummary(row);
                    return (
                      <tr key={row.product.id} className="hover:bg-gray-50/80">
                        <td className="px-5 py-4 font-semibold text-gray-700">{originalIndex + 1}</td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-4">
                            <div className="flex h-12 w-9 flex-shrink-0 items-center justify-center rounded-md bg-gray-100 text-xs font-bold text-gray-500">
                              {initials(row.product.name)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-gray-900">{row.product.name}</p>
                              <p className="mt-1 text-xs text-gray-500">Sale: {formatCurrency(row.product.sale_price)} {tc('currency')}</p>
                              <p className="text-xs text-gray-500">Cost: {formatCurrency(row.product.cost_price)} {tc('currency')}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <p className="font-semibold text-gray-900">{formatCurrency(row.product.cost_price)}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            Value: {formatCurrency(parseNum(row.closingStock) * row.product.cost_price)}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-center font-medium text-gray-900">{parseNum(row.previousStock)}</td>
                        <td className="px-4 py-4 text-center font-medium text-gray-900">{parseNum(row.addedToday)}</td>
                        <td className="px-4 py-4">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="input-field mx-auto h-10 w-32 text-center font-semibold"
                            value={row.closingStock}
                            onChange={(event) => updateRow(originalIndex, 'closingStock', event.target.value)}
                          />
                        </td>
                        <td className="px-4 py-4 text-center font-semibold text-gray-900">{summary.soldQuantity}</td>
                        <td className="px-4 py-4 text-right font-semibold text-success-600">{formatCurrency(summary.barIncome)}</td>
                        <td className="px-5 py-4 text-right font-semibold text-success-600">{formatCurrency(summary.barProfit)}</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-white font-bold text-gray-900">
                    <td className="px-5 py-4" />
                    <td className="px-4 py-4">Total ({rows.length} products)</td>
                    <td className="px-4 py-4 text-right">{formatCurrency(totals.stockValue)}</td>
                    <td className="px-4 py-4 text-center">{totals.previous}</td>
                    <td className="px-4 py-4 text-center">{totals.added}</td>
                    <td className="px-4 py-4 text-center">—</td>
                    <td className="px-4 py-4 text-center">{totals.sold}</td>
                    <td className="px-4 py-4 text-right text-success-600">{formatCurrency(totals.income)}</td>
                    <td className="px-5 py-4 text-right text-success-600">{formatCurrency(totals.profit)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <div className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-gray-900">How it works</h3>
            <div className="mt-4 space-y-5">
              {[
                ['Enter closing stock', 'Type how many items are left now.'],
                ['We calculate', 'Sold quantity, bar income and profit are calculated automatically.'],
                ['Save', 'Your closing stock will be saved for this date.'],
              ].map(([title, body], index) => (
                <div key={title} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-700">{index + 1}</span>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-gray-500">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-gray-900">Formulas</h3>
            <div className="mt-4 space-y-4 text-sm">
              <div>
                <p className="font-semibold text-gray-900">Sold Qty =</p>
                <p className="mt-1 text-xs leading-5 text-gray-500">Previous Stock + Added Today - Closing Stock</p>
              </div>
              <div>
                <p className="font-semibold text-gray-900">Bar Income =</p>
                <p className="mt-1 text-xs leading-5 text-gray-500">Sold Qty x Sale Price</p>
              </div>
              <div>
                <p className="font-semibold text-gray-900">Bar Profit =</p>
                <p className="mt-1 text-xs leading-5 text-gray-500">(Sale Price - Cost Price) x Sold Qty</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <HelpCircle size={18} className="text-primary-600" />
              <h3 className="font-bold text-gray-900">Need help?</h3>
            </div>
            <p className="mt-3 text-sm leading-6 text-gray-500">If something looks wrong, check your product prices and added stock.</p>
            <a href="/products" className="btn-secondary mt-4 inline-flex min-h-10 items-center gap-2 border border-gray-200 bg-white">
              <Package size={16} />
              View Products
            </a>
          </div>
        </aside>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, todayIso } from '@/lib/utils';
import { formatDateOnly, formatDatePickerValue } from '@/lib/formatters';
import {
  calculateClosingStockDefaults,
  recalculateFutureStockCounts,
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
import type { Product, UserRole } from '@/types';

interface PurchaseQuantity {
  product_id: string;
  quantity: number;
}

interface PreviousClosing {
  product_id: string;
  closing_stock: number;
}

interface FutureStockCountRow {
  id: string;
  product_id: string;
  date: string;
  added_today: number;
  closing_stock: number;
  sale_price: number;
  cost_price: number;
}

interface StockCountRow {
  product_id: string;
  previous_stock: number;
  added_today: number;
  closing_stock: number;
  sale_price: number;
  cost_price: number;
  products?:
    | Pick<Product, 'id' | 'name' | 'category' | 'current_stock' | 'low_stock_threshold' | 'sort_order' | 'is_active' | 'is_deleted' | 'created_at' | 'updated_at'>
    | Pick<Product, 'id' | 'name' | 'category' | 'current_stock' | 'low_stock_threshold' | 'sort_order' | 'is_active' | 'is_deleted' | 'created_at' | 'updated_at'>[]
    | null;
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

function sortRowsByProductOrder(rows: RowData[]): RowData[] {
  return [...rows].sort((a, b) => {
    const orderA = a.product.sort_order ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.product.sort_order ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return a.product.name.localeCompare(b.product.name);
  });
}

function isMissingSortOrder(error: { message?: string } | null | undefined) {
  return error?.message?.includes('sort_order') ?? false;
}

function isMissingDeletedColumn(error: { message?: string } | null | undefined) {
  return error?.message?.includes('is_deleted') ?? false;
}

async function fetchActiveProductsOrdered(supabase: ReturnType<typeof createClient>) {
  const ordered = await supabase
    .from('products')
    .select('*')
    .eq('is_active', true)
    .eq('is_deleted', false)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (!ordered.error) return ordered;

  if (isMissingSortOrder(ordered.error)) {
    const named = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .eq('is_deleted', false)
      .order('name', { ascending: true });

    if (!named.error) return named;
  }

  if (!isMissingDeletedColumn(ordered.error)) return ordered;

  return supabase
    .from('products')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true });
}

async function fetchPreviousClosings(supabase: ReturnType<typeof createClient>, selectedDate: string) {
  const { data, error } = await supabase
    .from('daily_stock_counts')
    .select('product_id,closing_stock')
    .lt('date', selectedDate)
    .order('date', { ascending: false });

  if (error) return { data: null, error };

  const previousClosings = ((data as PreviousClosing[]) ?? []).reduce<Record<string, number>>(
    (acc, row) => {
      if (acc[row.product_id] === undefined) {
        acc[row.product_id] = Number(row.closing_stock ?? 0);
      }
      return acc;
    },
    {},
  );

  return { data: previousClosings, error: null };
}

async function recalculateSavedFutureRows(
  supabase: ReturnType<typeof createClient>,
  selectedDate: string,
  savedClosings: Record<string, number>,
) {
  const productIds = Object.keys(savedClosings);
  if (productIds.length === 0) return null;

  const { data, error } = await supabase
    .from('daily_stock_counts')
    .select('id,product_id,date,added_today,closing_stock,sale_price,cost_price')
    .in('product_id', productIds)
    .gt('date', selectedDate)
    .order('date', { ascending: true });

  if (error) return error;

  const rowsByProduct = ((data as FutureStockCountRow[]) ?? []).reduce<Record<string, FutureStockCountRow[]>>(
    (acc, row) => {
      acc[row.product_id] = [...(acc[row.product_id] ?? []), row];
      return acc;
    },
    {},
  );

  const updates = Object.entries(rowsByProduct).flatMap(([productId, futureRows]) =>
    recalculateFutureStockCounts(savedClosings[productId], futureRows).map((row) => {
      const original = futureRows.find((candidate) => candidate.date === row.date);
      return {
        id: original?.id,
        previous_stock: row.previous_stock,
        sold_quantity: row.sold_quantity,
        bar_income: row.bar_income,
        bar_cost: row.bar_cost,
        bar_profit: row.bar_profit,
        updated_at: new Date().toISOString(),
      };
    }),
  ).filter((row): row is { id: string; previous_stock: number; sold_quantity: number; bar_income: number; bar_cost: number; bar_profit: number; updated_at: string } => Boolean(row.id));

  const results = await Promise.all(
    updates.map((row) =>
      supabase
        .from('daily_stock_counts')
        .update({
          previous_stock: row.previous_stock,
          sold_quantity: row.sold_quantity,
          bar_income: row.bar_income,
          bar_cost: row.bar_cost,
          bar_profit: row.bar_profit,
          updated_at: row.updated_at,
        })
        .eq('id', row.id),
    ),
  );

  return results.find((result) => result.error)?.error ?? null;
}

export default function ClosingStockPage() {
  const t = useTranslations('closingStock');
  const tc = useTranslations('common');
  const today = todayIso();
  const [date, setDate] = useState(todayIso());
  const [rows, setRows] = useState<RowData[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [currentRole, setCurrentRole] = useState<UserRole | null>(null);
  const isHistoricalDate = date < today;
  const isOwner = currentRole === 'owner';
  const isReadOnly = isHistoricalDate && !isOwner;

  const buildEditableRows = useCallback(
    (
      products: Product[],
      counts: Array<Record<string, number | string>>,
      purchases: PurchaseQuantity[],
      previousClosings: Record<string, number>,
    ) => {
      const purchasesByProduct = purchases.reduce<Record<string, number>>(
        (acc, purchase) => {
          acc[purchase.product_id] = (acc[purchase.product_id] ?? 0) + Number(purchase.quantity ?? 0);
          return acc;
        },
        {},
      );

      return sortRowsByProductOrder(products.map((product) => {
        const existing = counts.find((count) => count.product_id === product.id);
        const addedToday = purchasesByProduct[product.id] ?? 0;
        const defaults = calculateClosingStockDefaults({
          currentStock: product.current_stock,
          purchasedToday: addedToday,
        });
        const previousClosing = previousClosings[product.id];
        const previousStock = previousClosing ?? defaults.previousStock;

        return {
          product,
          previousStock: existing ? String(existing.previous_stock) : String(previousStock),
          addedToday: existing ? String(existing.added_today) : String(defaults.addedToday),
          closingStock: existing ? String(existing.closing_stock) : String(previousClosing === undefined ? defaults.closingStock : previousStock + addedToday),
        };
      }));
    },
    [],
  );

  const loadData = useCallback(async (selectedDate: string) => {
    setLoading(true);
    setError('');
    setSuccess('');
    const supabase = createClient();
    const readOnlyDate = selectedDate < todayIso();

    if (readOnlyDate) {
      const countsWithOrder = await supabase
        .from('daily_stock_counts')
        .select('product_id,previous_stock,added_today,closing_stock,sale_price,cost_price,products(id,name,category,current_stock,low_stock_threshold,sort_order,is_active,is_deleted,created_at,updated_at)')
        .eq('date', selectedDate)
        .order('updated_at', { ascending: false });

      let data: unknown = countsWithOrder.data;
      let countsError = countsWithOrder.error;

      if (isMissingSortOrder(countsWithOrder.error)) {
        const countsWithoutOrder = await supabase
          .from('daily_stock_counts')
          .select('product_id,previous_stock,added_today,closing_stock,sale_price,cost_price,products(id,name,category,current_stock,low_stock_threshold,is_active,is_deleted,created_at,updated_at)')
          .eq('date', selectedDate)
          .order('updated_at', { ascending: false });

        data = countsWithoutOrder.data;
        countsError = countsWithoutOrder.error;
      }

      if (countsError) {
        setError(countsError.message);
        setRows([]);
        setLoading(false);
        return;
      }

      const stockCountRows = (data as StockCountRow[] | null) ?? [];

      if (stockCountRows.length === 0 && currentRole === 'owner') {
        const [productsRes, purchasesRes, previousClosingsRes] = await Promise.all([
          fetchActiveProductsOrdered(supabase),
          supabase.from('stock_purchases').select('product_id, quantity').eq('date', selectedDate),
          fetchPreviousClosings(supabase, selectedDate),
        ]);

        if (productsRes.error || purchasesRes.error || previousClosingsRes.error) {
          setError(productsRes.error?.message ?? purchasesRes.error?.message ?? previousClosingsRes.error?.message ?? tc('error'));
          setRows([]);
          setLoading(false);
          return;
        }

        setRows(
          buildEditableRows(
            (productsRes.data ?? []) as Product[],
            [],
            ((purchasesRes.data as PurchaseQuantity[]) ?? []),
            previousClosingsRes.data ?? {},
          ),
        );
        setLoading(false);
        return;
      }

      setRows(
        sortRowsByProductOrder(stockCountRows.flatMap((count) => {
          const relation = Array.isArray(count.products) ? count.products[0] : count.products;
          if (relation?.is_deleted) return [];
          const product: Product = {
            id: relation?.id ?? count.product_id,
            name: relation?.name ?? t('unknownProduct'),
            category: relation?.category ?? null,
            sale_price: Number(count.sale_price ?? 0),
            cost_price: Number(count.cost_price ?? 0),
            current_stock: relation?.current_stock ?? Number(count.closing_stock ?? 0),
            low_stock_threshold: relation?.low_stock_threshold ?? null,
            sort_order: relation?.sort_order ?? null,
            is_active: relation?.is_active ?? false,
            is_deleted: relation?.is_deleted ?? false,
            created_at: relation?.created_at ?? '',
            updated_at: relation?.updated_at ?? '',
          };

          return [{
            product,
            previousStock: String(count.previous_stock ?? 0),
            addedToday: String(count.added_today ?? 0),
            closingStock: String(count.closing_stock ?? 0),
          }];
        })),
      );
      setLoading(false);
      return;
    }

    const [productsRes, countsRes, purchasesRes, previousClosingsRes] = await Promise.all([
      fetchActiveProductsOrdered(supabase),
      supabase.from('daily_stock_counts').select('*').eq('date', selectedDate),
      supabase.from('stock_purchases').select('product_id, quantity').eq('date', selectedDate),
      fetchPreviousClosings(supabase, selectedDate),
    ]);

    if (productsRes.error || countsRes.error || purchasesRes.error || previousClosingsRes.error) {
      setError(productsRes.error?.message ?? countsRes.error?.message ?? purchasesRes.error?.message ?? previousClosingsRes.error?.message ?? tc('error'));
      setRows([]);
      setLoading(false);
      return;
    }

    setRows(
      buildEditableRows(
        (productsRes.data ?? []) as Product[],
        (countsRes.data ?? []) as Array<Record<string, number | string>>,
        ((purchasesRes.data as PurchaseQuantity[]) ?? []),
        previousClosingsRes.data ?? {},
      ),
    );
    setLoading(false);
  }, [buildEditableRows, currentRole, t, tc]);

  useEffect(() => {
    loadData(date).catch((err) => {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    });
  }, [date, loadData]);

  useEffect(() => {
    async function loadCurrentRole() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user?.id) {
        setCurrentRole(null);
        return;
      }

      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      setCurrentRole((data?.role as UserRole | undefined) ?? null);
    }

    loadCurrentRole().catch(() => setCurrentRole(null));
  }, []);

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
    if (isReadOnly) {
      setError(t('readOnlyBody'));
      return;
    }

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

    if (err) {
      setSaving(false);
      setError(err.message);
      return;
    }

    const savedClosings = upserts.reduce<Record<string, number>>((acc, row) => {
      acc[row.product_id] = row.closing_stock;
      return acc;
    }, {});
    const cascadeError = await recalculateSavedFutureRows(supabase, date, savedClosings);

    setSaving(false);

    if (cascadeError) {
      setError(cascadeError.message);
      return;
    }

    setSuccess(t('success'));
    await loadData(date);
  }

  const kpis = [
    { label: t('totalProducts'), value: rows.length, unit: t('items'), icon: Box, color: 'text-primary-600', bg: 'bg-primary-50' },
    { label: t('stockPurchased'), value: totals.added, unit: t('pcs'), icon: Package, color: 'text-orange-600', bg: 'bg-orange-50' },
    { label: t('totalSold'), value: totals.sold, unit: t('pcs'), icon: FileBox, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: t('barIncomeEst'), value: formatCurrency(totals.income), unit: tc('currency'), icon: Coins, color: 'text-success-600', bg: 'bg-success-50' },
    { label: t('barProfitEst'), value: formatCurrency(totals.profit), unit: tc('currency'), icon: TrendingUp, color: 'text-success-600', bg: 'bg-success-50' },
    { label: t('stockValue'), value: formatCurrency(totals.stockValue), unit: tc('currency'), icon: Coins, color: 'text-gray-900', bg: 'bg-gray-100' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-950">{t('title')}</h1>
          <div className="mt-2 flex items-center gap-2 text-sm text-gray-500">
            <span>{t('dashboard')}</span>
            <span>›</span>
            <span>{t('title')}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative block h-11 w-full cursor-pointer sm:w-[300px]">
            <input
              type="date"
              max={today}
              className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
              value={date}
              onClick={(event) => event.currentTarget.showPicker?.()}
              onChange={(event) => {
                setDate(event.target.value);
                setSuccess('');
                setError('');
              }}
            />
            <span className="pointer-events-none flex h-full items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 text-sm shadow-sm transition peer-focus:border-primary-500 peer-focus:ring-2 peer-focus:ring-primary-100">
              <Calendar size={17} className="shrink-0 text-gray-500" />
              <span className="font-bold tabular-nums text-gray-950">{formatDatePickerValue(date)}</span>
              <span className="hidden h-5 w-px bg-gray-200 sm:block" />
              <span className="hidden min-w-0 flex-1 truncate font-semibold text-gray-700 sm:block">
                {formatDateOnly(date)}
              </span>
              <ChevronDown size={16} className="ml-auto shrink-0 text-gray-400" />
            </span>
          </label>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading || isReadOnly}
            className="btn-secondary flex min-h-11 items-center justify-center gap-2 border border-gray-200 bg-white"
          >
            <Save size={16} />
            {t('saveDraft')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading || isReadOnly}
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
            <p className="font-semibold text-gray-900">
              {isReadOnly ? t('readOnlyTitle') : isHistoricalDate ? t('ownerHistoricalEditTitle') : t('infoTitle')}
            </p>
            <p className="mt-1 text-sm text-gray-600">
              {isReadOnly ? t('readOnlyBody') : isHistoricalDate ? t('ownerHistoricalEditBody') : t('infoBody')}
            </p>
          </div>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
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
              <h2 className="text-lg font-bold text-gray-900">{t('products')}</h2>
              <div className="relative w-full md:w-72">
                <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  className="input-field h-10 pl-9"
                  placeholder={t('searchPlaceholder')}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            </div>
            <button className="btn-secondary flex min-h-10 items-center justify-center gap-2 border border-gray-200 bg-white">
              <Upload size={16} />
              {t('importFromExcel')}
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
                    <th className="px-4 py-4 text-right">{t('costBasis')}<br /><span className="font-normal normal-case">({tc('currency')})</span></th>
                    <th className="px-4 py-4 text-center">{t('previousStock')}<br /><span className="font-normal normal-case">({t('pcs')})</span></th>
                    <th className="px-4 py-4 text-center">{t('addedToday')}<br /><span className="font-normal normal-case">({t('pcs')})</span></th>
                    <th className="px-4 py-4 text-center">
                      {t('closingStock')}
                      <br />
                      <span className="rounded-full bg-primary-100 px-2 py-0.5 text-primary-700 normal-case">
                        {isReadOnly ? t('snapshot') : t('youEnter')}
                      </span>
                    </th>
                    <th className="px-4 py-4 text-center">{t('soldQty')}<br /><span className="font-normal normal-case">({t('pcs')})</span></th>
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
                              <p className="mt-1 text-xs text-gray-500">{t('saleLabel')} {formatCurrency(row.product.sale_price)} {tc('currency')}</p>
                              <p className="text-xs text-gray-500">{t('costLabel')} {formatCurrency(row.product.cost_price)} {tc('currency')}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <p className="font-semibold text-gray-900">{formatCurrency(row.product.cost_price)}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            {t('valueLabel')} {formatCurrency(parseNum(row.closingStock) * row.product.cost_price)}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-center font-medium text-gray-900">{parseNum(row.previousStock)}</td>
                        <td className="px-4 py-4 text-center font-medium text-gray-900">{parseNum(row.addedToday)}</td>
                        <td className="px-4 py-4">
                          {isReadOnly ? (
                            <p className="text-center font-semibold text-gray-900">{parseNum(row.closingStock)}</p>
                          ) : (
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="input-field mx-auto h-10 w-32 text-center font-semibold"
                              value={row.closingStock}
                              onChange={(event) => updateRow(originalIndex, 'closingStock', event.target.value)}
                            />
                          )}
                        </td>
                        <td className="px-4 py-4 text-center font-semibold text-gray-900">{summary.soldQuantity}</td>
                        <td className="px-4 py-4 text-right font-semibold text-success-600">{formatCurrency(summary.barIncome)}</td>
                        <td className="px-5 py-4 text-right font-semibold text-success-600">{formatCurrency(summary.barProfit)}</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-white font-bold text-gray-900">
                    <td className="px-5 py-4" />
                    <td className="px-4 py-4">{t('totalRow', { count: rows.length })}</td>
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
            <h3 className="font-bold text-gray-900">{t('howItWorks')}</h3>
            <div className="mt-4 space-y-5">
              {([
                [t('step1Title'), t('step1Body')],
                [t('step2Title'), t('step2Body')],
                [t('step3Title'), t('step3Body')],
              ] as [string, string][]).map(([title, body], index) => (
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
            <h3 className="font-bold text-gray-900">{t('formulas')}</h3>
            <div className="mt-4 space-y-4 text-sm">
              <div>
                <p className="font-semibold text-gray-900">{t('formulaSoldTitle')}</p>
                <p className="mt-1 text-xs leading-5 text-gray-500">{t('formulaSoldBody')}</p>
              </div>
              <div>
                <p className="font-semibold text-gray-900">{t('formulaIncomeTitle')}</p>
                <p className="mt-1 text-xs leading-5 text-gray-500">{t('formulaIncomeBody')}</p>
              </div>
              <div>
                <p className="font-semibold text-gray-900">{t('formulaProfitTitle')}</p>
                <p className="mt-1 text-xs leading-5 text-gray-500">{t('formulaProfitBody')}</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <HelpCircle size={18} className="text-primary-600" />
              <h3 className="font-bold text-gray-900">{t('needHelp')}</h3>
            </div>
            <p className="mt-3 text-sm leading-6 text-gray-500">{t('needHelpBody')}</p>
            <a href="/products" className="btn-secondary mt-4 inline-flex min-h-10 items-center gap-2 border border-gray-200 bg-white">
              <Package size={16} />
              {t('viewProducts')}
            </a>
          </div>
        </aside>
      </div>
    </div>
  );
}

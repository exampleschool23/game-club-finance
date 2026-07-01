'use client';

import { useState, useEffect, useCallback, useMemo, useRef, type ChangeEvent, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useClub } from '@/components/layout/DashboardShell';
import { useAppLocale } from '@/components/i18n/AppLocaleContext';
import { todayIso } from '@/lib/utils';
import { formatCurrency, formatDatePickerValue } from '@/lib/formatters';
import {
  calculateClosingStockFromSold,
  recalculateFutureStockCounts,
  calculateStockCountSummary,
} from '@/lib/calculations/stock';
import {
  applyClosingStockDraft,
  applyClosingStockImport,
  buildEditableClosingStockRows,
  buildClosingStockUpserts,
  clearClosingStockDraft,
  normalizeStockCount,
  readClosingStockDraft,
  saveClosingStockDraft,
  selectClosingStockImportRows,
  type ClosingStockExistingCount,
  type ClosingStockRowData,
  type StorageLike,
} from '@/lib/closingStock';
import {
  Box,
  Calendar,
  ChevronDown,
  Coins,
  FileBox,
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
  sold_quantity: number;
  sale_price: number;
  cost_price: number;
  products?:
    | Pick<Product, 'id' | 'club_id' | 'name' | 'category' | 'current_stock' | 'low_stock_threshold' | 'sort_order' | 'is_active' | 'is_deleted' | 'created_at' | 'updated_at'>
    | Pick<Product, 'id' | 'club_id' | 'name' | 'category' | 'current_stock' | 'low_stock_threshold' | 'sort_order' | 'is_active' | 'is_deleted' | 'created_at' | 'updated_at'>[]
    | null;
}

type RowData = ClosingStockRowData;

function parseNum(value: string): number {
  return normalizeStockCount(value);
}

function isWholeNumberInput(value: string): boolean {
  return value === '' || /^\d+$/.test(value);
}

function preventNonIntegerNumberInput(event: KeyboardEvent<HTMLInputElement>) {
  if (['.', ',', 'e', 'E', '+', '-'].includes(event.key)) {
    event.preventDefault();
  }
}

function getBrowserStorage(): StorageLike | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

function applyBrowserDraft(date: string, clubId: string, rows: RowData[]): RowData[] {
  const draft = readClosingStockDraft(getBrowserStorage(), date, clubId);
  return applyClosingStockDraft(rows, draft);
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

const stickyHeaderCellClass = 'sticky top-0 z-20 border-b border-gray-100 bg-gray-50 px-4 py-4';
const addedTodayHeaderCellClass = 'sticky top-0 z-20 border-b border-success-500/20 bg-success-50 px-4 py-4 text-success-600';

async function fetchActiveProductsOrdered(supabase: ReturnType<typeof createClient>, clubId: string) {
  const ordered = await supabase
    .from('products')
    .select('*')
    .eq('club_id', clubId)
    .eq('is_active', true)
    .eq('is_deleted', false)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (!ordered.error) return ordered;

  if (isMissingSortOrder(ordered.error)) {
    const named = await supabase
      .from('products')
      .select('*')
      .eq('club_id', clubId)
      .eq('is_active', true)
      .eq('is_deleted', false)
      .order('name', { ascending: true });

    if (!named.error) return named;
  }

  if (!isMissingDeletedColumn(ordered.error)) return ordered;

  return supabase
    .from('products')
    .select('*')
    .eq('club_id', clubId)
    .eq('is_active', true)
    .order('name', { ascending: true });
}

async function fetchPreviousClosings(supabase: ReturnType<typeof createClient>, selectedDate: string, clubId: string) {
  const { data, error } = await supabase
    .from('daily_stock_counts')
    .select('product_id,closing_stock')
    .eq('club_id', clubId)
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
  clubId: string,
) {
  const productIds = Object.keys(savedClosings);
  if (productIds.length === 0) return null;

  const { data, error } = await supabase
    .from('daily_stock_counts')
    .select('id,product_id,date,added_today,closing_stock,sale_price,cost_price')
    .eq('club_id', clubId)
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
        .eq('club_id', clubId)
        .eq('id', row.id),
    ),
  );

  return results.find((result) => result.error)?.error ?? null;
}

export default function ClosingStockPage() {
  const t = useTranslations('closingStock');
  const tc = useTranslations('common');
  const { selectedClubId, role: currentRole } = useClub();
  const { locale } = useAppLocale();
  const today = todayIso();
  const [date, setDate] = useState(todayIso());
  const [rows, setRows] = useState<RowData[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const importInputRef = useRef<HTMLInputElement>(null);
  const isHistoricalDate = date < today;
  const isOwner = currentRole === 'owner';
  const isAdmin = currentRole === 'admin';
  const usesSoldEntry = isAdmin && !isHistoricalDate;
  const usesClosingEntry = isOwner;
  const canSave = usesClosingEntry || usesSoldEntry;
  const isReadOnly = !canSave;
  const isHistoricalReadOnly = isHistoricalDate && !isOwner;

  const buildEditableRows = useCallback(
    (
      products: Product[],
      counts: ClosingStockExistingCount[],
      purchases: PurchaseQuantity[],
      previousClosings: Record<string, number>,
      isCurrentDate: boolean,
    ) => {
      return sortRowsByProductOrder(buildEditableClosingStockRows({
        products,
        counts,
        purchases,
        previousClosings,
        isCurrentDate,
      }));
    },
    [],
  );

  const loadData = useCallback(async (selectedDate: string) => {
    if (!selectedClubId) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    const supabase = createClient();
    const readOnlyDate = selectedDate < todayIso();
    const canUseDraft = currentRole === 'owner' || (currentRole === 'admin' && !readOnlyDate);

    if (readOnlyDate) {
      const countsWithOrder = await supabase
        .from('daily_stock_counts')
        .select('product_id,previous_stock,added_today,closing_stock,sold_quantity,sale_price,cost_price,products(id,club_id,name,category,current_stock,low_stock_threshold,sort_order,is_active,is_deleted,created_at,updated_at)')
        .eq('club_id', selectedClubId)
        .eq('date', selectedDate)
        .order('updated_at', { ascending: false });

      let data: unknown = countsWithOrder.data;
      let countsError = countsWithOrder.error;

      if (isMissingSortOrder(countsWithOrder.error)) {
        const countsWithoutOrder = await supabase
          .from('daily_stock_counts')
          .select('product_id,previous_stock,added_today,closing_stock,sold_quantity,sale_price,cost_price,products(id,club_id,name,category,current_stock,low_stock_threshold,is_active,is_deleted,created_at,updated_at)')
          .eq('club_id', selectedClubId)
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
          fetchActiveProductsOrdered(supabase, selectedClubId),
          supabase
            .from('stock_purchases')
            .select('product_id, quantity')
            .eq('club_id', selectedClubId)
            .eq('date', selectedDate),
          fetchPreviousClosings(supabase, selectedDate, selectedClubId),
        ]);

        if (productsRes.error || purchasesRes.error || previousClosingsRes.error) {
          setError(productsRes.error?.message ?? purchasesRes.error?.message ?? previousClosingsRes.error?.message ?? 'Error');
          setRows([]);
          setLoading(false);
          return;
        }

        const editableRows = buildEditableRows(
            (productsRes.data ?? []) as Product[],
            [],
            ((purchasesRes.data as PurchaseQuantity[]) ?? []),
            previousClosingsRes.data ?? {},
            false,
        );
        setRows(canUseDraft ? applyBrowserDraft(selectedDate, selectedClubId, editableRows) : editableRows);
        setLoading(false);
        return;
      }

      const savedRows = sortRowsByProductOrder(stockCountRows.flatMap((count) => {
          const relation = Array.isArray(count.products) ? count.products[0] : count.products;
          if (relation?.is_deleted) return [];
          const product: Product = {
            id: relation?.id ?? count.product_id,
            club_id: relation?.club_id ?? selectedClubId,
            name: relation?.name ?? 'Unknown product',
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
            soldQuantity: String(count.sold_quantity ?? 0),
          }];
        }));
      setRows(savedRows);
      setLoading(false);
      return;
    }

    const [productsRes, countsRes, purchasesRes, previousClosingsRes] = await Promise.all([
      fetchActiveProductsOrdered(supabase, selectedClubId),
      supabase
        .from('daily_stock_counts')
        .select('*')
        .eq('club_id', selectedClubId)
        .eq('date', selectedDate),
      supabase
        .from('stock_purchases')
        .select('product_id, quantity')
        .eq('club_id', selectedClubId)
        .eq('date', selectedDate),
      fetchPreviousClosings(supabase, selectedDate, selectedClubId),
    ]);

    if (productsRes.error || countsRes.error || purchasesRes.error || previousClosingsRes.error) {
      setError(productsRes.error?.message ?? countsRes.error?.message ?? purchasesRes.error?.message ?? previousClosingsRes.error?.message ?? 'Error');
      setRows([]);
      setLoading(false);
      return;
    }

    const existingCounts = (countsRes.data ?? []) as ClosingStockExistingCount[];
    const editableRows = buildEditableRows(
        (productsRes.data ?? []) as Product[],
        existingCounts,
        ((purchasesRes.data as PurchaseQuantity[]) ?? []),
        previousClosingsRes.data ?? {},
        selectedDate === todayIso(),
    );
    setRows(canUseDraft && existingCounts.length === 0 ? applyBrowserDraft(selectedDate, selectedClubId, editableRows) : editableRows);
    setLoading(false);
  }, [buildEditableRows, currentRole, selectedClubId]);

  useEffect(() => {
    loadData(date).catch((err) => {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    });
  }, [date, loadData]);

  function updateRow(index: number, field: 'previousStock' | 'addedToday' | 'closingStock', value: string) {
    setRows((prev) => {
      if (!isWholeNumberInput(value)) return prev;

      const copy = [...prev];
      const nextRow = { ...copy[index], [field]: value };
      nextRow.soldQuantity = String(calculateStockCountSummary({
        previousStock: parseNum(nextRow.previousStock),
        addedToday: parseNum(nextRow.addedToday),
        closingStock: parseNum(nextRow.closingStock),
        salePrice: nextRow.product.sale_price,
        costPrice: nextRow.product.cost_price,
      }).soldQuantity);
      copy[index] = nextRow;
      return copy;
    });
  }

  function updateSoldQuantity(index: number, value: string) {
    setRows((prev) => {
      if (!isWholeNumberInput(value)) return prev;

      const copy = [...prev];
      const current = copy[index];
      const closingStock = calculateClosingStockFromSold(
        parseNum(current.previousStock),
        parseNum(current.addedToday),
        parseNum(value),
      );
      copy[index] = {
        ...current,
        soldQuantity: value,
        closingStock: String(closingStock),
      };
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

  function handleSaveDraft() {
    if (isReadOnly) {
      setError(t('readOnlyBody'));
      return;
    }

    if (rows.length === 0) {
      setError(tc('noData'));
      return;
    }

    setError('');
    setSuccess('');

    if (!selectedClubId || !saveClosingStockDraft(getBrowserStorage(), date, rows, undefined, selectedClubId)) {
      setError(t('draftSaveFailed'));
      return;
    }

    setSuccess(t('draftSaved'));
  }

  async function handleImportFromExcel(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    if (isReadOnly) {
      setError(t('readOnlyBody'));
      return;
    }

    if (rows.length === 0) {
      setError(tc('noData'));
      return;
    }

    setError('');
    setSuccess('');

    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });

      if (workbook.SheetNames.length === 0) {
        setError(t('importEmpty'));
        return;
      }

      const importSelection = selectClosingStockImportRows(
        workbook.SheetNames.map((sheetName) => ({
          name: sheetName,
          rows: XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
            header: 1,
            defval: '',
            blankrows: false,
            raw: false,
          }),
        })),
        date,
      );

      if (!importSelection) {
        setError(t('importEmpty'));
        return;
      }

      const result = applyClosingStockImport(
        rows,
        importSelection.rows,
        usesSoldEntry ? 'soldQuantity' : 'closingStock',
      );

      if (result.matchedCount === 0) {
        setError(t('importNoMatches'));
        return;
      }

      setRows(result.rows);
      setSuccess(t('importSuccess', { count: result.matchedCount, sheet: importSelection.sheetName }));
    } catch {
      setError(t('importFailed'));
    }
  }

  async function handleSubmitStockCounts() {
    if (isReadOnly) {
      setError(t('readOnlyBody'));
      return;
    }

    if (rows.length === 0) {
      setError(tc('noData'));
      return;
    }

    if (!selectedClubId) {
      setError(tc('error'));
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const { upserts, savedClosings } = buildClosingStockUpserts({
      date,
      rows,
      createdBy: session?.user?.id ?? null,
    });
    const clubUpserts = upserts.map((row) => ({ ...row, club_id: selectedClubId }));

    const { error: err } = await supabase
      .from('daily_stock_counts')
      .upsert(clubUpserts, { onConflict: 'club_id,date,product_id' });

    if (err) {
      setSaving(false);
      setError(err.message);
      return;
    }

    const cascadeError = await recalculateSavedFutureRows(supabase, date, savedClosings, selectedClubId);

    setSaving(false);

    if (cascadeError) {
      setError(cascadeError.message);
      return;
    }

    clearClosingStockDraft(getBrowserStorage(), date, selectedClubId);
    await loadData(date);
    setSuccess(t('success'));
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

        <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap xl:w-auto xl:flex-nowrap">
          <label className="relative block h-11 w-full cursor-pointer sm:w-[260px]">
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
              <span className="font-bold tabular-nums text-gray-950">{formatDatePickerValue(date, locale)}</span>
              <ChevronDown size={16} className="ml-auto shrink-0 text-gray-400" />
            </span>
          </label>
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={saving || loading || isReadOnly}
            className="btn-secondary min-h-11 w-full border border-gray-200 bg-white sm:w-auto"
          >
            <Save size={16} />
            {t('saveDraft')}
          </button>
          <button
            type="button"
            onClick={handleSubmitStockCounts}
            disabled={saving || loading || isReadOnly}
            className="btn-primary min-h-11 w-full px-5 sm:w-auto"
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
              {isHistoricalReadOnly ? t('readOnlyTitle') : isHistoricalDate ? t('ownerHistoricalEditTitle') : t('infoTitle')}
            </p>
            <p className="mt-1 text-sm text-gray-600">
              {isHistoricalReadOnly ? t('readOnlyBody') : isHistoricalDate ? t('ownerHistoricalEditBody') : t('infoBody')}
            </p>
          </div>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {kpis.map(({ label, value, unit, icon: Icon, color, bg }) => (
          <div key={label} className="min-w-0 rounded-lg border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
            <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 sm:gap-4">
              <div className={`flex h-10 w-10 items-center justify-center rounded-full sm:h-12 sm:w-12 ${bg}`}>
                <Icon size={22} className={color} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-600">{label}</p>
                <p className={`mt-1 break-words text-xl font-bold leading-tight tabular-nums sm:text-2xl ${color}`}>{value}</p>
                <p className="mt-1 text-xs font-medium text-gray-500">{unit}</p>
              </div>
            </div>
          </div>
        ))}
      </section>

      {error && <p className="rounded-lg bg-danger-50 px-4 py-3 text-sm font-medium text-danger-600">{error}</p>}
      {success && <p className="rounded-lg bg-success-50 px-4 py-3 text-sm font-medium text-success-600">{success}</p>}

      <div>
        <section className="min-w-0 overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-4 md:flex-row md:items-center md:justify-between sm:px-5">
            <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center">
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
            <input
              ref={importInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleImportFromExcel}
            />
            <button
              type="button"
              disabled={saving || loading || isReadOnly}
              onClick={() => importInputRef.current?.click()}
              className="btn-secondary min-h-10 w-full border border-gray-200 bg-white md:w-auto"
            >
              <Upload size={16} />
              {t('importFromExcel')}
            </button>
          </div>

          {loading ? (
            <div className="p-8 text-gray-500">{tc('loading')}</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-gray-500">{tc('noData')}</div>
          ) : (
            <div className="max-h-[calc(100vh-14rem)] overflow-auto">
              <table className="w-full min-w-[1240px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <th className={`${stickyHeaderCellClass} w-12 px-5 text-left`}>#</th>
                    <th className={`${stickyHeaderCellClass} min-w-[250px] text-left`}>{t('product')}</th>
                    <th className={`${stickyHeaderCellClass} text-right`}>{t('salePrice')}<br /><span className="font-normal normal-case">({tc('currency')})</span></th>
                    <th className={`${stickyHeaderCellClass} text-right`}>{t('costBasis')}<br /><span className="font-normal normal-case">({tc('currency')})</span></th>
                    <th className={`${stickyHeaderCellClass} text-center`}>{t('previousStock')}<br /><span className="font-normal normal-case">({t('pcs')})</span></th>
                    <th className={`${addedTodayHeaderCellClass} text-center`}>{t('addedToday')}<br /><span className="font-normal normal-case">({t('pcs')})</span></th>
                    <th className={`${stickyHeaderCellClass} text-center`}>
                      {t('closingStock')}
                      <br />
                      <span className="rounded-full bg-primary-100 px-2 py-0.5 text-primary-700 normal-case">
                        {isReadOnly ? t('snapshot') : usesSoldEntry ? t('calculated') : t('youEnter')}
                      </span>
                    </th>
                    <th className={`${stickyHeaderCellClass} text-center`}>
                      {t('soldQty')}
                      <br />
                      <span className="font-normal normal-case">({t('pcs')})</span>
                      {usesSoldEntry && (
                        <>
                          <br />
                          <span className="rounded-full bg-primary-100 px-2 py-0.5 text-primary-700 normal-case">
                            {t('youEnter')}
                          </span>
                        </>
                      )}
                    </th>
                    <th className={`${stickyHeaderCellClass} text-right`}>{t('barIncome')}<br /><span className="font-normal normal-case">({tc('currency')})</span></th>
                    <th className={`${stickyHeaderCellClass} px-5 text-right`}>{t('barProfit')}<br /><span className="font-normal normal-case">({tc('currency')})</span></th>
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
                              <p className="mt-1 text-xs text-gray-500">{t('costLabel')} {formatCurrency(row.product.cost_price)} {tc('currency')}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right font-semibold text-gray-900">{formatCurrency(row.product.sale_price)}</td>
                        <td className="px-4 py-4 text-right">
                          <p className="font-semibold text-gray-900">{formatCurrency(row.product.cost_price)}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            {t('valueLabel')} {formatCurrency(parseNum(row.closingStock) * row.product.cost_price)}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-center font-medium text-gray-900">{parseNum(row.previousStock)}</td>
                        <td className="bg-success-50 px-4 py-4 text-center font-semibold text-success-600">{parseNum(row.addedToday)}</td>
                        <td className="px-4 py-4">
                          {isReadOnly || usesSoldEntry ? (
                            <p className="text-center font-semibold text-gray-900">{parseNum(row.closingStock)}</p>
                          ) : (
                            <input
                              type="number"
                              min="0"
                              step="1"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              className="input-field mx-auto h-10 w-32 text-center font-semibold"
                              value={row.closingStock}
                              onKeyDown={preventNonIntegerNumberInput}
                              onChange={(event) => updateRow(originalIndex, 'closingStock', event.target.value)}
                            />
                          )}
                        </td>
                        <td className="px-4 py-4">
                          {usesSoldEntry ? (
                            <input
                              type="number"
                              min="0"
                              step="1"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              className="input-field mx-auto h-10 w-28 text-center font-semibold"
                              value={row.soldQuantity}
                              onKeyDown={preventNonIntegerNumberInput}
                              onChange={(event) => updateSoldQuantity(originalIndex, event.target.value)}
                            />
                          ) : (
                            <p className="text-center font-semibold text-gray-900">{summary.soldQuantity}</p>
                          )}
                        </td>
                        <td className="px-4 py-4 text-right font-semibold text-success-600">{formatCurrency(summary.barIncome)}</td>
                        <td className="px-5 py-4 text-right font-semibold text-success-600">{formatCurrency(summary.barProfit)}</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-white font-bold text-gray-900">
                    <td className="px-5 py-4" />
                    <td className="px-4 py-4">{t('totalRow', { count: rows.length })}</td>
                    <td className="px-4 py-4" />
                    <td className="px-4 py-4 text-right">{formatCurrency(totals.stockValue)}</td>
                    <td className="px-4 py-4 text-center">{totals.previous}</td>
                    <td className="bg-success-50 px-4 py-4 text-center font-semibold text-success-600">{totals.added}</td>
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
      </div>
    </div>
  );
}

'use client';

// Route: /closing-stock

import { useState, useEffect, useCallback, useMemo, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { isMissingDatabaseFunction } from '@/lib/supabase/errors';
import {
  markPerformanceRpcAvailable,
  markPerformanceRpcMissing,
  shouldTryPerformanceRpc,
} from '@/lib/supabase/performanceRpc';
import { useClub } from '@/components/layout/DashboardShell';
import { DatePicker } from '@/components/ui/CalendarPicker';
import { MetricGridSkeleton, TableSkeleton } from '@/components/ui/LoadingSkeleton';
import { calendarTodayIso, todayIso } from '@/lib/utils';
import { formatCurrency, formatUnitCurrency } from '@/lib/formatters';
import {
  calculateClosingStockFromSold,
  calculateDirectSalesSummary,
  calculateStockCountSummary,
} from '@/lib/calculations/stock';
import {
  applyClosingStockDraft,
  buildEditableClosingStockRows,
  buildClosingStockUpserts,
  calculatePurchaseCostsByProduct,
  clearClosingStockDraft,
  normalizeStockCount,
  normalizeStockAdjustment,
  readClosingStockDraft,
  saveClosingStockDraft,
  validateClosingStockRows,
  type ClosingStockExistingCount,
  type ClosingStockRowData,
  type ClosingStockUpsert,
  type StorageLike,
} from '@/lib/closingStock';
import {
  Box,
  Coins,
  FileBox,
  Info,
  Minus,
  Package,
  Plus,
  Save,
  Search,
  TrendingUp,
} from 'lucide-react';
import type { Product } from '@/types';

interface PurchaseQuantity {
  product_id: string;
  quantity: number;
  cost_price: number;
}

interface PreviousClosing {
  product_id: string;
  closing_stock: number;
}

interface StockCountRow {
  product_id: string;
  previous_stock: number;
  added_today: number;
  adjustment_quantity: number;
  adjustment_reason: string | null;
  closing_stock: number;
  sold_quantity: number;
  sale_price: number;
  cost_price: number;
  products?:
    | Pick<Product, 'id' | 'club_id' | 'name' | 'category' | 'current_stock' | 'tracks_inventory' | 'low_stock_threshold' | 'sort_order' | 'is_active' | 'is_deleted' | 'created_at' | 'updated_at'>
    | Pick<Product, 'id' | 'club_id' | 'name' | 'category' | 'current_stock' | 'tracks_inventory' | 'low_stock_threshold' | 'sort_order' | 'is_active' | 'is_deleted' | 'created_at' | 'updated_at'>[]
    | null;
}

type RowData = ClosingStockRowData;

function parseNum(value: string): number {
  return normalizeStockCount(value);
}

function parseAdjustment(value: string | undefined): number {
  return normalizeStockAdjustment(value);
}

function isWholeNumberInput(value: string): boolean {
  return value === '' || /^\d+$/.test(value);
}

function isSignedWholeNumberInput(value: string): boolean {
  return value === '' || value === '-' || /^-?\d+$/.test(value);
}

function preventNonIntegerNumberInput(event: KeyboardEvent<HTMLInputElement>) {
  if (['.', ',', 'e', 'E', '+', '-'].includes(event.key)) {
    event.preventDefault();
  }
}

function preventNonSignedIntegerNumberInput(event: KeyboardEvent<HTMLInputElement>) {
  if (['.', ',', 'e', 'E', '+'].includes(event.key)) {
    event.preventDefault();
  }
}

function getBrowserStorage(): StorageLike | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

function applyBrowserDraft(date: string, clubId: string, rows: RowData[], businessDayStartHour: number): RowData[] {
  const draft = readClosingStockDraft(getBrowserStorage(), date, clubId);
  if (draft?.savedAt) {
    const savedAt = new Date(draft.savedAt);
    const savedCalendarDate = calendarTodayIso(savedAt);
    const savedBusinessDate = todayIso(savedAt, businessDayStartHour);

    if (savedCalendarDate === date && savedBusinessDate !== date) {
      return rows;
    }
  }

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
    const trackingOrderA = a.product.tracks_inventory === false ? 0 : 1;
    const trackingOrderB = b.product.tracks_inventory === false ? 0 : 1;
    if (trackingOrderA !== trackingOrderB) return trackingOrderA - trackingOrderB;

    const orderA = a.product.sort_order ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.product.sort_order ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return a.product.name.localeCompare(b.product.name);
  });
}

function productCategory(value: string | null | undefined): string {
  return String(value ?? '').trim();
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
  if (shouldTryPerformanceRpc()) {
    const latestResult = await supabase.rpc('get_latest_stock_closings', {
      p_club_id: clubId,
      p_before_date: selectedDate,
    });

    if (!latestResult.error) {
      const latestRows = (latestResult.data ?? []) as Array<{ product_id: string; closing_stock: number }>;
      markPerformanceRpcAvailable();
      return {
        data: Object.fromEntries(latestRows.map((row) => [row.product_id, Number(row.closing_stock ?? 0)])),
        error: null,
      };
    }

    if (!isMissingDatabaseFunction(latestResult.error, 'get_latest_stock_closings')) {
      return { data: null, error: latestResult.error };
    }

    markPerformanceRpcMissing();
  }

  // Compatibility fallback while migration 030 is being deployed.
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

export default function ClosingStockPage() {
  const t = useTranslations('closingStock');
  const tc = useTranslations('common');
  const { selectedClubId, selectedClub, role: currentRole, businessDayStartHour } = useClub();
  const today = useMemo(() => todayIso(new Date(), businessDayStartHour), [businessDayStartHour]);
  const [date, setDate] = useState(() => today);
  const [rows, setRows] = useState<RowData[]>([]);
  const [purchaseCostsByProduct, setPurchaseCostsByProduct] = useState<Record<string, number>>({});
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const isHistoricalDate = date < today;
  const isOwner = currentRole === 'owner';
  const isAdmin = currentRole === 'admin';
  const canEditStockCounts = isOwner || (isAdmin && !isHistoricalDate);
  const isPixelGameClub = selectedClub?.name.toLowerCase().includes('pixel') ?? false;
  const usesSoldEntry = canEditStockCounts && isPixelGameClub;
  const usesClosingEntry = canEditStockCounts && !usesSoldEntry;
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
      setPurchaseCostsByProduct({});
      setLoading(false);
      return;
    }

    setLoading(true);
    setPurchaseCostsByProduct({});
    setError('');
    const supabase = createClient();
    const readOnlyDate = selectedDate < today;
    const canUseDraft = currentRole === 'owner' || (currentRole === 'admin' && !readOnlyDate);

    if (readOnlyDate) {
      const countsWithOrder = await supabase
        .from('daily_stock_counts')
        .select('product_id,previous_stock,added_today,adjustment_quantity,adjustment_reason,closing_stock,sold_quantity,sale_price,cost_price,products(id,club_id,name,category,current_stock,tracks_inventory,low_stock_threshold,sort_order,is_active,is_deleted,created_at,updated_at)')
        .eq('club_id', selectedClubId)
        .eq('date', selectedDate)
        .order('updated_at', { ascending: false });

      let data: unknown = countsWithOrder.data;
      let countsError = countsWithOrder.error;

      if (isMissingSortOrder(countsWithOrder.error)) {
        const countsWithoutOrder = await supabase
          .from('daily_stock_counts')
          .select('product_id,previous_stock,added_today,adjustment_quantity,adjustment_reason,closing_stock,sold_quantity,sale_price,cost_price,products(id,club_id,name,category,current_stock,tracks_inventory,low_stock_threshold,is_active,is_deleted,created_at,updated_at)')
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
            .select('product_id, quantity, cost_price')
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

        const purchases = ((purchasesRes.data as PurchaseQuantity[]) ?? []);
        setPurchaseCostsByProduct(calculatePurchaseCostsByProduct(purchases));
        const editableRows = buildEditableRows(
            (productsRes.data ?? []) as Product[],
            [],
            purchases,
            previousClosingsRes.data ?? {},
            false,
        );
        setRows(canUseDraft ? applyBrowserDraft(selectedDate, selectedClubId, editableRows, businessDayStartHour) : editableRows);
        setLoading(false);
        return;
      }

      const purchasesRes = await supabase
        .from('stock_purchases')
        .select('product_id, quantity, cost_price')
        .eq('club_id', selectedClubId)
        .eq('date', selectedDate);

      if (purchasesRes.error) {
        setError(purchasesRes.error.message);
        setRows([]);
        setLoading(false);
        return;
      }

      const purchases = ((purchasesRes.data as PurchaseQuantity[]) ?? []);
      setPurchaseCostsByProduct(calculatePurchaseCostsByProduct(purchases));
      const productsFromCounts = stockCountRows.flatMap((count) => {
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
            tracks_inventory: relation?.tracks_inventory ?? true,
            low_stock_threshold: relation?.low_stock_threshold ?? null,
            sort_order: relation?.sort_order ?? null,
            is_active: relation?.is_active ?? false,
            is_deleted: relation?.is_deleted ?? false,
            created_at: relation?.created_at ?? '',
            updated_at: relation?.updated_at ?? '',
          };

          return [product];
        });
      const savedRows = buildEditableRows(
        productsFromCounts,
        stockCountRows,
        purchases,
        {},
        false,
      );
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
        .select('product_id, quantity, cost_price')
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

    const purchases = ((purchasesRes.data as PurchaseQuantity[]) ?? []);
    setPurchaseCostsByProduct(calculatePurchaseCostsByProduct(purchases));
    const existingCounts = (countsRes.data ?? []) as ClosingStockExistingCount[];
    const editableRows = buildEditableRows(
        (productsRes.data ?? []) as Product[],
        existingCounts,
        purchases,
        previousClosingsRes.data ?? {},
        selectedDate === today,
    );
    setRows(canUseDraft && existingCounts.length === 0 ? applyBrowserDraft(selectedDate, selectedClubId, editableRows, businessDayStartHour) : editableRows);
    setLoading(false);
  }, [buildEditableRows, businessDayStartHour, currentRole, selectedClubId, today]);

  useEffect(() => {
    setDate(today);
  }, [selectedClubId, today]);

  useEffect(() => {
    loadData(date).catch((err) => {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    });
  }, [date, loadData]);

  useEffect(() => {
    if (!selectedCategory) return;
    const categoryExists = rows.some((row) => productCategory(row.product.category) === selectedCategory);
    if (!categoryExists) setSelectedCategory('');
  }, [rows, selectedCategory]);

  function updateRow(index: number, field: 'previousStock' | 'addedToday' | 'closingStock', value: string) {
    setRows((prev) => {
      if (!isWholeNumberInput(value)) return prev;

      const copy = [...prev];
      const nextRow = { ...copy[index], [field]: value };
      nextRow.soldQuantity = String(calculateStockCountSummary({
        previousStock: parseNum(nextRow.previousStock),
        addedToday: parseNum(nextRow.addedToday),
        adjustmentQuantity: parseAdjustment(nextRow.adjustmentQuantity),
        closingStock: parseNum(nextRow.closingStock),
        salePrice: nextRow.product.sale_price,
        costPrice: nextRow.product.cost_price,
      }).soldQuantity);
      copy[index] = nextRow;
      return copy;
    });
  }

  function updateAdjustment(index: number, value: string) {
    setRows((prev) => {
      if (!isSignedWholeNumberInput(value)) return prev;

      const copy = [...prev];
      const current = copy[index];
      const nextRow = { ...current, adjustmentQuantity: value };
      nextRow.soldQuantity = String(calculateStockCountSummary({
        previousStock: parseNum(nextRow.previousStock),
        addedToday: parseNum(nextRow.addedToday),
        adjustmentQuantity: parseAdjustment(value),
        closingStock: parseNum(nextRow.closingStock),
        salePrice: nextRow.product.sale_price,
        costPrice: nextRow.product.cost_price,
      }).soldQuantity);
      copy[index] = nextRow;
      return copy;
    });
  }

  function updateAdjustmentReason(index: number, value: string) {
    setRows((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], adjustmentReason: value };
      return copy;
    });
  }

  function adjustClosingStock(index: number, amount: number) {
    const currentValue = parseNum(rows[index]?.closingStock ?? '0');
    updateRow(index, 'closingStock', String(Math.max(0, currentValue + amount)));
  }

  function updateSoldQuantity(index: number, value: string) {
    setRows((prev) => {
      if (!isWholeNumberInput(value)) return prev;

      const copy = [...prev];
      const current = copy[index];
      if (current.product.tracks_inventory === false) {
        copy[index] = {
          ...current,
          soldQuantity: value,
          previousStock: '0',
          addedToday: '0',
          closingStock: '0',
        };
        return copy;
      }
      const closingStock = calculateClosingStockFromSold(
        parseNum(current.previousStock),
        parseNum(current.addedToday),
        parseNum(value),
        parseAdjustment(current.adjustmentQuantity),
      );
      copy[index] = {
        ...current,
        soldQuantity: value,
        closingStock: String(closingStock),
      };
      return copy;
    });
  }

  function adjustSoldQuantity(index: number, amount: number) {
    const currentValue = parseNum(rows[index]?.soldQuantity ?? '0');
    updateSoldQuantity(index, String(Math.max(0, currentValue + amount)));
  }

  function rowSummary(row: RowData) {
    if (row.product.tracks_inventory === false) {
      return calculateDirectSalesSummary(
        parseNum(row.soldQuantity),
        row.product.sale_price,
        row.product.cost_price,
      );
    }

    return calculateStockCountSummary({
      previousStock: parseNum(row.previousStock),
      addedToday: parseNum(row.addedToday),
      adjustmentQuantity: parseAdjustment(row.adjustmentQuantity),
      closingStock: parseNum(row.closingStock),
      salePrice: row.product.sale_price,
      costPrice: row.product.cost_price,
    });
  }

  const categoryOptions = useMemo(() => {
    return Array.from(new Set(rows.map((row) => productCategory(row.product.category)).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesCategory = !selectedCategory || productCategory(row.product.category) === selectedCategory;
      const matchesQuery = !needle || row.product.name.toLowerCase().includes(needle);
      return matchesCategory && matchesQuery;
    });
  }, [query, rows, selectedCategory]);

  const totals = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        const summary = rowSummary(row);
        acc.sold += summary.soldQuantity;
        acc.income += summary.barIncome;
        acc.profit += summary.barProfit;
        if (row.product.tracks_inventory !== false) {
          acc.stockValue += parseNum(row.closingStock) * row.product.cost_price;
          acc.previous += parseNum(row.previousStock);
          acc.added += parseNum(row.addedToday);
          acc.purchaseCost += purchaseCostsByProduct[row.product.id] ?? 0;
        }
        return acc;
      },
      { sold: 0, income: 0, profit: 0, stockValue: 0, previous: 0, added: 0, purchaseCost: 0 },
    );
  }, [filteredRows, purchaseCostsByProduct]);

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

    const validationError = validateClosingStockRows(rows);
    if (validationError) {
      const validationMessages = {
        adjustment_reason_required: t('adjustmentReasonRequired', { product: validationError.productName }),
        closing_exceeds_available: t('closingExceedsAvailable', {
          product: validationError.productName,
          available: validationError.availableStock,
        }),
        negative_available_stock: t('negativeAvailableStock', { product: validationError.productName }),
        sold_quantity_mismatch: t('soldQuantityMismatch', { product: validationError.productName }),
      };
      setError(validationMessages[validationError.code]);
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    let upserts: ClosingStockUpsert[];
    try {
      ({ upserts } = buildClosingStockUpserts({
        date,
        rows,
        createdBy: session?.user?.id ?? null,
      }));
    } catch (buildError) {
      setSaving(false);
      setError(buildError instanceof Error ? buildError.message : tc('error'));
      return;
    }

    const { error: err } = await supabase.rpc('save_closing_stock_counts', {
      p_club_id: selectedClubId,
      p_date: date,
      p_counts: upserts,
    });

    if (err) {
      setSaving(false);
      setError(err.message);
      return;
    }

    setSaving(false);

    clearClosingStockDraft(getBrowserStorage(), date, selectedClubId);
    await loadData(date);
    setSuccess(t('success'));
  }

  const kpis = [
    { label: t('totalProducts'), value: filteredRows.length, unit: t('items'), detail: '', icon: Box, color: 'text-primary-600', bg: 'bg-primary-50' },
    { label: t('stockPurchased'), value: totals.added, unit: t('pcs'), detail: `${formatCurrency(totals.purchaseCost)} ${tc('currency')}`, icon: Package, color: 'text-orange-600', bg: 'bg-orange-50' },
    { label: t('totalSold'), value: totals.sold, unit: t('pcs'), detail: '', icon: FileBox, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: t('barIncomeEst'), value: formatCurrency(totals.income), unit: tc('currency'), detail: '', icon: Coins, color: 'text-success-600', bg: 'bg-success-50' },
    { label: t('barProfitEst'), value: formatCurrency(totals.profit), unit: tc('currency'), detail: '', icon: TrendingUp, color: 'text-success-600', bg: 'bg-success-50' },
    { label: t('stockValue'), value: formatCurrency(totals.stockValue), unit: tc('currency'), detail: '', icon: Coins, color: 'text-gray-900', bg: 'bg-gray-100' },
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
          <DatePicker
            value={date}
            max={today}
            className="w-full sm:w-[260px]"
            onChange={(value) => {
              setDate(value);
              setSuccess('');
              setError('');
            }}
          />
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

      {loading ? (
        <MetricGridSkeleton count={6} className="lg:grid-cols-3 2xl:grid-cols-6" />
      ) : (
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {kpis.map(({ label, value, unit, detail, icon: Icon, color, bg }) => (
          <div key={label} className="min-w-0 rounded-lg border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
            <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 sm:gap-4">
              <div className={`flex h-10 w-10 items-center justify-center rounded-full sm:h-12 sm:w-12 ${bg}`}>
                <Icon size={22} className={color} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-600">{label}</p>
                <p className={`mt-1 break-words text-xl font-bold leading-tight tabular-nums sm:text-2xl ${color}`}>{value}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs font-medium text-gray-500">
                  <span>{unit}</span>
                  {detail && <span className={`font-bold ${color}`}>· {detail}</span>}
                </p>
              </div>
            </div>
          </div>
        ))}
      </section>
      )}

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
          </div>

          {categoryOptions.length > 0 && (
            <div className="border-b border-gray-100 px-4 py-3 sm:px-5">
              <div className="flex gap-2 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setSelectedCategory('')}
                  className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                    selectedCategory === ''
                      ? 'border-primary-600 bg-primary-600 text-white'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {tc('all')}
                </button>
                {categoryOptions.map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setSelectedCategory(category)}
                    className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                      selectedCategory === category
                        ? 'border-primary-600 bg-primary-600 text-white'
                        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>
          )}

          {loading ? (
            <TableSkeleton rows={8} columns={9} className="rounded-none border-0 shadow-none" />
          ) : rows.length === 0 ? (
            <div className="p-8 text-gray-500">{tc('noData')}</div>
          ) : filteredRows.length === 0 ? (
            <div className="p-8 text-gray-500">{tc('noData')}</div>
          ) : (
            <div className="max-h-[calc(100vh-14rem)] overflow-auto">
              <table className="w-full min-w-[1460px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <th className={`${stickyHeaderCellClass} w-12 px-5 text-left`}>#</th>
                    <th className={`${stickyHeaderCellClass} min-w-[250px] text-left`}>{t('product')}</th>
                    <th className={`${stickyHeaderCellClass} text-right`}>{t('salePrice')}<br /><span className="font-normal normal-case">({tc('currency')})</span></th>
                    <th className={`${stickyHeaderCellClass} text-right`}>{t('costBasis')}<br /><span className="font-normal normal-case">({tc('currency')})</span></th>
                    <th className={`${stickyHeaderCellClass} text-center`}>{t('previousStock')}<br /><span className="font-normal normal-case">({t('pcs')})</span></th>
                    <th className={`${addedTodayHeaderCellClass} text-center`}>{t('addedToday')}<br /><span className="font-normal normal-case">({t('pcs')})</span></th>
                    <th className={`${stickyHeaderCellClass} min-w-[190px] text-center`}>
                      {t('adjustment')}
                      <br />
                      <span className="font-normal normal-case">({t('pcs')})</span>
                    </th>
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
                      {canSave && (usesSoldEntry || filteredRows.some((row) => row.product.tracks_inventory === false)) && (
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
                              {row.product.tracks_inventory === false && (
                                <span className="mt-1 inline-flex rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-bold text-purple-700">
                                  {t('madeToOrder')}
                                </span>
                              )}
                              <p className="mt-1 text-xs text-gray-500">{t('costLabel')} {formatUnitCurrency(row.product.cost_price)} {tc('currency')}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right font-semibold text-gray-900">{formatCurrency(row.product.sale_price)}</td>
                        <td className="px-4 py-4 text-right">
                          <p className="font-semibold text-gray-900">{formatUnitCurrency(row.product.cost_price)}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            {row.product.tracks_inventory === false
                              ? t('notIncludedInStockValue')
                              : `${t('valueLabel')} ${formatCurrency(parseNum(row.closingStock) * row.product.cost_price)}`}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-center font-medium text-gray-900">
                          {row.product.tracks_inventory === false ? '—' : parseNum(row.previousStock)}
                        </td>
                        <td className="bg-success-50 px-4 py-4 text-center font-semibold text-success-600">
                          {row.product.tracks_inventory === false ? '—' : (
                            <div className="flex flex-col items-center gap-1">
                              <span>{parseNum(row.addedToday)}</span>
                              {row.hasPurchaseMismatch && (
                                <span
                                  className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800"
                                  title={t('purchaseMismatch', {
                                    purchased: row.purchaseQuantity ?? 0,
                                    saved: parseNum(row.addedToday),
                                  })}
                                >
                                  <Info size={12} />
                                  {t('purchasesBadge', { purchased: row.purchaseQuantity ?? 0 })}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          {row.product.tracks_inventory === false ? (
                            <p className="text-center font-semibold text-gray-400">—</p>
                          ) : isOwner && canSave ? (
                            <div className="mx-auto w-44 space-y-2">
                              <input
                                type="text"
                                inputMode="numeric"
                                className="input-field h-10 w-full text-center font-semibold"
                                value={row.adjustmentQuantity ?? '0'}
                                aria-label={t('adjustment')}
                                onKeyDown={preventNonSignedIntegerNumberInput}
                                onWheel={(event) => event.currentTarget.blur()}
                                onChange={(event) => updateAdjustment(originalIndex, event.target.value)}
                              />
                              {parseAdjustment(row.adjustmentQuantity) !== 0 && (
                                <input
                                  type="text"
                                  className="input-field h-9 w-full text-xs"
                                  value={row.adjustmentReason ?? ''}
                                  placeholder={t('adjustmentReason')}
                                  aria-label={t('adjustmentReason')}
                                  onChange={(event) => updateAdjustmentReason(originalIndex, event.target.value)}
                                />
                              )}
                            </div>
                          ) : (
                            <div className="text-center">
                              <p className="font-semibold text-gray-900">{parseAdjustment(row.adjustmentQuantity)}</p>
                              {row.adjustmentReason && (
                                <p className="mt-1 text-xs text-gray-500">{row.adjustmentReason}</p>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          {row.product.tracks_inventory === false ? (
                            <p className="text-center font-semibold text-gray-400">—</p>
                          ) : isReadOnly || usesSoldEntry ? (
                            <p className="text-center font-semibold text-gray-900">{parseNum(row.closingStock)}</p>
                          ) : (
                            <div className="mx-auto flex w-fit items-center gap-2">
                              <button
                                type="button"
                                className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40"
                                aria-label={t('decreaseClosingStock')}
                                disabled={parseNum(row.closingStock) === 0}
                                onClick={() => adjustClosingStock(originalIndex, -1)}
                              >
                                <Minus size={18} strokeWidth={2.5} />
                              </button>
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                className="input-field h-10 w-20 text-center font-semibold"
                                value={row.closingStock}
                                onKeyDown={preventNonIntegerNumberInput}
                                onWheel={(event) => event.currentTarget.blur()}
                                onChange={(event) => updateRow(originalIndex, 'closingStock', event.target.value)}
                              />
                              <button
                                type="button"
                                className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700"
                                aria-label={t('increaseClosingStock')}
                                onClick={() => adjustClosingStock(originalIndex, 1)}
                              >
                                <Plus size={18} strokeWidth={2.5} />
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          {!isReadOnly && (usesSoldEntry || row.product.tracks_inventory === false) ? (
                            <div className="mx-auto flex w-fit items-center gap-2">
                              <button
                                type="button"
                                className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40"
                                aria-label={t('decreaseSoldQty')}
                                disabled={parseNum(row.soldQuantity) === 0}
                                onClick={() => adjustSoldQuantity(originalIndex, -1)}
                              >
                                <Minus size={18} strokeWidth={2.5} />
                              </button>
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                className="input-field h-10 w-20 text-center font-semibold"
                                value={row.soldQuantity}
                                onKeyDown={preventNonIntegerNumberInput}
                                onWheel={(event) => event.currentTarget.blur()}
                                onChange={(event) => updateSoldQuantity(originalIndex, event.target.value)}
                              />
                              <button
                                type="button"
                                className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700"
                                aria-label={t('increaseSoldQty')}
                                onClick={() => adjustSoldQuantity(originalIndex, 1)}
                              >
                                <Plus size={18} strokeWidth={2.5} />
                              </button>
                            </div>
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
                    <td className="px-4 py-4">{t('totalRow', { count: filteredRows.length })}</td>
                    <td className="px-4 py-4" />
                    <td className="px-4 py-4 text-right">{formatCurrency(totals.stockValue)}</td>
                    <td className="px-4 py-4 text-center">{totals.previous}</td>
                    <td className="bg-success-50 px-4 py-4 text-center font-semibold text-success-600">{totals.added}</td>
                    <td className="px-4 py-4 text-center">—</td>
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

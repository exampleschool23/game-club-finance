'use client';

// Route: /closing-stock

import { useState, useEffect, useCallback, useMemo, useRef, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { fetchStockOpeningBalances, fetchStockPurchasesForDate } from '@/lib/supabase/stockOpeningBalances';
import { useClub } from '@/components/layout/DashboardShell';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DatePicker,
  EmptyState,
  InlineAlert,
  Input,
  MetricCard,
  MetricGridSkeleton,
  PageHeader,
  SearchInput,
  SectionHeading,
  SegmentedControl,
  Stepper,
  TableSkeleton,
  useToast,
} from '@/components/PresentationFoundation';
import { BulkStockUpdateModal } from './BulkStockUpdateModal';
import { calendarTodayIso, todayIso } from '@/lib/utils';
import { formatCurrency, formatUnitCurrency } from '@/lib/formatters';
import {
  calculateClosingStockFromSold,
  calculateDirectSalesSummary,
  calculateStockCountSummary,
} from '@/lib/calculations/stock';
import {
  applyBulkStockOrder,
  applyClosingStockDraft,
  BulkStockAvailabilityError,
  buildEditableClosingStockRows,
  buildClosingStockUpserts,
  calculatePurchaseCostsByProduct,
  clearClosingStockDraft,
  isSignedWholeNumberInput,
  isWholeNumberInput,
  normalizeStockCount,
  normalizeStockAdjustment,
  readClosingStockDraft,
  saveClosingStockDraft,
  validateClosingStockRows,
  type ClosingStockExistingCount,
  type ClosingStockRowData,
  type BulkStockOrderItem,
  type BulkStockOrderSummary,
  type StorageLike,
} from '@/lib/closingStock';
import {
  Box,
  Coins,
  FileBox,
  Info,
  Package,
  Save,
  ShoppingCart,
  TrendingUp,
  Warehouse,
} from 'lucide-react';
import type { Product } from '@/types';

interface PurchaseQuantity {
  product_id: string;
  quantity: number;
  cost_price: number;
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

function preventNonSignedIntegerNumberInput(event: KeyboardEvent<HTMLInputElement>) {
  if (['.', ',', 'e', 'E', '+'].includes(event.key)) {
    event.preventDefault();
  }
}

function getBrowserStorage(): StorageLike | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

function applyBrowserDraft(
  date: string,
  clubId: string,
  rows: RowData[],
  businessDayStartHour: number,
  entryMode: 'closingStock' | 'soldQuantity',
): RowData[] {
  const draft = readClosingStockDraft(getBrowserStorage(), date, clubId);
  if (draft?.savedAt) {
    const savedAt = new Date(draft.savedAt);
    const savedCalendarDate = calendarTodayIso(savedAt);
    const savedBusinessDate = todayIso(savedAt, businessDayStartHour);

    if (savedCalendarDate === date && savedBusinessDate !== date) {
      return rows;
    }
  }

  return applyClosingStockDraft(rows, draft, entryMode);
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
const stepperLabels = { decrease: 'decreaseClosingStock', increase: 'increaseClosingStock' } as const;

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
  const [bulkUpdateOpen, setBulkUpdateOpen] = useState(false);
  const [error, setError] = useState('');
  const { showToast, toastElement } = useToast();
  const requestSequence = useRef(0);
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
    const requestId = ++requestSequence.current;
    const isCurrent = () => requestId === requestSequence.current;
    if (!selectedClubId) {
      setRows([]);
      setPurchaseCostsByProduct({});
      setLoading(false);
      return;
    }

    setLoading(true);
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
      if (!isCurrent()) return;

      let data: unknown = countsWithOrder.data;
      let countsError = countsWithOrder.error;

      if (isMissingSortOrder(countsWithOrder.error)) {
        const countsWithoutOrder = await supabase
          .from('daily_stock_counts')
          .select('product_id,previous_stock,added_today,adjustment_quantity,adjustment_reason,closing_stock,sold_quantity,sale_price,cost_price,products(id,club_id,name,category,current_stock,tracks_inventory,low_stock_threshold,is_active,is_deleted,created_at,updated_at)')
          .eq('club_id', selectedClubId)
          .eq('date', selectedDate)
          .order('updated_at', { ascending: false });

        if (!isCurrent()) return;
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
          fetchStockPurchasesForDate(supabase, selectedDate, selectedClubId),
          fetchStockOpeningBalances(supabase, selectedDate, selectedClubId, selectedDate === today),
        ]);
        if (!isCurrent()) return;

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
        setRows(canUseDraft ? applyBrowserDraft(
          selectedDate,
          selectedClubId,
          editableRows,
          businessDayStartHour,
          usesSoldEntry ? 'soldQuantity' : 'closingStock',
        ) : editableRows);
        setLoading(false);
        return;
      }

      const purchasesRes = await fetchStockPurchasesForDate(supabase, selectedDate, selectedClubId);
      if (!isCurrent()) return;

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
      fetchStockPurchasesForDate(supabase, selectedDate, selectedClubId),
      fetchStockOpeningBalances(supabase, selectedDate, selectedClubId, selectedDate === today),
    ]);
    if (!isCurrent()) return;

    if (productsRes.error || countsRes.error || purchasesRes.error || previousClosingsRes.error) {
      setError(productsRes.error?.message ?? countsRes.error?.message ?? purchasesRes.error?.message ?? previousClosingsRes.error?.message ?? 'Error');
      setRows([]);
      setLoading(false);
      return;
    }

    const purchases = ((purchasesRes.data as PurchaseQuantity[]) ?? []);
    setPurchaseCostsByProduct(calculatePurchaseCostsByProduct(purchases));
    const existingCounts = (countsRes.data ?? []) as ClosingStockExistingCount[];
    // Retain already-saved archived rows even on the current business day.
    const activeProducts = (productsRes.data ?? []) as Product[];
    const missingIds = existingCounts.map((count) => count.product_id)
      .filter((id) => !activeProducts.some((product) => product.id === id));
    let savedProducts: Product[] = [];
    if (missingIds.length > 0) {
      const result = await supabase.from('products').select('*')
        .eq('club_id', selectedClubId).eq('is_deleted', true).in('id', missingIds);
      if (!isCurrent()) return;
      if (result.error) {
        setError(result.error.message);
        setRows([]);
        setLoading(false);
        return;
      }
      savedProducts = (result.data ?? []) as Product[];
    }
    const editableRows = buildEditableRows(
        [...activeProducts, ...savedProducts],
        existingCounts,
        purchases,
        previousClosingsRes.data ?? {},
        selectedDate === today,
    );
    setRows(canUseDraft && existingCounts.length === 0 ? applyBrowserDraft(
      selectedDate,
      selectedClubId,
      editableRows,
      businessDayStartHour,
      usesSoldEntry ? 'soldQuantity' : 'closingStock',
    ) : editableRows);
    setLoading(false);
  }, [buildEditableRows, businessDayStartHour, currentRole, selectedClubId, today, usesSoldEntry]);

  useEffect(() => {
    setDate(today);
  }, [selectedClubId, today]);

  useEffect(() => {
    setBulkUpdateOpen(false);
  }, [date, selectedClubId]);

  useEffect(() => {
    loadData(date).catch((err) => {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    });
    return () => { requestSequence.current += 1; };
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

    if (!selectedClubId || !saveClosingStockDraft(getBrowserStorage(), date, rows, undefined, selectedClubId)) {
      setError(t('draftSaveFailed'));
      return;
    }

    showToast(t('draftSaved'));
  }

  function validationMessage(validationError: NonNullable<ReturnType<typeof validateClosingStockRows>>) {
    const validationMessages = {
      adjustment_reason_required: t('adjustmentReasonRequired', { product: validationError.productName }),
      closing_exceeds_available: t('closingExceedsAvailable', {
        product: validationError.productName,
        available: validationError.availableStock,
      }),
      negative_available_stock: t('negativeAvailableStock', { product: validationError.productName }),
      sold_quantity_mismatch: t('soldQuantityMismatch', { product: validationError.productName }),
    };
    return validationMessages[validationError.code];
  }

  async function persistStockCounts(nextRows: RowData[], successMessage: string): Promise<boolean> {
    if (isReadOnly) {
      setError(t('readOnlyBody'));
      return false;
    }

    nextRows = nextRows.filter((row) => !row.product.is_deleted);
    if (nextRows.length === 0) {
      setError(tc('noData'));
      return false;
    }

    if (!selectedClubId) {
      setError(tc('error'));
      return false;
    }

    const validationError = validateClosingStockRows(nextRows);
    if (validationError) {
      setError(validationMessage(validationError));
      return false;
    }

    setSaving(true);
    setError('');
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const { upserts } = buildClosingStockUpserts({
        date,
        rows: nextRows,
        createdBy: session?.user?.id ?? null,
      });

      const { error: err } = await supabase.rpc('save_closing_stock_counts', {
        p_club_id: selectedClubId,
        p_date: date,
        p_counts: upserts,
      });

      if (err) {
        setError(err.message);
        return false;
      }

      clearClosingStockDraft(getBrowserStorage(), date, selectedClubId);
      await loadData(date);
      showToast(successMessage);
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : tc('error'));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitStockCounts() {
    await persistStockCounts(rows, t('success'));
  }

  async function handleBulkStockSave(
    items: BulkStockOrderItem[],
    summary: BulkStockOrderSummary,
  ): Promise<boolean> {
    let nextRows: RowData[];
    try {
      nextRows = applyBulkStockOrder(rows, items);
    } catch (bulkError) {
      if (bulkError instanceof BulkStockAvailabilityError) {
        setError(t('bulkInsufficientStock', {
          product: bulkError.productName,
          available: bulkError.availableQuantity,
        }));
      } else {
        setError(bulkError instanceof Error ? bulkError.message : tc('error'));
      }
      return false;
    }

    return persistStockCounts(nextRows, t('bulkSuccess', {
      items: summary.totalQuantity,
      total: formatCurrency(summary.totalPrice),
      currency: tc('currency'),
    }));
  }

  const kpis = [
    { label: t('totalProducts'), value: `${rows.length} ${t('items')}`, icon: Box, iconClassName: 'bg-primary-50 text-primary-600', tone: 'primary' as const, helper: filteredRows.length !== rows.length ? `${filteredRows.length} / ${rows.length}` : undefined },
    { label: t('stockPurchased'), value: `${totals.added} ${t('pcs')}`, icon: Package, iconClassName: 'bg-orange-50 text-orange-600', tone: 'default' as const, helper: `${formatCurrency(totals.purchaseCost)} ${tc('currency')}` },
    { label: t('totalSold'), value: `${totals.sold} ${t('pcs')}`, icon: FileBox, iconClassName: 'bg-indigo-50 text-indigo-600', tone: 'default' as const },
    { label: t('barIncomeEst'), value: `${formatCurrency(totals.income)} ${tc('currency')}`, icon: Coins, iconClassName: 'bg-success-50 text-success-600', tone: 'success' as const },
    { label: t('barProfitEst'), value: `${formatCurrency(totals.profit)} ${tc('currency')}`, icon: TrendingUp, iconClassName: 'bg-success-50 text-success-600', tone: 'success' as const },
    { label: t('stockValue'), value: `${formatCurrency(totals.stockValue)} ${tc('currency')}`, icon: Warehouse, iconClassName: 'bg-gray-100 text-gray-700', tone: 'default' as const },
  ];
  const categoryChipOptions = [{ value: '', label: tc('all') }, ...categoryOptions.map((category) => ({ value: category, label: category }))];
  const stepper = (
    index: number,
    value: string,
    onChange: (value: string) => void,
    onStep: (delta: 1 | -1) => void,
    labels: { decrease: string; increase: string; label: string },
  ) => (
    <Stepper
      className="mx-auto flex w-fit"
      label={labels.label}
      decreaseLabel={labels.decrease}
      increaseLabel={labels.increase}
      value={value}
      onChange={onChange}
      onStep={onStep}
    />
  );

  return (
    <div className="space-y-5">
      <BulkStockUpdateModal
        open={bulkUpdateOpen}
        rows={rows.filter((row) => !row.product.is_deleted)}
        saving={saving}
        onClose={() => setBulkUpdateOpen(false)}
        onSave={handleBulkStockSave}
      />

      <PageHeader
        title={t('title')}
        description={isHistoricalReadOnly ? t('readOnlyBody') : isHistoricalDate ? t('ownerHistoricalEditBody') : t('infoBody')}
        action={(
          <>
            <DatePicker
              ariaLabel={t('title')}
              value={date}
              max={today}
              className="w-full sm:w-[240px]"
              onChange={(value) => {
                setDate(value);
                setError('');
              }}
            />
            <Button
              variant="outline"
              className="border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100"
              onClick={() => {
                setError('');
                setBulkUpdateOpen(true);
              }}
              disabled={saving || loading || isReadOnly || rows.length === 0}
              icon={<ShoppingCart size={17} aria-hidden="true" />}
            >
              {t('bulkUpdate')}
            </Button>
            <Button variant="outline" onClick={handleSaveDraft} disabled={saving || loading || isReadOnly} icon={<Save size={16} aria-hidden="true" />}>
              {t('saveDraft')}
            </Button>
            <Button onClick={handleSubmitStockCounts} disabled={loading || isReadOnly} loading={saving} loadingLabel={tc('saving')} icon={<Package size={16} aria-hidden="true" />}>
              {t('submit')}
            </Button>
          </>
        )}
      />

      {(isHistoricalDate || isReadOnly) && (
        <InlineAlert variant={isHistoricalReadOnly ? 'warning' : 'info'} title={isHistoricalReadOnly ? t('readOnlyTitle') : t('ownerHistoricalEditTitle')}>
          {isHistoricalReadOnly ? t('readOnlyBody') : t('ownerHistoricalEditBody')}
        </InlineAlert>
      )}

      {loading ? (
        <MetricGridSkeleton count={6} className="lg:grid-cols-3 2xl:grid-cols-6" />
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {kpis.map((kpi) => (
            <MetricCard key={kpi.label} label={kpi.label} value={kpi.value} icon={kpi.icon} iconClassName={kpi.iconClassName} tone={kpi.tone} helper={kpi.helper} />
          ))}
        </section>
      )}

      {error && <InlineAlert variant="danger">{error}</InlineAlert>}

      <div>
        <Card as="section" padding="none" className="overflow-hidden">
          <CardHeader>
            <SectionHeading
              size="lg"
              title={t('products')}
              action={(
                <SearchInput
                  className="w-full md:w-72"
                  controlSize="sm"
                  value={query}
                  onChange={setQuery}
                  placeholder={t('searchPlaceholder')}
                  clearLabel={tc('cancel')}
                />
              )}
            />
          </CardHeader>

          {categoryOptions.length > 0 && (
            <div className="border-b border-gray-100 px-4 py-3 sm:px-5">
              <SegmentedControl
                variant="chips"
                label={t('products')}
                className="flex-nowrap overflow-x-auto pb-1"
                options={categoryChipOptions}
                value={selectedCategory}
                onChange={setSelectedCategory}
              />
            </div>
          )}

          {loading ? (
            <TableSkeleton rows={8} columns={9} className="rounded-none border-0 shadow-none" />
          ) : rows.length === 0 ? (
            <EmptyState compact icon={Package} title={tc('noData')} />
          ) : filteredRows.length === 0 ? (
            <EmptyState
              compact
              icon={Package}
              title={tc('noData')}
              action={<Button variant="outline" size="sm" onClick={() => { setQuery(''); setSelectedCategory(''); }}>{tc('all')}</Button>}
            />
          ) : (
            <div className="max-h-[calc(100vh-14rem)] overflow-auto">
              <table className="w-full min-w-[1460px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <th className={`${stickyHeaderCellClass} w-12 px-5 text-left`}>#</th>
                    <th className={`${stickyHeaderCellClass} min-w-[250px] text-left`}>{t('product')}</th>
                    <th className={`${stickyHeaderCellClass} text-right`}>{t('salePrice')}<br /><span className="font-normal normal-case">({tc('currency')})</span></th>
                    <th className={`${stickyHeaderCellClass} text-right`}>{t('costBasis')}<br /><span className="font-normal normal-case">({tc('currency')})</span></th>
                    <th className={`${stickyHeaderCellClass} text-center`} title={t('openingStockHint')}>{t('previousStock')}<br /><span className="font-normal normal-case">({t('pcs')})</span></th>
                    <th className={`${addedTodayHeaderCellClass} text-center`}>{t('addedToday')}<br /><span className="font-normal normal-case">({t('pcs')})</span></th>
                    <th className={`${stickyHeaderCellClass} min-w-[190px] text-center`}>
                      {t('adjustment')}
                      <br />
                      <span className="font-normal normal-case">({t('pcs')})</span>
                    </th>
                    <th className={`${stickyHeaderCellClass} text-center`}>
                      {t('closingStock')}
                      <br />
                      <Badge variant="primary" size="sm" className="normal-case">
                        {isReadOnly ? t('snapshot') : usesSoldEntry ? t('calculated') : t('youEnter')}
                      </Badge>
                    </th>
                    <th className={`${stickyHeaderCellClass} text-center`}>
                      {t('soldQty')}
                      <br />
                      <span className="font-normal normal-case">({t('pcs')})</span>
                      {canSave && (usesSoldEntry || filteredRows.some((row) => row.product.tracks_inventory === false)) && (
                        <>
                          <br />
                          <Badge variant="primary" size="sm" className="normal-case">{t('youEnter')}</Badge>
                        </>
                      )}
                    </th>
                    <th className={`${stickyHeaderCellClass} text-right`}>{t('barIncome')}<br /><span className="font-normal normal-case">({tc('currency')})</span></th>
                    <th className={`${stickyHeaderCellClass} px-5 text-right`}>{t('barProfit')}<br /><span className="font-normal normal-case">({tc('currency')})</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredRows.map((row) => {
                    const rowReadOnly = !canSave || !!row.product.is_deleted;
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
                                <Badge variant="purple" size="sm" className="mt-1">{t('madeToOrder')}</Badge>
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
                                <Badge
                                  variant="warning"
                                  size="sm"
                                  icon={<Info size={12} aria-hidden="true" />}
                                  title={t('purchaseMismatch', {
                                    purchased: row.purchaseQuantity ?? 0,
                                    saved: parseNum(row.addedToday),
                                  })}
                                >
                                  {t('purchasesBadge', { purchased: row.purchaseQuantity ?? 0 })}
                                </Badge>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          {row.product.tracks_inventory === false ? (
                            <p className="text-center font-semibold text-gray-400">—</p>
                          ) : isOwner && !rowReadOnly ? (
                            <div className="mx-auto w-44 space-y-2">
                              <Input
                                type="text"
                                inputMode="numeric"
                                controlSize="sm"
                                className="text-center font-semibold"
                                value={row.adjustmentQuantity ?? '0'}
                                aria-label={t('adjustment')}
                                onKeyDown={preventNonSignedIntegerNumberInput}
                                onWheel={(event) => event.currentTarget.blur()}
                                onChange={(event) => updateAdjustment(originalIndex, event.target.value)}
                              />
                              {parseAdjustment(row.adjustmentQuantity) !== 0 && (
                                <Input
                                  type="text"
                                  controlSize="sm"
                                  className="text-xs"
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
                          ) : rowReadOnly || usesSoldEntry ? (
                            <p className="text-center font-semibold text-gray-900">{parseNum(row.closingStock)}</p>
                          ) : (
                            stepper(
                              originalIndex,
                              row.closingStock,
                              (value) => updateRow(originalIndex, 'closingStock', value),
                              (delta) => adjustClosingStock(originalIndex, delta),
                              { label: `${t('closingStock')} · ${row.product.name}`, decrease: t(stepperLabels.decrease), increase: t(stepperLabels.increase) },
                            )
                          )}
                        </td>
                        <td className="px-4 py-4">
                          {!rowReadOnly && (usesSoldEntry || row.product.tracks_inventory === false) ? (
                            stepper(
                              originalIndex,
                              row.soldQuantity,
                              (value) => updateSoldQuantity(originalIndex, value),
                              (delta) => adjustSoldQuantity(originalIndex, delta),
                              { label: `${t('soldQty')} · ${row.product.name}`, decrease: t('decreaseSoldQty'), increase: t('increaseSoldQty') },
                            )
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
        </Card>
      </div>

      {toastElement}
    </div>
  );
}

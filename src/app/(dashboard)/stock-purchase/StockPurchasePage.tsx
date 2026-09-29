'use client';

// Route: /stock-purchase

import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { runWithJwtTimingRetry } from '@/lib/supabase/authRetry';
import { useClub } from '@/components/layout/DashboardShell';
import {
  Badge,
  Button,
  Card,
  CurrencyInput,
  DataTable,
  DatePicker,
  EmptyState,
  Field,
  IconButton,
  InlineAlert,
  Input,
  PageHeader,
  SearchInput,
  SectionHeading,
  Select,
  StatTile,
  TableSkeleton,
  toneForAmount,
  useConfirm,
  useToast,
} from '@/components/PresentationFoundation';
import { useAppLocale } from '@/components/i18n/AppLocaleContext';
import { todayIso } from '@/lib/utils';
import {
  formatCurrency,
  formatCurrencyInput,
  formatDateOnly,
  formatNumber,
  parseCurrencyInput,
} from '@/lib/formatters';
import { calculateWeightedAverageCost, isWholePositiveStockQuantity } from '@/lib/calculations/stock';
import {
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Package,
  RefreshCcw,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import { defaultPaymentMethod } from '@/lib/paymentMethods';
import type { EntryPaymentMethod, Product, StockPurchase } from '@/types';

const PURCHASES_PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 300;

interface PurchaseWithProduct extends StockPurchase {
  products: { name: string; sale_price?: number | null } | null;
}

function parseQuantity(value: string) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sanitizePurchaseSearch(value: string) {
  return value.replace(/[,%()*.\\]/g, ' ').trim();
}

function productInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function paymentBadgeVariant(method: string): 'success' | 'primary' | 'purple' | 'neutral' {
  if (method === 'cash') return 'success';
  if (method === 'terminal') return 'primary';
  if (method === 'card') return 'purple';
  return 'neutral';
}

function isMissingSortOrder(error: { message?: string } | null | undefined) {
  return error?.message?.includes('sort_order') ?? false;
}

async function fetchActiveProductsOrdered(supabase: ReturnType<typeof createClient>, clubId: string) {
  const ordered = await supabase
    .from('products')
    .select('*')
    .eq('club_id', clubId)
    .eq('is_active', true)
    .eq('tracks_inventory', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (!isMissingSortOrder(ordered.error)) return ordered;

  return supabase
    .from('products')
    .select('*')
    .eq('club_id', clubId)
    .eq('is_active', true)
    .eq('tracks_inventory', true)
    .order('name', { ascending: true });
}

export default function StockPurchasePage() {
  const t = useTranslations('stockPurchase');
  const tc = useTranslations('common');
  const { selectedClubId, businessDayStartHour, enabledPaymentMethods } = useClub();
  const { locale } = useAppLocale();
  const { showToast, toastElement } = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const businessToday = useMemo(() => todayIso(new Date(), businessDayStartHour), [businessDayStartHour]);

  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [purchases, setPurchases] = useState<PurchaseWithProduct[]>([]);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [purchasePage, setPurchasePage] = useState(1);
  const [purchaseCount, setPurchaseCount] = useState(0);
  const [purchasesLoading, setPurchasesLoading] = useState(true);
  const purchaseRequest = useRef(0);

  const [form, setForm] = useState({
    date: businessToday,
    product_id: '',
    quantity: '',
    cost_price: '',
    sale_price: '',
    payment_method: defaultPaymentMethod(enabledPaymentMethods),
    comment: '',
  });

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  const matchingProductIds = useMemo(() => {
    const needle = debouncedQuery.toLowerCase();
    if (!needle) return null;
    return products
      .filter((product) => product.name.toLowerCase().includes(needle))
      .map((product) => product.id);
  }, [products, debouncedQuery]);
  const matchingProductKey = matchingProductIds?.join(',') ?? '';

  const loadProducts = useCallback(async () => {
    if (!selectedClubId) {
      setProducts([]);
      setProductsLoading(false);
      return;
    }

    setProductsLoading(true);
    const supabase = createClient();
    const productsRes = await runWithJwtTimingRetry(
      supabase,
      async () => fetchActiveProductsOrdered(supabase, selectedClubId),
    );
    setProductsLoading(false);

    if (productsRes.error) {
      setLoadError(productsRes.error.message);
      return;
    }

    setProducts(productsRes.data ?? []);
  }, [selectedClubId]);

  const loadPurchases = useCallback(async (page: number) => {
    const requestId = ++purchaseRequest.current;
    if (!selectedClubId) {
      setPurchases([]);
      setPurchaseCount(0);
      setPurchasesLoading(false);
      return;
    }

    setPurchasesLoading(true);
    const from = (page - 1) * PURCHASES_PAGE_SIZE;
    const to = from + PURCHASES_PAGE_SIZE - 1;
    const supabase = createClient();
    const paymentSearch = sanitizePurchaseSearch(debouncedQuery);
    const productIds = matchingProductKey ? matchingProductKey.split(',') : [];
    const filters: string[] = [];
    if (paymentSearch) filters.push(`payment_method.ilike.%${paymentSearch}%`);
    if (productIds.length) filters.push(`product_id.in.(${productIds.join(',')})`);

    const { data, error: purchasesError, count } = await runWithJwtTimingRetry(
      supabase,
      async () => {
        let request = supabase
          .from('stock_purchases')
          .select('*, products(name, sale_price)', { count: 'exact' })
          .eq('club_id', selectedClubId);

        if (filters.length > 0) request = request.or(filters.join(','));

        return request
          .order('created_at', { ascending: false })
          .range(from, to);
      },
    );

    if (requestId !== purchaseRequest.current) return;
    setPurchasesLoading(false);

    if (purchasesError) {
      setLoadError(purchasesError.message);
      return;
    }

    setLoadError('');
    setPurchases((data as PurchaseWithProduct[]) ?? []);
    setPurchaseCount(count ?? 0);
  }, [debouncedQuery, matchingProductKey, selectedClubId]);

  useEffect(() => {
    setPurchasePage(1);
    setForm((prev) => ({
      ...prev,
      date: businessToday,
      payment_method: enabledPaymentMethods.some((method) => method === prev.payment_method)
        ? prev.payment_method
        : defaultPaymentMethod(enabledPaymentMethods),
    }));
  }, [businessToday, enabledPaymentMethods, selectedClubId]);

  useEffect(() => {
    loadProducts().catch((err) => setLoadError(err instanceof Error ? err.message : String(err)));
  }, [loadProducts]);

  useEffect(() => {
    loadPurchases(purchasePage).catch((err) => {
      setPurchasesLoading(false);
      setLoadError(err instanceof Error ? err.message : String(err));
    });
    return () => { purchaseRequest.current += 1; };
  }, [loadPurchases, purchasePage]);

  const selectedProduct = products.find((product) => product.id === form.product_id) ?? null;
  const quantity = parseQuantity(form.quantity);
  const costPrice = parseCurrencyInput(form.cost_price);
  const salePrice = parseCurrencyInput(form.sale_price || selectedProduct?.sale_price || 0);
  const totalCost = quantity * costPrice;
  const totalSaleValue = quantity * salePrice;
  const estimatedProfit = quantity * (salePrice - costPrice);
  const savedSalePrice = selectedProduct?.sale_price ?? 0;
  const salePriceChanged = !!selectedProduct && salePrice !== savedSalePrice;
  const projectedAverageCost = selectedProduct
    ? calculateWeightedAverageCost({
        currentStock: selectedProduct.current_stock,
        currentCostPrice: selectedProduct.cost_price,
        purchasedQuantity: quantity,
        purchaseCostPrice: costPrice,
      })
    : 0;

  const purchasePageCount = Math.max(1, Math.ceil(purchaseCount / PURCHASES_PAGE_SIZE));
  const purchaseRangeFrom = purchaseCount === 0 ? 0 : (purchasePage - 1) * PURCHASES_PAGE_SIZE + 1;
  const purchaseRangeTo = Math.min(purchasePage * PURCHASES_PAGE_SIZE, purchaseCount);
  const currency = tc('currency');

  function set<K extends keyof typeof form>(field: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFormError('');
  }

  function resetForm() {
    setForm({
      date: businessToday,
      product_id: '',
      quantity: '',
      cost_price: '',
      sale_price: '',
      payment_method: defaultPaymentMethod(enabledPaymentMethods),
      comment: '',
    });
    setFormError('');
  }

  function selectProduct(productId: string) {
    const product = products.find((item) => item.id === productId);
    setFormError('');
    setForm((prev) => ({
      ...prev,
      product_id: productId,
      cost_price: product ? formatCurrencyInput(product.cost_price) : prev.cost_price,
      sale_price: product ? formatCurrencyInput(product.sale_price) : prev.sale_price,
    }));
  }

  async function reloadAfterMutation(nextPage: number) {
    await loadProducts();
    if (nextPage === purchasePage) {
      await loadPurchases(nextPage);
    } else {
      setPurchasePage(nextPage);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClubId || !form.product_id || !form.quantity || !form.cost_price) {
      setFormError(tc('required'));
      return;
    }

    if (!isWholePositiveStockQuantity(quantity)) {
      setFormError(t('quantityWholePositive'));
      return;
    }

    setSaving(true);
    setFormError('');

    const supabase = createClient();
    const { error: err } = await supabase.rpc('record_stock_purchase', {
      p_club_id: selectedClubId,
      p_date: form.date,
      p_product_id: form.product_id,
      p_quantity: quantity,
      p_cost_price: costPrice,
      p_sale_price: form.sale_price ? salePrice : null,
      p_payment_method: form.payment_method,
      p_comment: form.comment.trim() || null,
    });

    setSaving(false);

    if (err) {
      setFormError(err.code === '55000' ? t('purchaseBlockedByClosing') : err.message);
      return;
    }

    resetForm();
    showToast(t('success'));
    await reloadAfterMutation(1);
  }

  async function handleDeletePurchase(purchase: PurchaseWithProduct) {
    if (!selectedClubId) return;
    const confirmed = await confirm({ title: tc('delete'), description: t('deleteConfirm'), confirmLabel: tc('delete') });
    if (!confirmed) return;

    setDeletingId(purchase.id);

    const supabase = createClient();
    const { error: deleteError } = await supabase.rpc('delete_stock_purchase', {
      p_club_id: selectedClubId,
      p_purchase_id: purchase.id,
    });

    setDeletingId(null);

    if (deleteError) {
      showToast(deleteError.code === '55000' ? t('deleteBlockedByClosing') : deleteError.message, 'error');
      return;
    }

    showToast(t('deleteSuccess'));
    const nextPage = purchases.length === 1 && purchasePage > 1 ? purchasePage - 1 : purchasePage;
    await reloadAfterMutation(nextPage);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={<ShoppingCart size={26} aria-hidden="true" />}
        title={t('title')}
        description={t('description')}
      />

      {loadError && <InlineAlert variant="danger">{loadError}</InlineAlert>}

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_480px]">
        <Card as="form" id="stock-purchase-form" onSubmit={handleSubmit}>
          <SectionHeading
            icon={<ShoppingCart size={18} aria-hidden="true" />}
            title={t('addStockPurchase')}
            className="mb-5"
          />

          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t('date')} required>
              <DatePicker ariaLabel={t('date')} value={form.date} max={businessToday} onChange={(value) => set('date', value)} />
            </Field>

            <Field label={t('product')} htmlFor="purchase-product" required>
              <Select
                id="purchase-product"
                className="font-semibold"
                value={form.product_id}
                onChange={(event) => selectProduct(event.target.value)}
                disabled={productsLoading}
                required
              >
                <option value="">{productsLoading ? tc('loading') : t('selectProduct')}</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>{product.name}</option>
                ))}
              </Select>
            </Field>

            <Field label={t('quantity')} htmlFor="purchase-quantity" required>
              <Input
                id="purchase-quantity"
                type="text"
                inputMode="numeric"
                className="font-semibold"
                leadingIcon={<Package size={17} className="text-primary-600" />}
                trailingAddon={t('pcs')}
                value={form.quantity}
                onChange={(event) => set('quantity', event.target.value.replace(/\D/g, ''))}
                required
              />
            </Field>

            <Field label={`${t('costPrice')} (${t('perPcs')})`} htmlFor="purchase-cost" required>
              <CurrencyInput
                id="purchase-cost"
                className="font-semibold"
                trailingAddon={currency}
                value={form.cost_price}
                onValueChange={(value) => set('cost_price', value)}
                required
              />
            </Field>

            <Field label={`${t('salePrice')} (${t('perPcs')})`} htmlFor="purchase-sale" hint={salePriceChanged ? `${t('currentSavedPrice')} ${formatCurrency(savedSalePrice)} ${currency}` : undefined}>
              <CurrencyInput
                id="purchase-sale"
                className="bg-success-50/40 font-semibold"
                trailingAddon={currency}
                value={form.sale_price}
                onValueChange={(value) => set('sale_price', value)}
              />
            </Field>

            <Field label={t('paymentMethod')} htmlFor="purchase-payment" required>
              <Select
                id="purchase-payment"
                className="font-semibold"
                value={form.payment_method}
                onChange={(event) => set('payment_method', event.target.value as EntryPaymentMethod)}
              >
                {enabledPaymentMethods.map((method) => (
                  <option key={method} value={method}>{tc(`paymentMethods.${method}`)}</option>
                ))}
              </Select>
            </Field>

            <Field label={t('comment')} htmlFor="purchase-comment" className="md:col-span-2">
              <Input
                id="purchase-comment"
                type="text"
                maxLength={250}
                placeholder={t('commentPlaceholder')}
                value={form.comment}
                onChange={(event) => set('comment', event.target.value)}
              />
            </Field>
          </div>

          <Card tone="success" className="mt-4">
            <div className="mb-3 flex items-center gap-2">
              <CheckCircle size={20} className="text-success-600" aria-hidden="true" />
              <h3 className="font-bold text-success-800">{t('purchaseSummary')}</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatTile variant="flat" align="center" label={t('totalCost')} value={formatCurrency(totalCost)} unit={currency} />
              <StatTile variant="flat" align="center" className="sm:border-x sm:border-success-100" label={t('totalSaleValue')} value={formatCurrency(totalSaleValue)} unit={currency} />
              <StatTile variant="flat" align="center" label={t('estimatedProfit')} value={formatCurrency(estimatedProfit)} unit={currency} tone={toneForAmount(estimatedProfit)} />
            </div>
            {selectedProduct && quantity > 0 && costPrice > 0 && (
              <p className="mt-3 rounded-md bg-white/70 px-3 py-2 text-center text-sm font-medium text-success-800">
                {t('newAverageBuyPrice')} {formatCurrency(projectedAverageCost)} {currency}
              </p>
            )}
          </Card>

          {formError && <InlineAlert variant="danger" className="mt-3">{formError}</InlineAlert>}

          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1.8fr]">
            <Button variant="outline" onClick={resetForm} disabled={saving} icon={<RefreshCcw size={16} aria-hidden="true" />}>
              {t('reset')}
            </Button>
            <Button type="submit" loading={saving} loadingLabel={tc('saving')} icon={<Check size={17} aria-hidden="true" />}>
              {t('submit')}
            </Button>
          </div>
        </Card>

        <Card as="aside">
          <SectionHeading
            icon={<Package size={18} aria-hidden="true" />}
            title={t('productInfo')}
            badge={selectedProduct
              ? <Badge variant={selectedProduct.current_stock > 0 ? 'success' : 'danger'}>{selectedProduct.current_stock > 0 ? t('inStock') : t('outOfStock')}</Badge>
              : <Badge variant="neutral">{t('selectProduct')}</Badge>}
            className="mb-5"
          />

          {selectedProduct ? (
            <>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-100 text-lg font-bold text-gray-500" aria-hidden="true">
                  {productInitials(selectedProduct.name)}
                </div>
                <div className="min-w-0">
                  <h3 className="break-words text-xl font-bold text-gray-900">{selectedProduct.name}</h3>
                  <p className="mt-2 text-sm text-gray-600">
                    {t('salePriceLabel')} <span className="font-bold text-success-600">{formatCurrency(salePrice)} {currency}</span>
                  </p>
                  <p className="mt-1 text-sm text-gray-600">
                    {t('costPriceLabel')} <span className="font-bold text-danger-600">{formatCurrency(selectedProduct.cost_price)} {currency}</span>
                  </p>
                  {quantity > 0 && costPrice > 0 && (
                    <p className="mt-1 text-sm text-gray-600">
                      {t('newAvgCost')} <span className="font-bold text-primary-600">{formatCurrency(projectedAverageCost)} {currency}</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-5 grid gap-3 rounded-lg border border-purple-100 bg-purple-50/30 p-4 sm:grid-cols-2">
                <StatTile variant="flat" size="sm" label={t('currentStock')} value={formatNumber(selectedProduct.current_stock)} unit={t('pcs')} tone="primary" />
                <StatTile variant="flat" size="sm" label={t('lowStockAlert')} value={formatNumber(selectedProduct.low_stock_threshold ?? 5)} unit={t('pcs')} tone="warning" />
                <StatTile variant="flat" size="sm" label={t('stockValue')} value={formatCurrency(selectedProduct.current_stock * selectedProduct.cost_price)} unit={currency} tone="success" className="sm:col-span-2" />
              </div>
            </>
          ) : (
            <EmptyState compact bordered icon={Package} title={t('selectProductHint')} />
          )}

          <Card tone="primary" className="mt-5 border-primary-100 bg-primary-50/40">
            <h3 className="font-bold text-gray-900">{t('howItWorks')}</h3>
            <ul className="mt-3 space-y-2 text-sm text-gray-700">
              {[t('hintStock'), t('hintClosing'), t('hintProfit')].map((hint) => (
                <li key={hint} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-primary-600" aria-hidden="true" />{hint}</li>
              ))}
            </ul>
          </Card>
        </Card>
      </div>

      <Card as="section">
        <SectionHeading
          title={t('recentPurchases')}
          className="mb-4"
          action={(
            <SearchInput
              className="w-full sm:w-72"
              controlSize="sm"
              value={query}
              onChange={(value) => { setQuery(value); setPurchasePage(1); }}
              placeholder={t('searchPlaceholder')}
              clearLabel={tc('cancel')}
            />
          )}
        />

        {purchasesLoading && purchases.length === 0 ? (
          <TableSkeleton rows={6} columns={8} className="shadow-none" />
        ) : (
          <DataTable
            keyExtractor={(row) => row.id}
            data={purchases}
            minWidth={980}
            className={purchasesLoading ? 'opacity-60 transition-opacity' : 'transition-opacity'}
            emptyState={<EmptyState compact icon={ShoppingCart} title={tc('noData')} />}
            columns={[
              { key: 'index', header: '#', className: 'w-12', render: (_row, index) => <span className="font-semibold text-gray-700">{(purchasePage - 1) * PURCHASES_PAGE_SIZE + index + 1}</span> },
              { key: 'date', header: t('date'), render: (row) => <span className="font-semibold text-gray-900">{formatDateOnly(row.date, locale)}</span> },
              {
                key: 'product',
                header: t('product'),
                render: (row) => (
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-8 flex-shrink-0 items-center justify-center rounded bg-gray-100 text-[10px] font-bold text-gray-500" aria-hidden="true">
                      {productInitials(row.products?.name ?? '-')}
                    </span>
                    <span className="font-bold text-gray-900">{row.products?.name ?? '—'}</span>
                  </div>
                ),
              },
              { key: 'quantity', header: t('quantity'), align: 'center', render: (row) => <span className="font-semibold">{formatNumber(row.quantity)} {t('pcs')}</span> },
              { key: 'cost', header: `${t('costPrice')} (${t('perPcs')})`, align: 'right', render: (row) => <span className="font-semibold">{formatCurrency(row.cost_price)}</span> },
              { key: 'sale', header: `${t('salePrice')} (${t('perPcs')})`, align: 'right', render: (row) => <span className="font-semibold">{formatCurrency(row.sale_price ?? row.products?.sale_price ?? 0)}</span> },
              { key: 'total', header: `${t('totalCostHeader')} (${currency})`, align: 'right', render: (row) => <span className="font-bold text-gray-900">{formatCurrency(row.quantity * row.cost_price)}</span> },
              {
                key: 'payment',
                header: t('payment'),
                align: 'center',
                render: (row) => (
                  <Badge variant={paymentBadgeVariant(row.payment_method)} icon={<CreditCard size={13} aria-hidden="true" />}>
                    {tc.has(`paymentMethods.${row.payment_method}`) ? tc(`paymentMethods.${row.payment_method}` as Parameters<typeof tc>[0]) : row.payment_method}
                  </Badge>
                ),
              },
              {
                key: 'actions',
                header: tc('actions'),
                align: 'center',
                render: (row) => (
                  <IconButton
                    size="sm"
                    variant="danger"
                    label={tc('delete')}
                    icon={<Trash2 size={16} />}
                    loading={deletingId === row.id}
                    disabled={Boolean(deletingId)}
                    onClick={() => handleDeletePurchase(row)}
                  />
                ),
              },
            ]}
          />
        )}

        <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium text-gray-600" role="status">
            {purchasesLoading ? tc('loading') : t('paginationShowing', { from: purchaseRangeFrom, to: purchaseRangeTo, total: purchaseCount })}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={purchasePage <= 1 || purchasesLoading}
              onClick={() => setPurchasePage((page) => Math.max(1, page - 1))}
              icon={<ChevronLeft size={16} aria-hidden="true" />}
            >
              {t('previousPage')}
            </Button>
            <span className="min-w-20 text-center text-sm font-bold text-gray-700">
              {t('paginationPage', { page: purchasePage, total: purchasePageCount })}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={purchasePage >= purchasePageCount || purchasesLoading}
              onClick={() => setPurchasePage((page) => Math.min(purchasePageCount, page + 1))}
              iconRight={<ChevronRight size={16} aria-hidden="true" />}
            >
              {t('nextPage')}
            </Button>
          </div>
        </div>
      </Card>

      {toastElement}
      {confirmDialog}
    </div>
  );
}

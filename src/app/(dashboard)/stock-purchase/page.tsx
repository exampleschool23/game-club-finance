'use client';

import { useMemo, useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatDate, todayIso } from '@/lib/utils';
import { calculateWeightedAverageCost } from '@/lib/calculations/stock';
import {
  Calendar,
  Check,
  CheckCircle,
  ChevronDown,
  Coins,
  CreditCard,
  Filter,
  MessageCircle,
  Package,
  Plus,
  RefreshCcw,
  Search,
  ShoppingCart,
  Trash2,
  Upload,
  Wallet,
} from 'lucide-react';
import type { Product, StockPurchase } from '@/types';

interface PurchaseWithProduct extends StockPurchase {
  products: { name: string; sale_price?: number | null; cost_price?: number | null } | null;
}

function parseNum(value: string) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function prettyDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB');
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

function paymentBadge(method: string) {
  const styles: Record<string, string> = {
    cash: 'bg-success-50 text-success-700 border-success-100',
    terminal: 'bg-primary-50 text-primary-700 border-primary-100',
    qr: 'bg-warning-50 text-warning-700 border-warning-100',
    transfer: 'bg-purple-50 text-purple-700 border-purple-100',
  };
  return styles[method] ?? 'bg-gray-100 text-gray-700 border-gray-200';
}

export default function StockPurchasePage() {
  const t = useTranslations('stockPurchase');
  const tc = useTranslations('common');

  const [products, setProducts] = useState<Product[]>([]);
  const [purchases, setPurchases] = useState<PurchaseWithProduct[]>([]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  const [form, setForm] = useState({
    date: todayIso(),
    product_id: '',
    quantity: '',
    cost_price: '',
    sale_price: '',
    payment_method: 'cash',
    comment: '',
  });

  async function loadData() {
    const supabase = createClient();
    const [productsRes, purchasesRes] = await Promise.all([
      supabase.from('products').select('*').eq('is_active', true).order('name'),
      supabase
        .from('stock_purchases')
        .select('*, products(name, sale_price, cost_price)')
        .order('created_at', { ascending: false })
        .limit(30),
    ]);

    if (productsRes.error || purchasesRes.error) {
      setError(productsRes.error?.message ?? purchasesRes.error?.message ?? tc('error'));
      return;
    }

    setProducts(productsRes.data ?? []);
    setPurchases((purchasesRes.data as PurchaseWithProduct[]) ?? []);
  }

  useEffect(() => {
    loadData().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const selectedProduct = products.find((product) => product.id === form.product_id) ?? null;
  const quantity = parseNum(form.quantity);
  const costPrice = parseNum(form.cost_price);
  const salePrice = parseNum(form.sale_price || String(selectedProduct?.sale_price ?? 0));
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

  const filteredPurchases = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return purchases;
    return purchases.filter((purchase) =>
      (purchase.products?.name ?? '').toLowerCase().includes(needle) ||
      purchase.payment_method.toLowerCase().includes(needle),
    );
  }, [purchases, query]);

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function resetForm() {
    setForm({
      date: todayIso(),
      product_id: '',
      quantity: '',
      cost_price: '',
      sale_price: '',
      payment_method: 'cash',
      comment: '',
    });
    setError('');
    setSuccess('');
  }

  function selectProduct(productId: string) {
    const product = products.find((item) => item.id === productId);
    setForm((prev) => ({
      ...prev,
      product_id: productId,
      cost_price: product ? String(product.cost_price) : prev.cost_price,
      sale_price: product ? String(product.sale_price) : prev.sale_price,
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.product_id || !form.quantity || !form.cost_price) {
      setError(tc('required'));
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    const { error: err } = await supabase.from('stock_purchases').insert({
      date: form.date,
      product_id: form.product_id,
      quantity,
      cost_price: costPrice,
      sale_price: form.sale_price ? salePrice : null,
      payment_method: form.payment_method,
      comment: form.comment || null,
      created_by: session?.user?.id ?? null,
    });

    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }

    setSuccess(t('success'));
    resetForm();
    await loadData();
  }

  const paymentMethods = ['cash', 'terminal', 'qr', 'transfer'];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
            <ShoppingCart size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-950">{t('title')}</h1>
            <p className="mt-1 text-sm text-gray-600">{t('description')}</p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button className="btn-secondary flex min-h-11 items-center justify-center gap-2 border border-gray-200 bg-white px-5">
            <Upload size={17} />
            {t('importFromExcel')}
          </button>
          <button className="btn-primary flex min-h-11 items-center justify-center gap-2 px-5">
            <Plus size={18} />
            {t('addNewPurchase')}
          </button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_520px]">
        <form onSubmit={handleSubmit} className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
              <ShoppingCart size={18} />
            </span>
            <h2 className="text-lg font-bold text-gray-900">{t('addStockPurchase')}</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">{t('date')} <span className="text-danger-500">*</span></label>
              <div className="flex h-11 items-center gap-3 rounded-lg border border-gray-200 bg-white px-3">
                <Calendar size={17} className="text-primary-600" />
                <input
                  type="date"
                  className="min-w-0 flex-1 bg-transparent font-semibold text-gray-900 outline-none"
                  value={form.date}
                  onChange={(event) => set('date', event.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="label">{t('product')} <span className="text-danger-500">*</span></label>
              <div className="relative">
                <select
                  className="input-field h-11 appearance-none pr-10 font-semibold"
                  value={form.product_id}
                  onChange={(event) => selectProduct(event.target.value)}
                  required
                >
                  <option value="">— {tc('all')} —</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={17} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" />
              </div>
            </div>

            <div>
              <label className="label">{t('quantity')} <span className="text-danger-500">*</span></label>
              <div className="flex h-11 items-center gap-3 rounded-lg border border-gray-200 bg-white px-3">
                <Package size={17} className="text-primary-600" />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="min-w-0 flex-1 bg-transparent font-semibold text-gray-900 outline-none"
                  value={form.quantity}
                  onChange={(event) => set('quantity', event.target.value)}
                  required
                />
                <span className="text-sm font-semibold text-gray-600">{t('pcs')}</span>
              </div>
            </div>

            <div>
              <label className="label">{t('costPrice')} ({t('perPcs')}) <span className="text-danger-500">*</span></label>
              <div className="flex h-11 items-center gap-3 rounded-lg border border-gray-200 bg-white px-3">
                <Coins size={17} className="text-purple-600" />
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="min-w-0 flex-1 bg-transparent font-semibold text-gray-900 outline-none"
                  value={form.cost_price}
                  onChange={(event) => set('cost_price', event.target.value)}
                  required
                />
                <span className="text-sm font-semibold text-gray-600">{tc('currency')}</span>
              </div>
            </div>

            <div>
              <label className="label">{t('salePrice')} ({t('perPcs')})</label>
              <div className="flex h-11 items-center gap-3 rounded-lg border border-gray-200 bg-success-50/40 px-3">
                <Coins size={17} className="text-success-600" />
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="min-w-0 flex-1 bg-transparent font-semibold text-gray-900 outline-none"
                  value={form.sale_price}
                  onChange={(event) => set('sale_price', event.target.value)}
                />
                <span className="text-sm font-semibold text-gray-600">{tc('currency')}</span>
              </div>
            </div>

            <div>
              <label className="label">{t('paymentMethod')} <span className="text-danger-500">*</span></label>
              <div className="relative">
                <select
                  className="input-field h-11 appearance-none bg-warning-50/30 pr-10 font-semibold"
                  value={form.payment_method}
                  onChange={(event) => set('payment_method', event.target.value)}
                >
                  {paymentMethods.map((method) => (
                    <option key={method} value={method}>
                      {tc(`paymentMethods.${method}`)}
                    </option>
                  ))}
                </select>
                <Wallet size={17} className="pointer-events-none absolute left-3 top-1/2 hidden -translate-y-1/2 text-warning-600" />
                <ChevronDown size={17} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" />
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="label">{t('comment')}</label>
              <div className="flex h-11 items-center gap-3 rounded-lg border border-gray-200 bg-white px-3">
                <MessageCircle size={17} className="text-primary-600" />
                <input
                  type="text"
                  className="min-w-0 flex-1 bg-transparent text-gray-900 outline-none"
                  placeholder={t('commentPlaceholder')}
                  value={form.comment}
                  onChange={(event) => set('comment', event.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-success-100 bg-success-50/70 p-4">
            <div className="mb-3 flex items-center gap-2">
              <CheckCircle size={20} className="text-success-600" />
              <h3 className="font-bold text-success-800">{t('purchaseSummary')}</h3>
            </div>
            <div className="grid gap-3 text-center sm:grid-cols-3">
              <div>
                <p className="text-xs font-medium text-gray-600">{t('totalCost')}</p>
                <p className="mt-1 break-words font-bold text-gray-900">{formatCurrency(totalCost)} {tc('currency')}</p>
              </div>
              <div className="sm:border-x sm:border-success-200">
                <p className="text-xs font-medium text-gray-600">{t('totalSaleValue')}</p>
                <p className="mt-1 break-words font-bold text-gray-900">{formatCurrency(totalSaleValue)} {tc('currency')}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-600">{t('estimatedProfit')}</p>
                <p className={`mt-1 break-words font-bold ${estimatedProfit >= 0 ? 'text-success-700' : 'text-danger-600'}`}>
                  {formatCurrency(estimatedProfit)} {tc('currency')}
                </p>
              </div>
            </div>
            {selectedProduct && quantity > 0 && costPrice > 0 && (
              <div className="mt-3 rounded-md bg-white/70 px-3 py-2 text-center text-sm font-medium text-success-800">
                {t('newAverageBuyPrice')} {formatCurrency(projectedAverageCost)} {tc('currency')}
              </div>
            )}
          </div>

          {error && <p className="mt-3 text-sm font-medium text-danger-500">{error}</p>}
          {success && <p className="mt-3 text-sm font-medium text-success-600">{success}</p>}

          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1.8fr]">
            <button type="button" onClick={resetForm} className="btn-secondary flex min-h-11 items-center justify-center gap-2 border border-gray-200 bg-white">
              <RefreshCcw size={16} />
              {t('reset')}
            </button>
            <button type="submit" className="btn-primary flex min-h-11 items-center justify-center gap-2" disabled={saving}>
              <Check size={17} />
              {saving ? tc('saving') : t('submit')}
            </button>
          </div>
        </form>

        <aside className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                <Package size={18} />
              </span>
              <h2 className="text-lg font-bold text-gray-900">{t('productInfo')}</h2>
            </div>
            <span className="rounded-full bg-success-50 px-3 py-1 text-xs font-bold text-success-700">
              {selectedProduct?.is_active ? t('inStock') : t('selectProduct')}
            </span>
          </div>

          {selectedProduct ? (
            <>
              <div className="flex items-center gap-4">
                <div className="flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-100 text-lg font-bold text-gray-500">
                  {productInitials(selectedProduct.name)}
                </div>
                <div className="min-w-0">
                  <h3 className="break-words text-xl font-bold text-gray-900">{selectedProduct.name}</h3>
                  <p className="mt-3 text-sm text-gray-600">
                    {t('salePriceLabel')} <span className="font-bold text-success-600">{formatCurrency(salePrice)} {tc('currency')}</span>
                  </p>
                  {salePriceChanged && (
                    <p className="mt-1 text-xs font-medium text-primary-600">
                      {t('currentSavedPrice')} {formatCurrency(savedSalePrice)} {tc('currency')}
                    </p>
                  )}
                  <p className="mt-2 text-sm text-gray-600">
                    {t('costPriceLabel')} <span className="font-bold text-danger-600">{formatCurrency(selectedProduct.cost_price)} {tc('currency')}</span>
                  </p>
                {quantity > 0 && costPrice > 0 && (
                  <p className="mt-2 text-sm text-gray-600">
                    {t('newAvgCost')} <span className="font-bold text-primary-600">{formatCurrency(projectedAverageCost)} {tc('currency')}</span>
                  </p>
                )}
              </div>
              </div>

              <div className="mt-6 grid gap-4 rounded-lg border border-purple-100 bg-purple-50/30 p-4 sm:grid-cols-2">
                <InfoTile label={t('currentStock')} value={`${selectedProduct.current_stock} ${t('pcs')}`} color="text-primary-700" />
                <InfoTile label={t('lowStockAlert')} value={`${selectedProduct.low_stock_threshold ?? 5} ${t('pcs')}`} color="text-warning-700" />
                <InfoTile label={t('stockValue')} value={`${formatCurrency(selectedProduct.current_stock * selectedProduct.cost_price)} ${tc('currency')}`} color="text-success-700" />
                <InfoTile label={t('lastPurchase')} value={purchases.find((purchase) => purchase.product_id === selectedProduct.id)?.date ? formatDate(purchases.find((purchase) => purchase.product_id === selectedProduct.id)!.date) : '-'} color="text-purple-700" />
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
              {t('selectProductHint')}
            </div>
          )}

          <div className="mt-5 rounded-lg border border-primary-100 bg-primary-50/40 p-4">
            <h3 className="font-bold text-gray-900">{t('howItWorks')}</h3>
            <ul className="mt-3 space-y-2 text-sm text-gray-700">
              <li className="flex gap-2"><Check size={16} className="mt-0.5 text-primary-600" />{t('hintStock')}</li>
              <li className="flex gap-2"><Check size={16} className="mt-0.5 text-primary-600" />{t('hintClosing')}</li>
              <li className="flex gap-2"><Check size={16} className="mt-0.5 text-primary-600" />{t('hintProfit')}</li>
            </ul>
          </div>
        </aside>
      </div>

      <section className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-lg font-bold text-gray-900">{t('recentPurchases')}</h2>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative w-full sm:w-72">
              <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                className="input-field h-10 pl-9"
                placeholder={t('searchPlaceholder')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <button className="btn-secondary flex min-h-10 items-center justify-center gap-2 border border-gray-200 bg-white">
              <Filter size={16} />
              {t('filters')}
            </button>
          </div>
        </div>

        {filteredPurchases.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 p-8 text-center text-gray-500">{tc('noData')}</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full min-w-[1080px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="w-12 px-4 py-3 text-left">#</th>
                  <th className="px-4 py-3 text-left">{t('date')}</th>
                  <th className="px-4 py-3 text-left">{t('product')}</th>
                  <th className="px-4 py-3 text-center">{t('quantity')}</th>
                  <th className="px-4 py-3 text-right">{t('costPrice')} ({t('perPcs')})</th>
                  <th className="px-4 py-3 text-right">{t('salePrice')} ({t('perPcs')})</th>
                  <th className="px-4 py-3 text-right">{t('totalCostHeader')}</th>
                  <th className="px-4 py-3 text-center">{t('payment')}</th>
                  <th className="px-4 py-3 text-center">{tc('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredPurchases.map((purchase, index) => (
                  <tr key={purchase.id} className="hover:bg-gray-50/80">
                    <td className="px-4 py-3 font-semibold text-gray-700">{index + 1}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{prettyDate(purchase.date)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-8 flex-shrink-0 items-center justify-center rounded bg-gray-100 text-[10px] font-bold text-gray-500">
                          {productInitials(purchase.products?.name ?? '-')}
                        </div>
                        <span className="font-bold text-gray-900">{purchase.products?.name ?? '-'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center font-semibold">{purchase.quantity} {t('pcs')}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatCurrency(purchase.cost_price)} {tc('currency')}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatCurrency(purchase.sale_price ?? purchase.products?.sale_price ?? 0)} {tc('currency')}</td>
                    <td className="px-4 py-3 text-right font-bold">{formatCurrency(purchase.quantity * purchase.cost_price)} {tc('currency')}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold ${paymentBadge(purchase.payment_method)}`}>
                        <CreditCard size={13} />
                        {tc(`paymentMethods.${purchase.payment_method}` as Parameters<typeof tc>[0])}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary-200 text-primary-600">
                          <Plus size={16} />
                        </button>
                        <button className="flex h-9 w-9 items-center justify-center rounded-lg border border-danger-200 text-danger-500">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function InfoTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="min-w-0">
      <p className="text-sm font-medium text-gray-600">{label}</p>
      <p className={`mt-1 break-words text-base font-bold ${color}`}>{value}</p>
    </div>
  );
}

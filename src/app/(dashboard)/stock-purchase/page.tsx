'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { FormSection } from '@/components/ui/FormSection';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency, formatDate, todayIso } from '@/lib/utils';
import { ShoppingCart } from 'lucide-react';
import type { Product, StockPurchase } from '@/types';

interface PurchaseWithProduct extends StockPurchase {
  products: { name: string } | null;
}

export default function StockPurchasePage() {
  const t = useTranslations('stockPurchase');
  const tc = useTranslations('common');

  const [products, setProducts] = useState<Product[]>([]);
  const [purchases, setPurchases] = useState<PurchaseWithProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

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
    const [pRes, purchRes] = await Promise.all([
      supabase.from('products').select('*').eq('is_active', true).order('name'),
      supabase
        .from('stock_purchases')
        .select('*, products(name)')
        .order('created_at', { ascending: false })
        .limit(30),
    ]);
    setProducts(pRes.data ?? []);
    setPurchases((purchRes.data as PurchaseWithProduct[]) ?? []);
  }

  useEffect(() => {
    loadData().catch(() => {});
  }, []);

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.product_id || !form.quantity || !form.cost_price) {
      setError(tc('required'));
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    const { error: err } = await supabase.from('stock_purchases').insert({
      date: form.date,
      product_id: form.product_id,
      quantity: parseFloat(form.quantity),
      cost_price: parseFloat(form.cost_price),
      sale_price: form.sale_price ? parseFloat(form.sale_price) : null,
      payment_method: form.payment_method,
      comment: form.comment || null,
      created_by: session?.user?.id ?? null,
    });

    setLoading(false);
    if (err) {
      setError(err.message);
    } else {
      setSuccess(t('success'));
      setForm({
        date: todayIso(),
        product_id: '',
        quantity: '',
        cost_price: '',
        sale_price: '',
        payment_method: 'cash',
        comment: '',
      });
      await loadData();
    }
  }

  const paymentMethods = ['cash', 'terminal', 'qr', 'transfer'];

  return (
    <div className="max-w-4xl">
      <PageHeader title={t('title')} description={t('description')} />

      <div className="space-y-6">
        <form onSubmit={handleSubmit}>
          <FormSection title={t('title')}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">{t('date')}</label>
                <input
                  type="date"
                  className="input-field"
                  value={form.date}
                  onChange={(e) => set('date', e.target.value)}
                />
              </div>
              <div>
                <label className="label">{t('product')}</label>
                <select
                  className="input-field"
                  value={form.product_id}
                  onChange={(e) => set('product_id', e.target.value)}
                  required
                >
                  <option value="">— {tc('all')} —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">{t('quantity')}</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="input-field"
                  value={form.quantity}
                  onChange={(e) => set('quantity', e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label">{t('costPrice')}</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="input-field"
                  value={form.cost_price}
                  onChange={(e) => set('cost_price', e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label">{t('salePrice')}</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="input-field"
                  value={form.sale_price}
                  onChange={(e) => set('sale_price', e.target.value)}
                />
              </div>
              <div>
                <label className="label">{t('paymentMethod')}</label>
                <select
                  className="input-field"
                  value={form.payment_method}
                  onChange={(e) => set('payment_method', e.target.value)}
                >
                  {paymentMethods.map((m) => (
                    <option key={m} value={m}>
                      {tc(`paymentMethods.${m}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label">{t('comment')}</label>
                <input
                  type="text"
                  className="input-field"
                  value={form.comment}
                  onChange={(e) => set('comment', e.target.value)}
                />
              </div>
            </div>

            {error && <p className="mt-3 text-sm text-danger-500">{error}</p>}
            {success && <p className="mt-3 text-sm text-success-600">{success}</p>}

            <button type="submit" className="btn-primary mt-4" disabled={loading}>
              {loading ? tc('saving') : t('submit')}
            </button>
          </FormSection>
        </form>

        <div>
          <h2 className="text-base font-semibold text-gray-700 mb-3">{t('recentPurchases')}</h2>
          {purchases.length === 0 ? (
            <EmptyState icon={ShoppingCart} title={tc('noData')} />
          ) : (
            <DataTable
              keyExtractor={(r) => r.id}
              data={purchases}
              columns={[
                { key: 'date', header: t('date'), render: (r) => formatDate(r.date) },
                { key: 'product', header: t('product'), render: (r) => r.products?.name ?? '-' },
                { key: 'quantity', header: t('quantity'), render: (r) => String(r.quantity) },
                {
                  key: 'cost_price',
                  header: t('costPrice'),
                  render: (r) => formatCurrency(r.cost_price),
                },
                {
                  key: 'payment_method',
                  header: t('paymentMethod'),
                  render: (r) => r.payment_method,
                },
              ]}
            />
          )}
        </div>
      </div>
    </div>
  );
}

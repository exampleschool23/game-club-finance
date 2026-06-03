'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency } from '@/lib/utils';
import { Lock, Package, Plus, X } from 'lucide-react';
import type { Product, UserRole } from '@/types';

interface ProductForm {
  name: string;
  category: string;
  sale_price: string;
  cost_price: string;
  current_stock: string;
  low_stock_threshold: string;
  is_active: boolean;
}

const emptyForm = (): ProductForm => ({
  name: '',
  category: '',
  sale_price: '',
  cost_price: '',
  current_stock: '',
  low_stock_threshold: '5',
  is_active: true,
});

export default function ProductsPage() {
  const t = useTranslations('products');
  const tc = useTranslations('common');
  const [products, setProducts] = useState<Product[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [currentRole, setCurrentRole] = useState<UserRole | null>(null);

  const isOwner = currentRole === 'owner';

  useEffect(() => {
    async function fetchRole() {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;
      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();
      setCurrentRole((data?.role as UserRole | undefined) ?? null);
    }
    fetchRole().catch(() => {});
  }, []);

  async function loadProducts() {
    const supabase = createClient();
    const { data } = await supabase.from('products').select('*').order('name');
    setProducts(data ?? []);
  }

  useEffect(() => {
    loadProducts().catch(() => {});
  }, []);

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm());
    setError('');
    setModalOpen(true);
  }

  function openEdit(p: Product) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      category: p.category ?? '',
      sale_price: String(p.sale_price),
      cost_price: String(p.cost_price),
      current_stock: String(p.current_stock),
      low_stock_threshold: String(p.low_stock_threshold ?? 5),
      is_active: p.is_active,
    });
    setError('');
    setModalOpen(true);
  }

  function set(field: keyof ProductForm, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setError(tc('required'));
      return;
    }
    setSaving(true);
    setError('');

    const supabase = createClient();
    const payload = {
      name: form.name.trim(),
      category: form.category.trim() || null,
      sale_price: parseFloat(form.sale_price) || 0,
      // Only owners can change cost_price and current_stock directly
      ...(isOwner ? { cost_price: parseFloat(form.cost_price) || 0 } : {}),
      ...(isOwner ? { current_stock: parseFloat(form.current_stock) || 0 } : {}),
      low_stock_threshold: parseFloat(form.low_stock_threshold) || 5,
      is_active: form.is_active,
      updated_at: new Date().toISOString(),
    };

    let err: string | null = null;
    if (editingId) {
      const { error: e } = await supabase
        .from('products')
        .update(payload)
        .eq('id', editingId);
      err = e?.message ?? null;
    } else {
      const { error: e } = await supabase.from('products').insert(payload);
      err = e?.message ?? null;
    }

    setSaving(false);
    if (err) {
      setError(err);
    } else {
      setModalOpen(false);
      await loadProducts();
    }
  }

  return (
    <div>
      <PageHeader
        title={t('title')}
        description={t('description')}
        action={
          <button className="btn-primary flex items-center gap-2" onClick={openAdd}>
            <Plus size={16} />
            {t('addProduct')}
          </button>
        }
      />

      {products.length === 0 ? (
        <EmptyState
          icon={Package}
          title={tc('noData')}
          action={
            <button className="btn-primary" onClick={openAdd}>
              {t('addProduct')}
            </button>
          }
        />
      ) : (
        <DataTable
          keyExtractor={(r) => r.id}
          data={products}
          columns={[
            { key: 'name', header: t('name') },
            { key: 'category', header: t('category'), render: (r) => r.category ?? '-' },
            {
              key: 'sale_price',
              header: t('salePrice'),
              render: (r) => formatCurrency(r.sale_price),
            },
            {
              key: 'cost_price',
              header: t('costPrice'),
              render: (r) => formatCurrency(r.cost_price),
            },
            {
              key: 'current_stock',
              header: t('currentStock'),
              render: (r) => {
                const low = r.current_stock <= (r.low_stock_threshold ?? 5);
                return (
                  <span className={low ? 'text-danger-500 font-semibold' : ''}>
                    {r.current_stock}
                  </span>
                );
              },
            },
            {
              key: 'is_active',
              header: tc('active'),
              render: (r) => (
                <Badge variant={r.is_active ? 'success' : 'default'}>
                  {r.is_active ? tc('active') : tc('inactive')}
                </Badge>
              ),
            },
            {
              key: 'actions',
              header: tc('actions'),
              render: (r) => (
                <button
                  className="text-primary-600 hover:underline text-sm"
                  onClick={() => openEdit(r)}
                >
                  {tc('edit')}
                </button>
              ),
            },
          ]}
        />
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingId ? t('editProduct') : t('addProduct')}
              </h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="label">{t('name')}</label>
                <input
                  type="text"
                  className="input-field"
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                />
              </div>
              <div>
                <label className="label">{t('category')}</label>
                <input
                  type="text"
                  className="input-field"
                  value={form.category}
                  onChange={(e) => set('category', e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
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
                  <label className="label flex items-center gap-1.5">
                    {t('costPrice')}
                    {!isOwner && <Lock size={12} className="text-gray-400" />}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="input-field disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                    value={form.cost_price}
                    disabled={!isOwner}
                    onChange={(e) => set('cost_price', e.target.value)}
                  />
                  {!isOwner && (
                    <p className="mt-1 text-xs text-gray-400">Updated automatically from stock purchases</p>
                  )}
                </div>
                <div>
                  <label className="label flex items-center gap-1.5">
                    {t('currentStock')}
                    {!isOwner && <Lock size={12} className="text-gray-400" />}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="input-field disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                    value={form.current_stock}
                    disabled={!isOwner}
                    onChange={(e) => set('current_stock', e.target.value)}
                  />
                  {!isOwner && (
                    <p className="mt-1 text-xs text-gray-400">Only owners can edit stock count</p>
                  )}
                </div>
                <div>
                  <label className="label">{t('lowStockThreshold')}</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="input-field"
                    value={form.low_stock_threshold}
                    onChange={(e) => set('low_stock_threshold', e.target.value)}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={form.is_active}
                  onChange={(e) => set('is_active', e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="is_active" className="text-sm text-gray-700">
                  {tc('active')}
                </label>
              </div>

              {error && <p className="text-sm text-danger-500">{error}</p>}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button className="btn-secondary flex-1" onClick={() => setModalOpen(false)}>
                {tc('cancel')}
              </button>
              <button className="btn-primary flex-1" onClick={handleSave} disabled={saving}>
                {saving ? tc('saving') : tc('save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

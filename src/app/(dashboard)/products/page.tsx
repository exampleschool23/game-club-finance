'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useClub } from '@/components/layout/DashboardShell';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/LoadingSkeleton';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatCurrencyInput } from '@/lib/formatters';
import { buildProductInsertPayload, buildProductUpdatePayload, type ProductWriteForm } from '@/lib/productWrites';
import { ArrowDown, ArrowUp, Lock, Package, Plus, Trash2, X } from 'lucide-react';
import type { Product } from '@/types';

type ProductForm = ProductWriteForm;

const emptyForm = (): ProductForm => ({
  name: '',
  category: '',
  sale_price: '',
  cost_price: '',
  current_stock: '',
  low_stock_threshold: '5',
  tracks_inventory: true,
  is_active: true,
});

function isMissingSortOrder(error: { message?: string } | null | undefined) {
  return error?.message?.includes('sort_order') ?? false;
}

function isForeignKeyDeleteError(error: { message?: string; code?: string } | null | undefined) {
  return error?.code === '23503' || error?.message?.includes('violates foreign key constraint') || false;
}

function productCategory(value: string | null | undefined): string {
  return String(value ?? '').trim();
}

export default function ProductsPage() {
  const t = useTranslations('products');
  const tc = useTranslations('common');
  const { selectedClubId, role: currentRole } = useClub();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');

  const isOwner = currentRole === 'owner';
  const canManageInventory = currentRole === 'owner' || currentRole === 'admin';

  const loadProducts = useCallback(async () => {
    setLoading(true);
    if (!selectedClubId) {
      setProducts([]);
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const ordered = await supabase
      .from('products')
      .select('*')
      .eq('club_id', selectedClubId)
      .eq('is_deleted', false)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (!ordered.error) {
      setProducts((ordered.data ?? []) as Product[]);
      setLoading(false);
      return;
    }

    if (isMissingSortOrder(ordered.error)) {
      const named = await supabase
        .from('products')
        .select('*')
        .eq('club_id', selectedClubId)
        .eq('is_deleted', false)
        .order('name', { ascending: true });

      if (!named.error) {
        setProducts((named.data ?? []) as Product[]);
        setLoading(false);
        return;
      }
    }

    const orderedWithoutDeletedFilter = await supabase
      .from('products')
      .select('*')
      .eq('club_id', selectedClubId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (!orderedWithoutDeletedFilter.error) {
      setProducts((orderedWithoutDeletedFilter.data ?? []) as Product[]);
      setLoading(false);
      return;
    }

    const fallback = await supabase
      .from('products')
      .select('*')
      .eq('club_id', selectedClubId)
      .order('name', { ascending: true });

    if (fallback.error) {
      setProducts([]);
      setError(fallback.error.message);
      setLoading(false);
      return;
    }

    setError('');
    setProducts((fallback.data ?? []) as Product[]);
    setLoading(false);
  }, [selectedClubId]);

  useEffect(() => {
    loadProducts().catch((loadError) => {
      setProducts([]);
      setError(loadError instanceof Error ? loadError.message : String(loadError));
      setLoading(false);
    });
  }, [loadProducts]);

  const categoryOptions = useMemo(() => {
    return Array.from(new Set(products.map((product) => productCategory(product.category)).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b));
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (!selectedCategory) return products;
    return products.filter((product) => productCategory(product.category) === selectedCategory);
  }, [products, selectedCategory]);
  useEffect(() => {
    if (!selectedCategory) return;
    const categoryExists = products.some((product) => productCategory(product.category) === selectedCategory);
    if (!categoryExists) setSelectedCategory('');
  }, [products, selectedCategory]);

  function openAdd() {
    if (!canManageInventory) return;
    setEditingId(null);
    setForm(emptyForm());
    setError('');
    setModalOpen(true);
  }

  function openEdit(p: Product) {
    if (!canManageInventory) return;
    setEditingId(p.id);
    setForm({
      name: p.name,
      category: p.category ?? '',
      sale_price: formatCurrencyInput(p.sale_price),
      cost_price: formatCurrencyInput(p.cost_price),
      current_stock: String(p.current_stock),
      low_stock_threshold: String(p.low_stock_threshold ?? 5),
      tracks_inventory: p.tracks_inventory !== false,
      is_active: p.is_active,
    });
    setError('');
    setModalOpen(true);
  }

  function set(field: keyof ProductForm, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    if (!canManageInventory) return;
    const existingProduct = editingId ? products.find((product) => product.id === editingId) : null;
    if (existingProduct && !existingProduct.is_active) {
      setError(t('inactiveEditBlocked'));
      return;
    }

    if (!selectedClubId || !form.name.trim()) {
      setError(tc('required'));
      return;
    }
    setSaving(true);
    setError('');

    const supabase = createClient();
    let err: string | null = null;
    if (editingId) {
      const payload = buildProductUpdatePayload(form, { isOwner });
      const { error: e } = await supabase
        .from('products')
        .update(payload)
        .eq('club_id', selectedClubId)
        .eq('id', editingId);
      err = e?.message ?? null;
    } else {
      const payload = buildProductInsertPayload(form, { isOwner });
      const maxSortOrder = products.reduce(
        (max, product, index) => Math.max(max, product.sort_order ?? index + 1),
        0,
      );
      const insertWithOrder = await supabase.from('products').insert({
        ...payload,
        club_id: selectedClubId,
        sort_order: maxSortOrder + 1,
      });
      if (isMissingSortOrder(insertWithOrder.error)) {
        const { error: e } = await supabase.from('products').insert({ ...payload, club_id: selectedClubId });
        err = e?.message ?? null;
      } else {
        err = insertWithOrder.error?.message ?? null;
      }
    }

    setSaving(false);
    if (err) {
      setError(err);
    } else {
      setModalOpen(false);
      await loadProducts();
    }
  }

  async function handleDelete() {
    if (!editingId || !isOwner || !selectedClubId) return;
    if (!window.confirm(t('deleteConfirm'))) return;

    setDeleting(true);
    setError('');

    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from('products')
      .delete()
      .eq('club_id', selectedClubId)
      .eq('id', editingId);

    if (deleteError) {
      if (!isForeignKeyDeleteError(deleteError)) {
        setDeleting(false);
        setError(deleteError.message);
        return;
      }

      const { error: softDeleteError } = await supabase
        .from('products')
        .update({
          is_deleted: true,
          is_active: false,
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('club_id', selectedClubId)
        .eq('id', editingId);

      setDeleting(false);

      if (softDeleteError) {
        setError(softDeleteError.message);
        return;
      }
    } else {
      setDeleting(false);
    }

    setModalOpen(false);
    await loadProducts();
  }

  async function moveProduct(productId: string, direction: -1 | 1) {
    if (!canManageInventory) return;
    const currentIndex = products.findIndex((product) => product.id === productId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= products.length) return;

    const reordered = [...products];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    setProducts(reordered);

    const supabase = createClient();
    const updates = reordered.map((product, index) =>
      supabase
        .from('products')
        .update({ sort_order: index + 1, updated_at: new Date().toISOString() })
        .eq('club_id', selectedClubId)
        .eq('id', product.id),
    );
    const results = await Promise.all(updates);
    const firstError = results.find((result) => result.error)?.error;

    if (firstError) {
      setError(isMissingSortOrder(firstError) ? t('sortOrderMigrationRequired') : firstError.message);
      await loadProducts();
    }
  }

  return (
    <div>
      <PageHeader
        title={t('title')}
        description={t('description')}
        action={canManageInventory ? (
          <button className="btn-primary flex items-center gap-2" onClick={openAdd}>
            <Plus size={16} />
            {t('addProduct')}
          </button>
        ) : undefined}
      />

      {loading ? (
        <TableSkeleton rows={8} columns={canManageInventory ? 8 : 6} />
      ) : products.length === 0 ? (
        <EmptyState
          icon={Package}
          title={tc('noData')}
          action={canManageInventory ? (
            <button className="btn-primary" onClick={openAdd}>
              {t('addProduct')}
            </button>
          ) : undefined}
        />
      ) : (
        <div className="space-y-3">
          {categoryOptions.length > 0 && (
            <div className="rounded-lg border border-gray-100 bg-white px-4 py-3 shadow-sm">
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

          <DataTable
            keyExtractor={(r) => r.id}
            data={filteredProducts}
            stickyHeader
            columns={[
              { key: 'name', header: t('name') },
              ...(canManageInventory ? [{
                key: 'sort_order',
                header: t('order'),
                render: (r: Product) => {
                  const index = products.findIndex((product) => product.id === r.id);
                  return (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={index <= 0}
                        aria-label={t('moveUp')}
                        title={t('moveUp')}
                        onClick={() => moveProduct(r.id, -1)}
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={index === -1 || index >= products.length - 1}
                        aria-label={t('moveDown')}
                        title={t('moveDown')}
                        onClick={() => moveProduct(r.id, 1)}
                      >
                        <ArrowDown size={15} />
                      </button>
                    </div>
                  );
                },
              }] : []),
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
                  if (r.tracks_inventory === false) {
                    return <Badge variant="default">{t('madeToOrder')}</Badge>;
                  }
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
              ...(canManageInventory ? [{
                key: 'actions',
                header: tc('actions'),
                render: (r: Product) => (
                  <button
                    className="text-sm text-primary-600 hover:underline disabled:cursor-not-allowed disabled:text-gray-400 disabled:no-underline"
                    disabled={!r.is_active}
                    title={!r.is_active ? t('inactiveEditBlocked') : tc('edit')}
                    onClick={() => openEdit(r)}
                  >
                    {tc('edit')}
                  </button>
                ),
              }] : []),
            ]}
          />
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-xl bg-white shadow-xl">
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">{t('salePrice')}</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="input-field"
                    value={form.sale_price}
                    onChange={(e) => set('sale_price', formatCurrencyInput(e.target.value))}
                  />
                </div>
                <div>
                  <label className="label flex items-center gap-1.5">
                    {t('costPrice')}
                    {!isOwner && <Lock size={12} className="text-gray-400" />}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="input-field disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                    value={form.cost_price}
                    disabled={!isOwner}
                    onChange={(e) => set('cost_price', formatCurrencyInput(e.target.value))}
                  />
                  {!isOwner && (
                    <p className="mt-1 text-xs text-gray-400">Updated automatically from stock purchases</p>
                  )}
                </div>
                <div>
                  <label className="label flex items-center gap-1.5">
                    {t('currentStock')}
                    {(!isOwner || editingId) && <Lock size={12} className="text-gray-400" />}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="input-field disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                    value={form.current_stock}
                    disabled={!isOwner || Boolean(editingId) || !form.tracks_inventory}
                    onChange={(e) => set('current_stock', e.target.value)}
                  />
                  {editingId ? (
                    <p className="mt-1 text-xs text-gray-400">{t('stockManagedByLedger')}</p>
                  ) : !form.tracks_inventory ? (
                    <p className="mt-1 text-xs text-purple-600">{t('madeToOrderStockHelp')}</p>
                  ) : !isOwner && (
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
                    disabled={!form.tracks_inventory}
                    onChange={(e) => set('low_stock_threshold', e.target.value)}
                  />
                </div>
              </div>
              <div className="rounded-lg border border-purple-100 bg-purple-50 p-3">
                <div className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    id="made_to_order"
                    checked={!form.tracks_inventory}
                    disabled={!isOwner || Boolean(editingId)}
                    onChange={(e) => set('tracks_inventory', !e.target.checked)}
                    className="mt-0.5 rounded"
                  />
                  <div>
                    <label htmlFor="made_to_order" className="text-sm font-bold text-purple-900">
                      {t('madeToOrder')}
                    </label>
                    <p className="mt-1 text-xs leading-5 text-purple-700">{t('madeToOrderHelp')}</p>
                    {editingId
                      ? <p className="mt-1 text-xs text-gray-500">{t('trackingModeLockedAfterCreation')}</p>
                      : !isOwner && <p className="mt-1 text-xs text-gray-500">{t('ownerOnlyTrackingMode')}</p>}
                  </div>
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
            <div className="flex flex-col gap-3 border-t border-gray-100 px-6 py-4 sm:flex-row sm:items-center">
              {editingId && isOwner && (
                <button
                  className="btn-danger flex min-h-10 items-center justify-center gap-2 sm:mr-auto"
                  onClick={handleDelete}
                  disabled={saving || deleting}
                >
                  <Trash2 size={16} />
                  {deleting ? tc('loading') : t('deleteProduct')}
                </button>
              )}
              <div className="flex w-full flex-col gap-3 sm:ml-auto sm:w-auto sm:flex-row">
                <button className="btn-secondary flex-1 sm:flex-none" onClick={() => setModalOpen(false)} disabled={deleting}>
                  {tc('cancel')}
                </button>
                <button className="btn-primary flex-1 sm:flex-none" onClick={handleSave} disabled={saving || deleting}>
                  {saving ? tc('saving') : tc('save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

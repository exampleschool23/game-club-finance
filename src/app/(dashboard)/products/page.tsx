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
import { formatCurrency, formatCurrencyInput, formatUnitCurrency } from '@/lib/formatters';
import { buildProductInsertPayload, buildProductUpdatePayload, type ProductWriteForm } from '@/lib/productWrites';
import { ArrowDown, ArrowUp, Check, ListOrdered, Lock, Package, Plus, Search, Trash2, X } from 'lucide-react';
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
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState('all');
  const [reordering, setReordering] = useState(false);
  const [moving, setMoving] = useState(false);

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
    if (reordering) return products;
    const query = search.trim().toLocaleLowerCase();
    return products.filter((product) => {
      if (selectedCategory && productCategory(product.category) !== selectedCategory) return false;
      if (query && !`${product.name} ${product.category ?? ''}`.toLocaleLowerCase().includes(query)) return false;
      if (stockFilter === 'inactive') return !product.is_active;
      if (stockFilter === 'all') return true;
      if (!product.is_active || product.tracks_inventory === false) return false;
      if (stockFilter === 'out') return product.current_stock <= 0;
      return product.current_stock > 0 && product.current_stock <= (product.low_stock_threshold ?? 5);
    });
  }, [products, selectedCategory, search, stockFilter, reordering]);
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
    const { data, error: deleteError } = await supabase
      .from('products')
      .update({
        is_deleted: true,
        is_active: false,
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('club_id', selectedClubId)
      .eq('id', editingId)
      .select('id')
      .single();

    setDeleting(false);
    if (deleteError || !data) {
      setError(deleteError?.message ?? tc('error'));
      return;
    }

    setModalOpen(false);
    await loadProducts();
  }

  async function moveProduct(productId: string, direction: -1 | 1) {
    if (!canManageInventory || !selectedClubId || moving) return;
    const currentIndex = products.findIndex((product) => product.id === productId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= products.length) return;

    const reordered = [...products];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    setMoving(true);
    setProducts(reordered);

    try {
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
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : tc('error'));
      await loadProducts();
    } finally {
      setMoving(false);
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
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-3 top-3 text-gray-400" />
                <input type="search" className="input-field pl-10" aria-label={t('search')}
                  placeholder={t('search')} value={search} disabled={reordering}
                  onChange={(event) => setSearch(event.target.value)} />
              </div>
              <select className="input-field sm:max-w-56" aria-label={t('category')}
                value={selectedCategory} disabled={reordering}
                onChange={(event) => setSelectedCategory(event.target.value)}>
                <option value="">{t('allCategories')}</option>
                {categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
              {canManageInventory && (
                <button type="button" className="btn-secondary flex items-center justify-center gap-2"
                  aria-pressed={reordering} disabled={moving} onClick={() => setReordering(!reordering)}>
                  {reordering ? <Check size={16} /> : <ListOrdered size={16} />}
                  {t(reordering ? 'finishReordering' : 'reorder')}
                </button>
              )}
            </div>
            {reordering ? (
              <p className="mt-3 text-sm text-gray-600" role="status">{t('reorderHelp')}</p>
            ) : (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {(['all', 'low', 'out', 'inactive'] as const).map((filter) => (
                  <button key={filter} type="button" aria-pressed={stockFilter === filter}
                    onClick={() => setStockFilter(filter)}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${stockFilter === filter
                      ? 'border-primary-600 bg-primary-600 text-white'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    {filter === 'all' ? tc('all') : filter === 'inactive' ? tc('inactive') : t(filter === 'low' ? 'lowStock' : 'outOfStock')}
                  </button>
                ))}
                <span className="text-sm text-gray-500 sm:ml-auto" role="status">
                  {t('resultCount', { count: filteredProducts.length, total: products.length })}
                </span>
              </div>
            )}
          </div>

          {filteredProducts.length === 0 ? (
            <EmptyState icon={Search} title={t('noResults')} action={(
              <button type="button" className="btn-secondary" onClick={() => {
                setSearch(''); setSelectedCategory(''); setStockFilter('all');
              }}>{t('clearFilters')}</button>
            )} />
          ) : <DataTable
            keyExtractor={(r) => r.id}
            data={filteredProducts}
            stickyHeader
            className="[&_table]:min-w-0"
            columns={[
              { key: 'name', header: t('name'), className: 'font-medium text-gray-900' },
              ...(canManageInventory && reordering ? [{
                key: 'sort_order',
                header: t('order'),
                render: (r: Product) => {
                  const index = products.findIndex((product) => product.id === r.id);
                  return (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={moving || index <= 0}
                        aria-label={t('moveUp')}
                        title={t('moveUp')}
                        onClick={() => moveProduct(r.id, -1)}
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={moving || index === -1 || index >= products.length - 1}
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
              ...(!selectedCategory || reordering ? [{ key: 'category', header: t('category'), className: 'hidden lg:table-cell', render: (r: Product) => r.category ?? '-' }] : []),
              {
                key: 'sale_price',
                header: `${t('salePrice')} (UZS)`,
                className: 'text-right tabular-nums whitespace-nowrap',
                render: (r) => formatCurrency(r.sale_price),
              },
              {
                key: 'cost_price',
                header: `${t('costPrice')} (UZS)`,
                className: 'hidden lg:table-cell text-right tabular-nums whitespace-nowrap',
                render: (r) => formatUnitCurrency(r.cost_price),
              },
              {
                key: 'current_stock',
                header: t('currentStock'),
                className: 'text-right tabular-nums whitespace-nowrap',
                render: (r) => {
                  if (r.tracks_inventory === false) {
                    return <Badge variant="default">{t('madeToOrder')}</Badge>;
                  }
                  const quantity = t('stockUnits', { count: formatUnitCurrency(r.current_stock) });
                  if (r.current_stock <= 0) return <Badge variant="danger">{t('outOfStock')} · {quantity}</Badge>;
                  if (r.current_stock <= (r.low_stock_threshold ?? 5)) return <Badge variant="warning">{t('lowStock')} · {quantity}</Badge>;
                  return <span>{quantity}</span>;
                },
              },
              {
                key: 'is_active',
                header: tc('active'),
                className: 'hidden sm:table-cell',
                render: (r) => (
                  <Badge variant="default" className={r.is_active ? 'bg-transparent text-gray-500' : ''}>
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
          />}
        </div>
      )}

      {error && !modalOpen && <p role="alert" className="mt-3 text-sm text-danger-500">{error}</p>}

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
                    <p className="mt-1 text-xs text-gray-400">{t('ownerOnlyCostPrice')}</p>
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

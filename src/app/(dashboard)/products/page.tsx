'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useClub } from '@/components/layout/DashboardShell';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  CurrencyInput,
  DataTable,
  EmptyState,
  Field,
  IconButton,
  InlineAlert,
  Input,
  Modal,
  PageHeader,
  SearchInput,
  SegmentedControl,
  Select,
  TableSkeleton,
  useConfirm,
  useToast,
} from '@/components/PresentationFoundation';
import { formatCurrency, formatCurrencyInput, formatUnitCurrency } from '@/lib/formatters';
import { buildProductInsertPayload, buildProductUpdatePayload, type ProductWriteForm } from '@/lib/productWrites';
import { ArrowDown, ArrowUp, Check, ListOrdered, Lock, Package, Plus, Search, Trash2 } from 'lucide-react';
import type { Product } from '@/types';

type ProductForm = ProductWriteForm;
type StockFilter = 'all' | 'low' | 'out' | 'inactive';

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
  const { showToast, toastElement } = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [reordering, setReordering] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const isOwner = currentRole === 'owner';
  const canManageInventory = currentRole === 'owner' || currentRole === 'admin';

  const loadProducts = useCallback(async ({ silent = false } = {}) => {
    const requestId = ++requestSequence.current;
    if (!silent) setLoading(true);
    if (!selectedClubId) {
      setProducts([]);
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const finish = (rows: Product[] | null, message = '') => {
      if (requestId !== requestSequence.current) return;
      if (rows) setProducts(rows);
      setLoadError(message);
      setLoading(false);
    };

    const ordered = await supabase
      .from('products')
      .select('*')
      .eq('club_id', selectedClubId)
      .eq('is_deleted', false)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (!ordered.error) return finish((ordered.data ?? []) as Product[]);

    if (isMissingSortOrder(ordered.error)) {
      const named = await supabase
        .from('products')
        .select('*')
        .eq('club_id', selectedClubId)
        .eq('is_deleted', false)
        .order('name', { ascending: true });

      if (!named.error) return finish((named.data ?? []) as Product[]);
    }

    const orderedWithoutDeletedFilter = await supabase
      .from('products')
      .select('*')
      .eq('club_id', selectedClubId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (!orderedWithoutDeletedFilter.error) return finish((orderedWithoutDeletedFilter.data ?? []) as Product[]);

    const fallback = await supabase
      .from('products')
      .select('*')
      .eq('club_id', selectedClubId)
      .order('name', { ascending: true });

    if (fallback.error) return finish([], fallback.error.message);
    finish((fallback.data ?? []) as Product[]);
  }, [selectedClubId]);

  useEffect(() => {
    loadProducts().catch((loadError) => {
      setProducts([]);
      setLoadError(loadError instanceof Error ? loadError.message : String(loadError));
      setLoading(false);
    });
    return () => { requestSequence.current += 1; };
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
    setFormError('');
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
    setFormError('');
    setModalOpen(true);
  }

  function set(field: keyof ProductForm, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave(event?: React.FormEvent) {
    event?.preventDefault();
    if (!canManageInventory) return;
    const existingProduct = editingId ? products.find((product) => product.id === editingId) : null;
    if (existingProduct && !existingProduct.is_active) {
      setFormError(t('inactiveEditBlocked'));
      return;
    }

    if (!selectedClubId || !form.name.trim()) {
      setFormError(tc('required'));
      return;
    }
    setSaving(true);
    setFormError('');

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
      setFormError(err);
    } else {
      setModalOpen(false);
      showToast(t('success'));
      await loadProducts({ silent: true });
    }
  }

  async function handleDelete() {
    if (!editingId || !isOwner || !selectedClubId) return;
    const confirmed = await confirm({ title: t('deleteProduct'), description: t('deleteConfirm'), confirmLabel: tc('delete') });
    if (!confirmed) return;

    setDeleting(true);
    setFormError('');

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
      setFormError(deleteError?.message ?? tc('error'));
      return;
    }

    setModalOpen(false);
    showToast(t('deleted'));
    await loadProducts({ silent: true });
  }

  async function moveProduct(productId: string, direction: -1 | 1) {
    if (!canManageInventory || !selectedClubId || movingId) return;
    const currentIndex = products.findIndex((product) => product.id === productId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= products.length) return;

    const reordered = [...products];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    setMovingId(productId);
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
        showToast(isMissingSortOrder(firstError) ? t('sortOrderMigrationRequired') : firstError.message, 'error');
        await loadProducts({ silent: true });
      }
    } catch (moveError) {
      showToast(moveError instanceof Error ? moveError.message : tc('error'), 'error');
      await loadProducts({ silent: true });
    } finally {
      setMovingId(null);
    }
  }

  const stockFilterOptions: Array<{ value: StockFilter; label: string }> = [
    { value: 'all', label: tc('all') },
    { value: 'low', label: t('lowStock') },
    { value: 'out', label: t('outOfStock') },
    { value: 'inactive', label: tc('inactive') },
  ];
  const editingInactive = Boolean(editingId && products.find((product) => product.id === editingId)?.is_active === false);

  return (
    <div>
      <PageHeader
        title={t('title')}
        description={t('description')}
        action={canManageInventory ? (
          <Button onClick={openAdd} icon={<Plus size={16} aria-hidden="true" />}>{t('addProduct')}</Button>
        ) : undefined}
      />

      {loadError && <InlineAlert variant="danger" className="mb-4">{loadError}</InlineAlert>}

      {loading ? (
        <TableSkeleton rows={8} columns={canManageInventory ? 7 : 5} />
      ) : products.length === 0 ? (
        <Card>
          <EmptyState
            icon={Package}
            title={tc('noData')}
            action={canManageInventory ? (
              <Button onClick={openAdd} icon={<Plus size={16} aria-hidden="true" />}>{t('addProduct')}</Button>
            ) : undefined}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          <Card>
            <div className="flex flex-col gap-3 sm:flex-row">
              <SearchInput
                className="flex-1"
                value={search}
                onChange={setSearch}
                placeholder={t('search')}
                clearLabel={t('clearFilters')}
                disabled={reordering}
              />
              <Select
                aria-label={t('category')}
                className="sm:max-w-56"
                value={selectedCategory}
                disabled={reordering}
                onChange={(event) => setSelectedCategory(event.target.value)}
              >
                <option value="">{t('allCategories')}</option>
                {categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
              </Select>
              {canManageInventory && (
                <Button
                  variant={reordering ? 'primary' : 'outline'}
                  aria-pressed={reordering}
                  disabled={Boolean(movingId)}
                  onClick={() => setReordering(!reordering)}
                  icon={reordering ? <Check size={16} aria-hidden="true" /> : <ListOrdered size={16} aria-hidden="true" />}
                >
                  {t(reordering ? 'finishReordering' : 'reorder')}
                </Button>
              )}
            </div>
            {reordering ? (
              <InlineAlert variant="info" className="mt-3">{t('reorderHelp')}</InlineAlert>
            ) : (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <SegmentedControl variant="chips" label={t('currentStock')} options={stockFilterOptions} value={stockFilter} onChange={setStockFilter} />
                <span className="text-sm text-gray-500 sm:ml-auto" role="status">
                  {t('resultCount', { count: filteredProducts.length, total: products.length })}
                </span>
              </div>
            )}
          </Card>

          {filteredProducts.length === 0 ? (
            <Card>
              <EmptyState
                icon={Search}
                title={t('noResults')}
                action={(
                  <Button variant="outline" onClick={() => { setSearch(''); setSelectedCategory(''); setStockFilter('all'); }}>
                    {t('clearFilters')}
                  </Button>
                )}
              />
            </Card>
          ) : (
            <DataTable
              keyExtractor={(r) => r.id}
              data={filteredProducts}
              stickyHeader
              minWidth={reordering ? 720 : 560}
              columns={[
                { key: 'name', header: t('name'), cellClassName: 'font-medium text-gray-900' },
                ...(canManageInventory && reordering ? [{
                  key: 'sort_order',
                  header: t('order'),
                  render: (r: Product) => {
                    const index = products.findIndex((product) => product.id === r.id);
                    return (
                      <div className="flex items-center gap-1">
                        <IconButton
                          size="sm"
                          label={t('moveUp')}
                          icon={<ArrowUp size={15} />}
                          disabled={Boolean(movingId) || index <= 0}
                          loading={movingId === r.id}
                          onClick={() => moveProduct(r.id, -1)}
                        />
                        <IconButton
                          size="sm"
                          label={t('moveDown')}
                          icon={<ArrowDown size={15} />}
                          disabled={Boolean(movingId) || index === -1 || index >= products.length - 1}
                          onClick={() => moveProduct(r.id, 1)}
                        />
                      </div>
                    );
                  },
                }] : []),
                ...(!selectedCategory || reordering ? [{ key: 'category', header: t('category'), className: 'hidden lg:table-cell', render: (r: Product) => r.category || '—' }] : []),
                {
                  key: 'sale_price',
                  header: `${t('salePrice')} (${tc('currency')})`,
                  align: 'right',
                  className: 'whitespace-nowrap',
                  render: (r) => formatCurrency(r.sale_price),
                },
                {
                  key: 'cost_price',
                  header: `${t('costPrice')} (${tc('currency')})`,
                  align: 'right',
                  className: 'hidden whitespace-nowrap lg:table-cell',
                  render: (r) => formatUnitCurrency(r.cost_price),
                },
                {
                  key: 'current_stock',
                  header: t('currentStock'),
                  align: 'right',
                  className: 'whitespace-nowrap',
                  render: (r) => {
                    if (r.tracks_inventory === false) return <Badge variant="purple">{t('madeToOrder')}</Badge>;
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
                    <Badge variant={r.is_active ? 'success' : 'neutral'}>{r.is_active ? tc('active') : tc('inactive')}</Badge>
                  ),
                },
                ...(canManageInventory ? [{
                  key: 'actions',
                  header: tc('actions'),
                  align: 'right' as const,
                  render: (r: Product) => (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-primary-700"
                      disabled={!r.is_active}
                      title={!r.is_active ? t('inactiveEditBlocked') : undefined}
                      onClick={() => openEdit(r)}
                    >
                      {tc('edit')}
                    </Button>
                  ),
                }] : []),
              ]}
            />
          )}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? t('editProduct') : t('addProduct')}
        locked={saving || deleting}
        footer={(
          <>
            {editingId && isOwner && (
              <Button variant="dangerOutline" onClick={handleDelete} loading={deleting} loadingLabel={tc('loading')} disabled={saving} className="sm:mr-auto" icon={<Trash2 size={16} aria-hidden="true" />}>
                {t('deleteProduct')}
              </Button>
            )}
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving || deleting}>{tc('cancel')}</Button>
            <Button type="submit" form="product-form" loading={saving} loadingLabel={tc('saving')} disabled={deleting || editingInactive}>{tc('save')}</Button>
          </>
        )}
      >
        <form id="product-form" onSubmit={handleSave} className="space-y-4">
          {editingInactive && <InlineAlert variant="warning">{t('inactiveEditBlocked')}</InlineAlert>}
          <Field label={t('name')} htmlFor="product-name" required>
            <Input id="product-name" type="text" required maxLength={120} value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label={t('category')} htmlFor="product-category">
            <Input id="product-category" type="text" maxLength={80} list="product-category-options" value={form.category} onChange={(e) => set('category', e.target.value)} />
            <datalist id="product-category-options">
              {categoryOptions.map((category) => <option key={category} value={category} />)}
            </datalist>
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t('salePrice')} htmlFor="product-sale-price">
              <CurrencyInput id="product-sale-price" value={form.sale_price} onValueChange={(value) => set('sale_price', value)} trailingAddon={tc('currency')} />
            </Field>
            <Field
              label={t('costPrice')}
              htmlFor="product-cost-price"
              labelAddon={!isOwner ? <Lock size={12} className="text-gray-400" aria-hidden="true" /> : undefined}
              hint={!isOwner ? t('ownerOnlyCostPrice') : undefined}
            >
              <CurrencyInput id="product-cost-price" value={form.cost_price} disabled={!isOwner} onValueChange={(value) => set('cost_price', value)} trailingAddon={tc('currency')} />
            </Field>
            <Field
              label={t('currentStock')}
              htmlFor="product-current-stock"
              labelAddon={(!isOwner || editingId) ? <Lock size={12} className="text-gray-400" aria-hidden="true" /> : undefined}
              hint={editingId ? t('stockManagedByLedger') : !form.tracks_inventory ? t('madeToOrderStockHelp') : !isOwner ? t('ownerOnlyStock') : undefined}
            >
              <Input
                id="product-current-stock"
                type="text"
                inputMode="numeric"
                value={form.current_stock}
                disabled={!isOwner || Boolean(editingId) || !form.tracks_inventory}
                onChange={(e) => set('current_stock', e.target.value.replace(/\D/g, ''))}
              />
            </Field>
            <Field label={t('lowStockThreshold')} htmlFor="product-low-stock">
              <Input
                id="product-low-stock"
                type="text"
                inputMode="numeric"
                value={form.low_stock_threshold}
                disabled={!form.tracks_inventory}
                onChange={(e) => set('low_stock_threshold', e.target.value.replace(/\D/g, ''))}
              />
            </Field>
          </div>
          <Card tone="muted" padding="sm" className="border-purple-100 bg-purple-50">
            <Checkbox
              id="made_to_order"
              checked={!form.tracks_inventory}
              disabled={!isOwner || Boolean(editingId)}
              onChange={(e) => set('tracks_inventory', !e.target.checked)}
              label={<span className="text-purple-900">{t('madeToOrder')}</span>}
              description={(
                <>
                  <span className="text-purple-700">{t('madeToOrderHelp')}</span>
                  {editingId
                    ? <span className="mt-1 block">{t('trackingModeLockedAfterCreation')}</span>
                    : !isOwner && <span className="mt-1 block">{t('ownerOnlyTrackingMode')}</span>}
                </>
              )}
            />
          </Card>
          <Checkbox id="is_active" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} label={tc('active')} />

          {formError && <InlineAlert variant="danger">{formError}</InlineAlert>}
        </form>
      </Modal>

      {toastElement}
      {confirmDialog}
    </div>
  );
}

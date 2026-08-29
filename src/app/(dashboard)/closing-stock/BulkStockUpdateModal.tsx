'use client';

import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Minus, Plus, Search, ShoppingCart, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { formatCurrency } from '@/lib/formatters';
import {
  calculateBulkStockOrderSummary,
  getBulkStockAvailableQuantity,
  type BulkStockOrderItem,
  type BulkStockOrderSummary,
  type ClosingStockRowData,
} from '@/lib/closingStock';

interface BulkStockUpdateModalProps {
  open: boolean;
  rows: ClosingStockRowData[];
  saving: boolean;
  onClose: () => void;
  onSave: (items: BulkStockOrderItem[], summary: BulkStockOrderSummary) => Promise<boolean>;
}

function isWholeNumberInput(value: string): boolean {
  return value === '' || /^\d+$/.test(value);
}

function preventNonIntegerNumberInput(event: KeyboardEvent<HTMLInputElement>) {
  if (['.', ',', 'e', 'E', '+', '-'].includes(event.key)) {
    event.preventDefault();
  }
}

export function BulkStockUpdateModal({
  open,
  rows,
  saving,
  onClose,
  onSave,
}: BulkStockUpdateModalProps) {
  const t = useTranslations('closingStock');
  const tc = useTranslations('common');
  const [query, setQuery] = useState('');
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setQuantities({});
    setError('');
  }, [open]);

  const items = useMemo<BulkStockOrderItem[]>(() => rows.flatMap((row) => {
    const quantity = Number(quantities[row.product.id] ?? 0);
    return Number.isInteger(quantity) && quantity > 0
      ? [{ productId: row.product.id, quantity }]
      : [];
  }), [quantities, rows]);

  const summary = useMemo(
    () => calculateBulkStockOrderSummary(rows, items),
    [items, rows],
  );

  const invalidItem = useMemo(() => items.find((item) => {
    const row = rows.find((candidate) => candidate.product.id === item.productId);
    if (!row) return false;
    const available = getBulkStockAvailableQuantity(row);
    return available !== null && item.quantity > available;
  }), [items, rows]);

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows
      .filter((row) => {
        if (!needle) return true;
        return row.product.name.toLowerCase().includes(needle)
          || String(row.product.category ?? '').toLowerCase().includes(needle);
      })
      .sort((a, b) => {
        const aSelected = Number(quantities[a.product.id] ?? 0) > 0;
        const bSelected = Number(quantities[b.product.id] ?? 0) > 0;
        if (aSelected !== bSelected) return aSelected ? -1 : 1;
        return (a.product.sort_order ?? Number.MAX_SAFE_INTEGER)
          - (b.product.sort_order ?? Number.MAX_SAFE_INTEGER)
          || a.product.name.localeCompare(b.product.name);
      });
  }, [quantities, query, rows]);

  function updateQuantity(row: ClosingStockRowData, value: string) {
    if (!isWholeNumberInput(value)) return;
    const available = getBulkStockAvailableQuantity(row);
    const boundedValue = value === '' || available === null
      ? value
      : String(Math.min(Number(value), available));
    setError('');
    setQuantities((current) => ({ ...current, [row.product.id]: boundedValue }));
  }

  function adjustQuantity(row: ClosingStockRowData, amount: number) {
    const currentQuantity = Number(quantities[row.product.id] ?? 0);
    const nextQuantity = Math.max(0, currentQuantity + amount);
    const available = getBulkStockAvailableQuantity(row);
    if (available !== null && nextQuantity > available) {
      setError(t('bulkInsufficientStock', {
        product: row.product.name,
        available,
      }));
      return;
    }
    updateQuantity(row, nextQuantity === 0 ? '' : String(nextQuantity));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (summary.totalQuantity === 0) {
      setError(t('bulkEmpty'));
      return;
    }

    if (invalidItem) {
      const row = rows.find((candidate) => candidate.product.id === invalidItem.productId);
      if (row) {
        setError(t('bulkInsufficientStock', {
          product: row.product.name,
          available: getBulkStockAvailableQuantity(row) ?? 0,
        }));
      }
      return;
    }

    setError('');
    const didSave = await onSave(items, summary);
    if (didSave) onClose();
  }

  return (
    <Modal
      open={open}
      onClose={() => { if (!saving) onClose(); }}
      title={t('bulkTitle')}
      className="sm:max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-xl border border-primary-100 bg-primary-50/60 p-4">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white text-primary-600 shadow-sm">
              <ShoppingCart size={20} />
            </div>
            <div>
              <p className="font-semibold text-gray-900">{t('bulkDescriptionTitle')}</p>
              <p className="mt-1 text-sm leading-5 text-gray-600">{t('bulkDescription')}</p>
            </div>
          </div>
        </div>

        <div className="relative">
          <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            className="input-field h-11 pl-9"
            placeholder={t('bulkSearchPlaceholder')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className="max-h-[46dvh] space-y-2 overflow-y-auto pr-1 sm:max-h-[50vh]">
          {visibleRows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
              {tc('noData')}
            </p>
          ) : visibleRows.map((row) => {
            const quantity = Number(quantities[row.product.id] ?? 0);
            const available = getBulkStockAvailableQuantity(row);
            const hasStockError = available !== null && quantity > available;
            const isOutOfStock = available === 0;

            return (
              <div
                key={row.product.id}
                className={`rounded-xl border p-3 transition ${
                  quantity > 0 ? 'border-primary-200 bg-primary-50/30' : 'border-gray-100 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-gray-900">{row.product.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                      <span className="font-semibold text-gray-700">
                        {formatCurrency(row.product.sale_price)} {tc('currency')}
                      </span>
                      {available === null ? (
                        <span className="rounded-full bg-purple-50 px-2 py-0.5 font-semibold text-purple-700">
                          {t('bulkMadeToOrder')}
                        </span>
                      ) : (
                        <span className={isOutOfStock ? 'font-semibold text-danger-600' : ''}>
                          {t('bulkAvailable', { count: available })}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={t('bulkDecrease', { product: row.product.name })}
                      disabled={quantity <= 0 || saving}
                      onClick={() => adjustQuantity(row, -1)}
                    >
                      <Minus size={16} strokeWidth={2.5} />
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      min={0}
                      max={available ?? undefined}
                      className={`h-9 w-14 rounded-lg border px-1 text-center text-sm font-bold outline-none focus:ring-2 ${
                        hasStockError
                          ? 'border-danger-400 text-danger-600 focus:ring-danger-200'
                          : 'border-gray-200 text-gray-900 focus:border-primary-500 focus:ring-primary-100'
                      }`}
                      aria-label={t('bulkQuantityFor', { product: row.product.name })}
                      value={quantities[row.product.id] ?? ''}
                      disabled={isOutOfStock || saving}
                      onKeyDown={preventNonIntegerNumberInput}
                      onWheel={(event) => event.currentTarget.blur()}
                      onChange={(event) => updateQuantity(row, event.target.value)}
                    />
                    <button
                      type="button"
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={t('bulkIncrease', { product: row.product.name })}
                      disabled={saving || isOutOfStock || (available !== null && quantity >= available)}
                      onClick={() => adjustQuantity(row, 1)}
                    >
                      <Plus size={16} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>

                {quantity > 0 && (
                  <div className="mt-2 flex items-center justify-between border-t border-primary-100 pt-2 text-xs">
                    <span className={hasStockError ? 'font-semibold text-danger-600' : 'text-gray-500'}>
                      {hasStockError
                        ? t('bulkInsufficientStock', { product: row.product.name, available: available ?? 0 })
                        : t('bulkLine', { quantity })}
                    </span>
                    <span className="font-bold text-primary-700">
                      {formatCurrency(quantity * row.product.sale_price)} {tc('currency')}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {error && (
          <p className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm font-medium text-danger-600">{error}</p>
        )}

        <div className="sticky bottom-0 -mx-4 -mb-5 border-t border-gray-100 bg-white px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:-mx-6 sm:px-6">
          <div className="mb-3 grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-3">
            <div>
              <p className="text-xs font-medium text-gray-500">{t('bulkTotalItems')}</p>
              <p className="mt-1 text-lg font-bold tabular-nums text-gray-900">
                {summary.totalQuantity} {t('pcs')}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium text-gray-500">{t('bulkOrderTotal')}</p>
              <p className="mt-1 text-lg font-bold tabular-nums text-primary-700">
                {formatCurrency(summary.totalPrice)} {tc('currency')}
              </p>
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="btn-secondary min-h-11 bg-white sm:min-w-28"
              disabled={saving || summary.totalQuantity === 0}
              onClick={() => {
                setQuantities({});
                setError('');
              }}
            >
              <Trash2 size={16} />
              {t('bulkClear')}
            </button>
            <button
              type="submit"
              className="btn-primary min-h-11 sm:min-w-56"
              disabled={saving || summary.totalQuantity === 0 || Boolean(invalidItem)}
            >
              <ShoppingCart size={17} />
              {saving ? tc('saving') : t('bulkSave')}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

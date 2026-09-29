'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { ShoppingCart, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  EmptyState,
  InlineAlert,
  Modal,
  Money,
  SearchInput,
  StatTile,
  Stepper,
} from '@/components/PresentationFoundation';
import { formatCurrency } from '@/lib/formatters';
import {
  calculateBulkStockOrderSummary,
  getBulkStockAvailableQuantity,
  isWholeNumberInput,
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

export function BulkStockUpdateModal({ open, rows, saving, onClose, onSave }: BulkStockUpdateModalProps) {
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

  const summary = useMemo(() => calculateBulkStockOrderSummary(rows, items), [items, rows]);

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
      onClose={onClose}
      locked={saving}
      title={t('bulkTitle')}
      size="xl"
      bodyClassName="pb-2"
      footer={(
        <div className="flex w-full flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-3">
            <StatTile variant="flat" size="sm" label={t('bulkTotalItems')} value={summary.totalQuantity} unit={t('pcs')} />
            <StatTile variant="flat" size="sm" align="center" className="text-right" label={t('bulkOrderTotal')} value={formatCurrency(summary.totalPrice)} unit={tc('currency')} tone="primary" />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              disabled={saving || summary.totalQuantity === 0}
              onClick={() => { setQuantities({}); setError(''); }}
              icon={<Trash2 size={16} aria-hidden="true" />}
            >
              {t('bulkClear')}
            </Button>
            <Button
              type="submit"
              form="bulk-stock-form"
              className="sm:min-w-56"
              loading={saving}
              loadingLabel={tc('saving')}
              disabled={summary.totalQuantity === 0 || Boolean(invalidItem)}
              icon={<ShoppingCart size={17} aria-hidden="true" />}
            >
              {t('bulkSave')}
            </Button>
          </div>
        </div>
      )}
    >
      <form id="bulk-stock-form" onSubmit={handleSubmit} className="space-y-4">
        <InlineAlert variant="info" title={t('bulkDescriptionTitle')}>{t('bulkDescription')}</InlineAlert>

        <SearchInput value={query} onChange={setQuery} placeholder={t('bulkSearchPlaceholder')} clearLabel={tc('cancel')} />

        <div className="max-h-[42dvh] space-y-2 overflow-y-auto pr-1 sm:max-h-[46vh]">
          {visibleRows.length === 0 ? (
            <EmptyState compact bordered title={tc('noData')} />
          ) : visibleRows.map((row) => {
            const quantity = Number(quantities[row.product.id] ?? 0);
            const available = getBulkStockAvailableQuantity(row);
            const hasStockError = available !== null && quantity > available;
            const isOutOfStock = available === 0;

            return (
              <div
                key={row.product.id}
                className={`rounded-xl border p-3 transition ${quantity > 0 ? 'border-primary-200 bg-primary-50/30' : 'border-gray-100 bg-white'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-gray-900">{row.product.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                      <span className="font-semibold text-gray-700"><Money amount={row.product.sale_price} /></span>
                      {available === null ? (
                        <Badge variant="purple" size="sm">{t('bulkMadeToOrder')}</Badge>
                      ) : (
                        <span className={isOutOfStock ? 'font-semibold text-danger-600' : ''}>
                          {t('bulkAvailable', { count: available })}
                        </span>
                      )}
                    </div>
                  </div>

                  <Stepper
                    size="sm"
                    label={t('bulkQuantityFor', { product: row.product.name })}
                    decreaseLabel={t('bulkDecrease', { product: row.product.name })}
                    increaseLabel={t('bulkIncrease', { product: row.product.name })}
                    value={quantities[row.product.id] ?? ''}
                    max={available}
                    disabled={saving || isOutOfStock}
                    invalid={hasStockError}
                    onChange={(value) => updateQuantity(row, value)}
                    onStep={(delta) => adjustQuantity(row, delta)}
                  />
                </div>

                {quantity > 0 && (
                  <div className="mt-2 flex items-center justify-between border-t border-primary-100 pt-2 text-xs">
                    <span className={hasStockError ? 'font-semibold text-danger-600' : 'text-gray-500'}>
                      {hasStockError
                        ? t('bulkInsufficientStock', { product: row.product.name, available: available ?? 0 })
                        : t('bulkLine', { quantity })}
                    </span>
                    <span className="font-bold text-primary-700"><Money amount={quantity * row.product.sale_price} /></span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {error && <InlineAlert variant="danger">{error}</InlineAlert>}
      </form>
    </Modal>
  );
}

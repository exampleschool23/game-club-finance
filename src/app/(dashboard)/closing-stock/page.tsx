'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { formatCurrency, todayIso } from '@/lib/utils';
import { calculateStockCountSummary } from '@/lib/calculations/stock';
import type { Product } from '@/types';

interface RowData {
  product: Product;
  previousStock: string;
  addedToday: string;
  closingStock: string;
}

export default function ClosingStockPage() {
  const t = useTranslations('closingStock');
  const tc = useTranslations('common');
  const [date, setDate] = useState(todayIso());
  const [rows, setRows] = useState<RowData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const loadData = useCallback(async (selectedDate: string) => {
    setLoading(true);
    const supabase = createClient();

    const [productsRes, countsRes] = await Promise.all([
      supabase.from('products').select('*').eq('is_active', true).order('name'),
      supabase.from('daily_stock_counts').select('*').eq('date', selectedDate),
    ]);

    const products = productsRes.data ?? [];
    const counts = countsRes.data ?? [];

    const newRows: RowData[] = products.map((p) => {
      const existing = counts.find((c) => c.product_id === p.id);
      return {
        product: p,
        previousStock: existing
          ? String(existing.previous_stock)
          : String(p.current_stock),
        addedToday: existing ? String(existing.added_today) : '0',
        closingStock: existing ? String(existing.closing_stock) : '',
      };
    });

    setRows(newRows);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData(date).catch(() => {});
  }, [date, loadData]);

  function updateRow(index: number, field: 'previousStock' | 'addedToday' | 'closingStock', value: string) {
    setRows((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  }

  function parseNum(v: string): number {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    setSuccess('');
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    const upserts = rows
      .filter((r) => r.closingStock !== '')
      .map((r) => {
        const prev = parseNum(r.previousStock);
        const added = parseNum(r.addedToday);
        const closing = parseNum(r.closingStock);
        const { soldQuantity, barIncome, barCost, barProfit } = calculateStockCountSummary({
          previousStock: prev,
          addedToday: added,
          closingStock: closing,
          salePrice: r.product.sale_price,
          costPrice: r.product.cost_price,
        });

        return {
          date,
          product_id: r.product.id,
          previous_stock: prev,
          added_today: added,
          closing_stock: closing,
          sold_quantity: soldQuantity,
          sale_price: r.product.sale_price,
          cost_price: r.product.cost_price,
          bar_income: barIncome,
          bar_cost: barCost,
          bar_profit: barProfit,
          created_by: session?.user?.id ?? null,
          updated_at: new Date().toISOString(),
        };
      });

    const { error: err } = await supabase
      .from('daily_stock_counts')
      .upsert(upserts, { onConflict: 'date,product_id' });

    setSaving(false);
    if (err) {
      setError(err.message);
    } else {
      setSuccess(t('success'));
      await loadData(date);
    }
  }

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />

      <div className="mb-4 flex items-center gap-3">
        <label className="label mb-0">{t('date')}</label>
        <input
          type="date"
          className="input-field w-auto"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setSuccess('');
            setError('');
          }}
        />
      </div>

      {loading ? (
        <p className="text-gray-500">{tc('loading')}</p>
      ) : rows.length === 0 ? (
        <p className="text-gray-500">{tc('noData')}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{t('product')}</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">{t('previousStock')}</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">{t('addedToday')}</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">{t('closingStock')}</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">{t('soldQty')}</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">{t('barIncome')}</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">{t('barProfit')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((row, i) => {
                const prev = parseNum(row.previousStock);
                const added = parseNum(row.addedToday);
                const closing = parseNum(row.closingStock);
                const summary =
                  row.closingStock !== ''
                    ? calculateStockCountSummary({
                        previousStock: prev,
                        addedToday: added,
                        closingStock: closing,
                        salePrice: row.product.sale_price,
                        costPrice: row.product.cost_price,
                      })
                    : null;

                return (
                  <tr key={row.product.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-800">{row.product.name}</td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="input-field text-right w-24"
                        value={row.previousStock}
                        onChange={(e) => updateRow(i, 'previousStock', e.target.value)}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="input-field text-right w-24"
                        value={row.addedToday}
                        onChange={(e) => updateRow(i, 'addedToday', e.target.value)}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="input-field text-right w-24"
                        placeholder="0"
                        value={row.closingStock}
                        onChange={(e) => updateRow(i, 'closingStock', e.target.value)}
                      />
                    </td>
                    <td className="px-4 py-2 text-right text-gray-700">
                      {summary ? summary.soldQuantity : '-'}
                    </td>
                    <td className="px-4 py-2 text-right text-success-600 font-medium">
                      {summary ? formatCurrency(summary.barIncome) : '-'}
                    </td>
                    <td className="px-4 py-2 text-right font-medium">
                      {summary ? (
                        <span className={summary.barProfit >= 0 ? 'text-success-600' : 'text-danger-500'}>
                          {formatCurrency(summary.barProfit)}
                        </span>
                      ) : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-danger-500">{error}</p>}
      {success && <p className="mt-3 text-sm text-success-600">{success}</p>}

      {!loading && rows.length > 0 && (
        <button
          className="btn-primary mt-4"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? tc('saving') : t('submit')}
        </button>
      )}
    </div>
  );
}

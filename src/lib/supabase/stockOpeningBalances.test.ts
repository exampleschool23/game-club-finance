import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { fetchStockOpeningBalances, fetchStockPurchasesForDate } from './stockOpeningBalances';

const missing = { code: 'PGRST202', message: 'Function not found' };
function client(rpcData: unknown[], rpcError: unknown = null, history: Record<string, unknown[]> = {}) {
  const requests: Array<{ table: string; club?: string; before?: string; date?: string; range?: number[] }> = [];
  const query = (table: string, data: unknown[], error: unknown = null) => {
    const request: typeof requests[number] = { table };
    requests.push(request);
    const q = {
      select: () => q,
      eq: (key: string, value: string) => { if (key === 'club_id') request.club = value; else request.date = value; return q; },
      lt: (_key: string, value: string) => { request.before = value; return q; },
      order: () => q,
      range: (from: number, to: number) => {
        request.range = [from, to];
        return Promise.resolve({ data: data.slice(from, to + 1), error });
      },
    };
    return q;
  };
  const rpc = vi.fn(() => query('rpc', rpcData, rpcError));
  const from = vi.fn((table: string) => query(table, history[table] ?? []));
  return { supabase: { rpc, from } as unknown as SupabaseClient, rpc, from, requests };
}

describe('stock opening reads', () => {
  it('requests and paginates the club-scoped opening RPC', async () => {
    const rows = Array.from({ length: 1001 }, (_, id) => ({ product_id: String(id), previous_stock: '9' }));
    const { supabase, rpc, from } = client(rows);
    const result = await fetchStockOpeningBalances(supabase, '2026-09-15', 'club-1', true);
    expect(rpc).toHaveBeenCalledWith('get_stock_opening_balances', { p_club_id: 'club-1', p_before_date: '2026-09-15' });
    expect(Object.keys(result.data ?? {})).toHaveLength(1001);
    expect(result.data?.['1000']).toBe(9);
    expect(from).not.toHaveBeenCalled();
  });

  it('falls back to complete dated histories and includes purchases beyond 1,000 rows', async () => {
    const old = Array.from({ length: 1000 }, () => ({ product_id: 'fanta', date: '2026-09-10', closing_stock: 1 }));
    const receipts = Array.from({ length: 1000 }, () => ({ product_id: 'fanta', date: '2026-09-10', quantity: 1 }));
    const { supabase, requests } = client([], missing, {
      daily_stock_counts: [...old, { product_id: 'fanta', date: '2026-09-12', closing_stock: 3 }],
      stock_purchases: [...receipts, { product_id: 'fanta', date: '2026-09-14', quantity: 6 }],
    });
    expect(await fetchStockOpeningBalances(supabase, '2026-09-15', 'club-1', true))
      .toEqual({ data: { fanta: 9 }, error: null });
    const reads = requests.filter((r) => r.table !== 'rpc');
    expect(reads).toHaveLength(4);
    expect(reads.every((r) => r.club === 'club-1' && r.before === '2026-09-15')).toBe(true);
    expect(reads.filter((r) => r.range?.[0] === 1000)).toHaveLength(2);
  });

  it('surfaces authorization errors without attempting a fallback', async () => {
    const error = { code: '42501', message: 'Not authorized' };
    const { supabase, from } = client([], error);
    expect(await fetchStockOpeningBalances(supabase, '2026-09-15', 'club-1', true))
      .toEqual({ data: null, error });
    expect(from).not.toHaveBeenCalled();
  });

  it('paginates same-day purchases without mixing them with opening receipts', async () => {
    const { supabase, requests } = client([], null, { stock_purchases: Array.from({ length: 1001 }, () => ({ quantity: 1 })) });
    const result = await fetchStockPurchasesForDate(supabase, '2026-09-15', 'club-1');
    expect(result.data).toHaveLength(1001);
    expect(requests.every((r) => r.club === 'club-1' && r.date === '2026-09-15')).toBe(true);
  });
});

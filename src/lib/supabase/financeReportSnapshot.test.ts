import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { fetchFinanceReportSnapshot } from './financeReportSnapshot';

describe('fetchFinanceReportSnapshot', () => {
  it('requests the selected sections and normalizes missing arrays', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { cashRows: [{ id: 'cash-1' }] },
      error: null,
    });
    const supabase = { rpc } as unknown as SupabaseClient;

    const result = await fetchFinanceReportSnapshot(
      supabase,
      'club-1',
      '2026-09-01',
      '2026-09-30',
      ['cash', 'expenses'],
    );

    expect(rpc).toHaveBeenCalledWith('get_finance_report_snapshot', {
      p_club_id: 'club-1',
      p_range_from: '2026-09-01',
      p_range_to: '2026-09-30',
      p_sections: ['cash', 'expenses'],
    });
    expect(result.fallbackRequired).toBe(false);
    expect(result.error).toBeNull();
    expect(result.data?.cashRows).toEqual([{ id: 'cash-1' }]);
    expect(result.data?.expenseRows).toEqual([]);
  });

  it('requests the compatibility path only when the RPC is missing', async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST202', message: 'Function was not found' },
      }),
    } as unknown as SupabaseClient;

    const result = await fetchFinanceReportSnapshot(
      supabase,
      'club-1',
      '2026-09-01',
      '2026-09-01',
      ['cash'],
    );

    expect(result).toEqual({ data: null, error: null, fallbackRequired: true });
  });

  it('surfaces database errors without running a fallback', async () => {
    const databaseError = { code: '42501', message: 'Not authorized' };
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: databaseError }),
    } as unknown as SupabaseClient;

    const result = await fetchFinanceReportSnapshot(
      supabase,
      'club-1',
      '2026-09-01',
      '2026-09-01',
      ['cash'],
    );

    expect(result.data).toBeNull();
    expect(result.error).toBe(databaseError);
    expect(result.fallbackRequired).toBe(false);
  });
});

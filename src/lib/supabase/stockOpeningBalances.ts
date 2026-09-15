import { calculateStockOpeningBalances, type DatedStockClosing, type DatedStockPurchase } from '../calculations/stock';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingDatabaseFunction } from './errors';
import { fetchAllRows } from './pagination';
import {
  markPerformanceRpcAvailable,
  markPerformanceRpcMissing,
  shouldTryPerformanceRpc,
} from './performanceRpc';

export function fetchStockPurchasesForDate(supabase: SupabaseClient, date: string, clubId: string) {
  return fetchAllRows<DatedStockPurchase>(() => supabase.from('stock_purchases')
    .select('product_id,date,quantity,cost_price').eq('club_id', clubId).eq('date', date).order('id'));
}

export async function fetchStockOpeningBalances(
  supabase: SupabaseClient,
  selectedDate: string,
  clubId: string,
  isCurrentDate: boolean,
) {
  if (shouldTryPerformanceRpc()) {
    const result = await fetchAllRows<{ product_id: string; previous_stock: number }>(() =>
      supabase.rpc('get_stock_opening_balances', {
        p_club_id: clubId,
        p_before_date: selectedDate,
      }).order('product_id'),
    );
    if (!result.error) {
      markPerformanceRpcAvailable();
      return {
        data: Object.fromEntries((result.data ?? []).map((row) => [row.product_id, Number(row.previous_stock)])),
        error: null,
      };
    }
    if (!isMissingDatabaseFunction(result.error, 'get_stock_opening_balances')) {
      return { data: null, error: result.error };
    }
    markPerformanceRpcMissing();
  }

  // Compatibility while migration 057 is being deployed. Fetch complete,
  // club-scoped histories: a limit of 1,000 can drop the last closing or receipt.
  const [counts, purchases] = await Promise.all([
    fetchAllRows<DatedStockClosing>(() => supabase.from('daily_stock_counts')
      .select('product_id,date,closing_stock').eq('club_id', clubId)
      .lt('date', selectedDate).order('date', { ascending: false }).order('id')),
    fetchAllRows<DatedStockPurchase>(() => supabase.from('stock_purchases')
      .select('product_id,date,quantity,cost_price').eq('club_id', clubId)
      .lt('date', selectedDate).order('date').order('id')),
  ]);
  const error = counts.error ?? purchases.error;
  if (error) return { data: null, error };
  return {
    data: calculateStockOpeningBalances(counts.data ?? [], purchases.data ?? [], selectedDate, isCurrentDate),
    error: null,
  };
}

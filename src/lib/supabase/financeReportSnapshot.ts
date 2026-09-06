import type { SupabaseClient } from '@supabase/supabase-js';
import type { DailyCashEntry, DailyStockCount, Expense, StockPurchase } from '@/types';
import { isMissingDatabaseFunction } from './errors';

export type FinanceReportSection =
  | 'cash'
  | 'stock_totals'
  | 'stock_counts'
  | 'purchases'
  | 'expenses'
  | 'debts'
  | 'debt_payments';

export interface FinanceStockTotalRow {
  date: string;
  bar_income: number;
  bar_cost: number;
}

export interface FinanceStockCountRow extends DailyStockCount {
  product_name: string | null;
  sort_order: number | null;
}

export interface FinancePurchaseRow extends StockPurchase {
  product_name: string | null;
}

export interface FinanceDebtRow {
  id: string;
  date: string;
  amount: number;
}

export interface FinanceDebtPaymentRow {
  id: string;
  date: string;
  amount: number;
  payment_method: string;
}

export interface FinanceReportSnapshot {
  cashRows: DailyCashEntry[];
  stockTotalRows: FinanceStockTotalRow[];
  stockCountRows: FinanceStockCountRow[];
  purchaseRows: FinancePurchaseRow[];
  expenseRows: Expense[];
  debtRows: FinanceDebtRow[];
  debtPaymentRows: FinanceDebtPaymentRow[];
}

interface FinanceReportSnapshotResult {
  data: FinanceReportSnapshot | null;
  error: { message: string } | null;
  fallbackRequired: boolean;
}

/**
 * Loads the requested finance sections in one cross-region call. A missing RPC
 * falls back to the existing table reads so app and database deploys can roll
 * out independently.
 */
export async function fetchFinanceReportSnapshot(
  supabase: SupabaseClient,
  clubId: string,
  from: string,
  to: string,
  sections: FinanceReportSection[],
): Promise<FinanceReportSnapshotResult> {
  const result = await supabase.rpc('get_finance_report_snapshot', {
    p_club_id: clubId,
    p_range_from: from,
    p_range_to: to,
    p_sections: sections,
  });

  if (!result.error) {
    const snapshot = result.data as Partial<FinanceReportSnapshot> | null;
    return {
      data: {
        cashRows: snapshot?.cashRows ?? [],
        stockTotalRows: snapshot?.stockTotalRows ?? [],
        stockCountRows: snapshot?.stockCountRows ?? [],
        purchaseRows: snapshot?.purchaseRows ?? [],
        expenseRows: snapshot?.expenseRows ?? [],
        debtRows: snapshot?.debtRows ?? [],
        debtPaymentRows: snapshot?.debtPaymentRows ?? [],
      },
      error: null,
      fallbackRequired: false,
    };
  }

  if (isMissingDatabaseFunction(result.error, 'get_finance_report_snapshot')) {
    return { data: null, error: null, fallbackRequired: true };
  }

  return { data: null, error: result.error, fallbackRequired: false };
}

import type { SupabaseClient } from '@supabase/supabase-js';
import { formatDateOnly } from '../formatters';
import { fetchAllRows } from '../supabase/pagination';
import {
  buildDailyFinanceReportInput,
  formatRussianDailyFinanceReport,
} from './dailyFinanceReport';
import type {
  DailyCashRow,
  ExpenseRow,
  ProductValueRow,
  StockCountRow,
  StockPurchaseCostRow,
} from '../calculations/dashboardMetrics';
import type {
  DailyFinanceReportDebtPaymentRow,
  DailyFinanceReportDebtRow,
} from './dailyFinanceReport';

const TELEGRAM_API_BASE = 'https://api.telegram.org';
const TASHKENT_TIME_ZONE = 'Asia/Tashkent';

interface ClubRow {
  id: string;
  name: string;
}

export interface DailyFinanceReportBuildResult {
  clubId: string;
  chatId: string;
  businessDate: string;
  message: string;
}

function datePartsInTashkent(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TASHKENT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const day = Number(parts.find((part) => part.type === 'day')?.value);

  if (!year || !month || !day) {
    throw new Error('Could not resolve Tashkent date');
  }

  return { year, month, day };
}

function isoDateFromUtcDate(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

export function previousTashkentDateIso(now = new Date()): string {
  const { year, month, day } = datePartsInTashkent(now);
  const previousDate = new Date(Date.UTC(year, month - 1, day - 1));
  return isoDateFromUtcDate(previousDate);
}

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function monthStartIso(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

async function getClub(supabase: SupabaseClient, clubId: string): Promise<ClubRow> {
  const { data, error } = await supabase
    .from('clubs')
    .select('id,name')
    .eq('id', clubId)
    .single();

  if (error) throw error;
  if (!data) throw new Error('Club not found');
  return data as ClubRow;
}

export async function buildDailyFinanceTelegramReport(
  supabase: SupabaseClient,
  {
    businessDate,
    chatId,
    clubId,
  }: {
    businessDate: string;
    chatId: string;
    clubId: string;
  },
): Promise<DailyFinanceReportBuildResult> {
  const monthStart = monthStartIso(businessDate);
  const [clubRes, cashRes, stockRes, purchaseRes, expenseRes, productRes, debtRes, debtPaymentRes, monthCashRes, monthStockRes, monthPurchaseRes, monthExpenseRes] = await Promise.all([
    getClub(supabase, clubId),
    fetchAllRows<DailyCashRow>(() =>
      supabase
        .from('daily_cash_entries')
        .select('date,cash_income,terminal_income,card_income,playstation_income')
        .eq('club_id', clubId)
        .eq('date', businessDate)
        .order('date', { ascending: true }),
    ),
    fetchAllRows<StockCountRow>(() =>
      supabase
        .from('daily_stock_counts')
        .select('product_id,date,bar_income,bar_profit,bar_cost,sold_quantity')
        .eq('club_id', clubId)
        .eq('date', businessDate)
        .order('date', { ascending: true })
        .order('product_id', { ascending: true }),
    ),
    fetchAllRows<StockPurchaseCostRow>(() =>
      supabase
        .from('stock_purchases')
        .select('id,date,quantity,cost_price')
        .eq('club_id', clubId)
        .eq('date', businessDate)
        .order('date', { ascending: true })
        .order('id', { ascending: true }),
    ),
    fetchAllRows<ExpenseRow>(() =>
      supabase
        .from('expenses')
        .select('id,date,amount,category,payment_source,comment,created_at')
        .eq('club_id', clubId)
        .eq('date', businessDate)
        .order('date', { ascending: true })
        .order('id', { ascending: true }),
    ),
    fetchAllRows<ProductValueRow>(() =>
      supabase
        .from('products')
        .select('id,current_stock,cost_price,tracks_inventory')
        .eq('club_id', clubId)
        .eq('is_active', true)
        .order('id', { ascending: true }),
    ),
    fetchAllRows<DailyFinanceReportDebtRow>(() =>
      supabase
        .from('new_debts')
        .select('id,date,amount,remaining_amount,status')
        .eq('club_id', clubId)
        .order('id', { ascending: true }),
    ),
    fetchAllRows<DailyFinanceReportDebtPaymentRow>(() =>
      supabase
        .from('debt_payments')
        .select('id,date,amount,payment_method')
        .eq('club_id', clubId)
        .gte('date', monthStart)
        .lte('date', businessDate)
        .order('date', { ascending: true })
        .order('id', { ascending: true }),
    ),
    fetchAllRows<DailyCashRow>(() =>
      supabase
        .from('daily_cash_entries')
        .select('date,cash_income,terminal_income,card_income,playstation_income')
        .eq('club_id', clubId)
        .gte('date', monthStart)
        .lte('date', businessDate)
        .order('date', { ascending: true }),
    ),
    fetchAllRows<StockCountRow>(() =>
      supabase
        .from('daily_stock_counts')
        .select('product_id,date,bar_income,bar_profit,bar_cost,sold_quantity')
        .eq('club_id', clubId)
        .gte('date', monthStart)
        .lte('date', businessDate)
        .order('date', { ascending: true })
        .order('product_id', { ascending: true }),
    ),
    fetchAllRows<StockPurchaseCostRow>(() =>
      supabase
        .from('stock_purchases')
        .select('id,date,quantity,cost_price')
        .eq('club_id', clubId)
        .gte('date', monthStart)
        .lte('date', businessDate)
        .order('date', { ascending: true })
        .order('id', { ascending: true }),
    ),
    fetchAllRows<ExpenseRow>(() =>
      supabase
        .from('expenses')
        .select('id,date,amount,category,payment_source,comment,created_at')
        .eq('club_id', clubId)
        .gte('date', monthStart)
        .lte('date', businessDate)
        .order('date', { ascending: true })
        .order('id', { ascending: true }),
    ),
  ]);

  const firstError = [
    cashRes.error,
    stockRes.error,
    purchaseRes.error,
    expenseRes.error,
    productRes.error,
    debtRes.error,
    debtPaymentRes.error,
    monthCashRes.error,
    monthStockRes.error,
    monthPurchaseRes.error,
    monthExpenseRes.error,
  ].find(Boolean);

  if (firstError) throw firstError;

  const input = buildDailyFinanceReportInput({
    clubName: clubRes.name,
    businessDate,
    businessDateLabel: formatDateOnly(businessDate, 'ru'),
    cashRows: (cashRes.data ?? []) as DailyCashRow[],
    stockRows: (stockRes.data ?? []) as StockCountRow[],
    stockPurchaseRows: (purchaseRes.data ?? []) as StockPurchaseCostRow[],
    expenseRows: (expenseRes.data ?? []) as ExpenseRow[],
    monthCashRows: (monthCashRes.data ?? []) as DailyCashRow[],
    monthStockRows: (monthStockRes.data ?? []) as StockCountRow[],
    monthStockPurchaseRows: (monthPurchaseRes.data ?? []) as StockPurchaseCostRow[],
    monthExpenseRows: (monthExpenseRes.data ?? []) as ExpenseRow[],
    productRows: (productRes.data ?? []) as ProductValueRow[],
    debtRows: (debtRes.data ?? []) as DailyFinanceReportDebtRow[],
    debtPaymentRows: (debtPaymentRes.data ?? []) as DailyFinanceReportDebtPaymentRow[],
  });

  return {
    clubId,
    chatId,
    businessDate,
    message: formatRussianDailyFinanceReport(input),
  };
}

export async function sendTelegramMessage({
  botToken,
  chatId,
  text,
}: {
  botToken: string;
  chatId: string;
  text: string;
}) {
  const response = await fetch(`${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_notification: false,
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    throw new Error(`Telegram send failed: ${JSON.stringify(payload)}`);
  }

  return payload as {
    ok: true;
    result: {
      message_id: number;
      chat: {
        id: number;
        title?: string;
        type: string;
      };
      date: number;
    };
  };
}

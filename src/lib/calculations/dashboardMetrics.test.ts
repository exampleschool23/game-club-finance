import { describe, expect, it } from 'vitest';
import {
  buildIncomeTrend,
  calculateDashboardTotals,
  getDashboardRange,
  getPreviousDashboardRange,
  localIsoDate,
} from './dashboardMetrics';

describe('dashboard metrics', () => {
  it('includes daily cash entry in game club and total income', () => {
    const totals = calculateDashboardTotals(
      [
        {
          date: '2026-06-03',
          cash_income: 3_222_222,
          terminal_income: 100_000,
          card_income: 50_000,
        },
      ],
      [],
      [],
      [],
      [],
    );

    expect(totals.cashIncome).toBe(3_222_222);
    expect(totals.gameClubIncome).toBe(3_372_222);
    expect(totals.totalIncome).toBe(3_372_222);
  });

  it('includes closing stock bar income in dashboard totals', () => {
    const totals = calculateDashboardTotals(
      [],
      [
        {
          date: '2026-06-03',
          bar_income: 30_000,
          bar_profit: 9_600,
          bar_cost: 20_400,
          sold_quantity: 2,
        },
        {
          date: '2026-06-03',
          bar_income: 48_000,
          bar_profit: 17_314.285714285714,
          bar_cost: 30_685.714285714286,
          sold_quantity: 4,
        },
      ],
      [],
      [],
      [],
    );

    expect(totals.barIncome).toBe(78_000);
    expect(totals.totalIncome).toBe(78_000);
  });

  it('combines cash, closing stock, expenses, inventory, debts, and margin', () => {
    const totals = calculateDashboardTotals(
      [
        {
          date: '2026-06-03',
          cash_income: 3_222_222,
          terminal_income: 0,
          card_income: 0,
        },
      ],
      [
        {
          date: '2026-06-03',
          bar_income: 78_000,
          bar_profit: 26_914.285714285714,
          bar_cost: 51_085.714285714286,
          sold_quantity: 6,
        },
      ],
      [
        {
          id: 'expense-1',
          date: '2026-06-03',
          amount: 120_000,
          category: 'cleaning',
          comment: null,
          created_at: '2026-06-03T04:11:28.668588+00:00',
        },
      ],
      [{ current_stock: 20, cost_price: 7_671.428571428572 }],
      [
        { remaining_amount: 100_000, status: 'unpaid' },
        { remaining_amount: 50_000, status: 'paid' },
      ],
    );

    expect(totals.gameClubIncome).toBe(3_222_222);
    expect(totals.barIncome).toBe(78_000);
    expect(totals.totalIncome).toBe(3_300_222);
    expect(totals.totalExpenses).toBe(120_000);
    expect(totals.netProfit).toBe(3_180_222);
    expect(totals.inventoryValue).toBeCloseTo(153_428.57142857145);
    expect(totals.activeDebts).toBe(100_000);
    expect(totals.activeDebtCount).toBe(1);
    expect(totals.profitMargin).toBe(96.4);
  });

  it('builds 7-day trend using cash and closing stock income', () => {
    const trend = buildIncomeTrend(
      '2026-06-03',
      [{ date: '2026-06-03', cash_income: 1_000, terminal_income: 2_000, card_income: 3_000 }],
      [{ date: '2026-06-03', bar_income: 4_000, bar_profit: 1_000, bar_cost: 3_000, sold_quantity: 1 }],
      [{ id: 'e1', date: '2026-06-03', amount: 500, category: 'other', comment: null, created_at: '2026-06-03T10:00:00Z' }],
    );

    expect(trend).toHaveLength(7);
    expect(trend[6]).toEqual({ date: '2026-06-03', income: 10_000, expenses: 500 });
  });

  it('uses local dates instead of UTC conversion for ranges', () => {
    const localDate = new Date(2026, 5, 3, 1, 0, 0);

    expect(localIsoDate(localDate)).toBe('2026-06-03');
    expect(getDashboardRange('today', '2026-06-03')).toEqual({
      from: '2026-06-03',
      to: '2026-06-03',
    });
    expect(getDashboardRange('week', '2026-06-03')).toEqual({
      from: '2026-06-01',
      to: '2026-06-07',
    });
    expect(getPreviousDashboardRange({ from: '2026-06-01', to: '2026-06-07' })).toEqual({
      from: '2026-05-25',
      to: '2026-05-31',
    });
  });
});

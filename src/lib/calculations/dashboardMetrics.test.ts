import { describe, expect, it } from 'vitest';
import {
  buildIncomeTrend,
  buildPeriodTrend,
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
          playstation_income: 200_000,
        },
      ],
      [],
      [],
      [],
      [],
      [],
    );

    expect(totals.cashIncome).toBe(3_222_222);
    expect(totals.computerIncome).toBe(3_372_222);
    expect(totals.playstationIncome).toBe(200_000);
    expect(totals.gameClubIncome).toBe(3_572_222);
    expect(totals.totalIncome).toBe(3_572_222);
  });

  it('deducts stock purchases from July 2 onward from closing stock bar income', () => {
    const totals = calculateDashboardTotals(
      [],
      [
        {
          date: '2026-07-02',
          bar_income: 30_000,
          bar_profit: 9_600,
          bar_cost: 20_400,
          sold_quantity: 2,
        },
        {
          date: '2026-07-02',
          bar_income: 48_000,
          bar_profit: 17_314.285714285714,
          bar_cost: 30_685.714285714286,
          sold_quantity: 4,
        },
      ],
      [
        { date: '2026-07-01', quantity: 10, cost_price: 10_000 },
        { date: '2026-07-02', quantity: 2, cost_price: 10_000 },
      ],
      [],
      [],
      [],
    );

    expect(totals.barSales).toBe(78_000);
    expect(totals.stockPurchaseCost).toBe(20_000);
    expect(totals.barIncome).toBe(58_000);
    expect(totals.totalIncome).toBe(58_000);
  });

  it('combines cash, closing stock, expenses, inventory, debts, and margin', () => {
    const totals = calculateDashboardTotals(
      [
        {
          date: '2026-07-02',
          cash_income: 3_222_222,
          terminal_income: 0,
          card_income: 0,
          playstation_income: 100_000,
        },
      ],
      [
        {
          date: '2026-07-02',
          bar_income: 78_000,
          bar_profit: 26_914.285714285714,
          bar_cost: 51_085.714285714286,
          sold_quantity: 6,
        },
      ],
      [{ date: '2026-07-02', quantity: 2, cost_price: 10_000 }],
      [
        {
          id: 'expense-1',
          date: '2026-07-02',
          amount: 120_000,
          category: 'cleaning',
          comment: null,
          created_at: '2026-07-02T04:11:28.668588+00:00',
        },
      ],
      [{ current_stock: 20, cost_price: 7_671.428571428572 }],
      [
        { remaining_amount: 100_000, status: 'unpaid' },
        { remaining_amount: 50_000, status: 'paid' },
      ],
    );

    expect(totals.gameClubIncome).toBe(3_322_222);
    expect(totals.barSales).toBe(78_000);
    expect(totals.stockPurchaseCost).toBe(20_000);
    expect(totals.barIncome).toBe(58_000);
    expect(totals.totalIncome).toBe(3_380_222);
    expect(totals.totalExpenses).toBe(120_000);
    expect(totals.netProfit).toBe(3_260_222);
    expect(totals.inventoryValue).toBeCloseTo(153_428.57142857145);
    expect(totals.activeDebts).toBe(100_000);
    expect(totals.activeDebtCount).toBe(1);
    expect(totals.profitMargin).toBe(96.4);
  });

  it('builds 7-day trend using cash, closing stock income, and purchases', () => {
    const trend = buildIncomeTrend(
      '2026-07-02',
      [{ date: '2026-07-02', cash_income: 1_000, terminal_income: 2_000, card_income: 3_000, playstation_income: 5_000 }],
      [{ date: '2026-07-02', bar_income: 4_000, bar_profit: 1_000, bar_cost: 3_000, sold_quantity: 1 }],
      [{ date: '2026-07-02', quantity: 2, cost_price: 500 }],
      [{ id: 'e1', date: '2026-07-02', amount: 500, category: 'other', comment: null, created_at: '2026-07-02T10:00:00Z' }],
    );

    expect(trend).toHaveLength(7);
    expect(trend[6]).toEqual({ date: '2026-07-02', income: 14_000, expenses: 500 });
  });

  it('builds a month trend from the selected month range, including early-month data', () => {
    const range = getDashboardRange('month', '2026-06-03');
    const trend = buildPeriodTrend(
      range,
      [{ date: '2026-06-03', cash_income: 5_000_000, terminal_income: 775_000, card_income: 1_840_000, playstation_income: 200_000 }],
      [{ date: '2026-06-03', bar_income: 126_000, bar_profit: 60_000, bar_cost: 66_000, sold_quantity: 3 }],
      [],
      [
        { id: 'e1', date: '2026-06-03', amount: 1_000_000, category: 'equipment', comment: null, created_at: '2026-06-03T10:00:00Z' },
        { id: 'e2', date: '2026-06-03', amount: 120_000, category: 'cleaning', comment: null, created_at: '2026-06-03T11:00:00Z' },
      ],
    );

    expect(trend).toHaveLength(30);
    expect(trend[0]).toEqual({ date: '2026-06-01', income: 0, expenses: 0 });
    expect(trend[2]).toEqual({ date: '2026-06-03', income: 7_941_000, expenses: 1_120_000 });
    expect(trend[29]).toEqual({ date: '2026-06-30', income: 0, expenses: 0 });
  });

  it('builds a week trend for the exact selected dashboard week', () => {
    const range = getDashboardRange('week', '2026-06-03');
    const trend = buildPeriodTrend(
      range,
      [{ date: '2026-06-01', cash_income: 100, terminal_income: 200, card_income: 300 }],
      [],
      [],
      [{ id: 'e1', date: '2026-06-07', amount: 50, category: 'other', comment: null, created_at: '2026-06-07T10:00:00Z' }],
    );

    expect(trend).toHaveLength(7);
    expect(trend[0]).toEqual({ date: '2026-06-01', income: 600, expenses: 0 });
    expect(trend[6]).toEqual({ date: '2026-06-07', income: 0, expenses: 50 });
  });

  it('builds a today trend for only the selected date', () => {
    const range = getDashboardRange('today', '2026-06-03');
    const trend = buildPeriodTrend(
      range,
      [{ date: '2026-06-03', cash_income: 1_000, terminal_income: 0, card_income: 0 }],
      [],
      [],
      [],
    );

    expect(trend).toEqual([{ date: '2026-06-03', income: 1_000, expenses: 0 }]);
  });

  it('uses local dates instead of UTC conversion for ranges', () => {
    const localDate = new Date(2026, 5, 3, 1, 0, 0);

    expect(localIsoDate(localDate)).toBe('2026-06-03');
    expect(getDashboardRange('today', '2026-06-03')).toEqual({
      from: '2026-06-03',
      to: '2026-06-03',
    });
    expect(getDashboardRange('yesterday', '2026-06-03')).toEqual({
      from: '2026-06-02',
      to: '2026-06-02',
    });
    expect(getDashboardRange('last7Days', '2026-06-03')).toEqual({
      from: '2026-05-28',
      to: '2026-06-03',
    });
    expect(getDashboardRange('week', '2026-06-03')).toEqual({
      from: '2026-06-01',
      to: '2026-06-07',
    });
    expect(getDashboardRange('lastWeek', '2026-06-03')).toEqual({
      from: '2026-05-25',
      to: '2026-05-31',
    });
    expect(getDashboardRange('month', '2026-06-03')).toEqual({
      from: '2026-06-01',
      to: '2026-06-30',
    });
    expect(getDashboardRange('lastMonth', '2026-06-03')).toEqual({
      from: '2026-05-01',
      to: '2026-05-31',
    });
    expect(getDashboardRange('custom', '2026-06-03', { from: '2026-06-10', to: '2026-06-03' })).toEqual({
      from: '2026-06-03',
      to: '2026-06-10',
    });
    expect(getPreviousDashboardRange({ from: '2026-06-01', to: '2026-06-07' })).toEqual({
      from: '2026-05-25',
      to: '2026-05-31',
    });
  });
});

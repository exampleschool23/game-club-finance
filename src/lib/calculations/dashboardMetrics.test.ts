import { describe, expect, it } from 'vitest';
import {
  buildIncomeTrend,
  buildPeriodTrend,
  calculateAverageDailyIncome,
  calculateDashboardTotals,
  calculateGameClubMoneyLeftByPaymentMethod,
  countDashboardRangeDays,
  countDashboardRangeDaysThroughDate,
  getDashboardAverageDayCount,
  getDashboardRange,
  getLatestRowDateInRange,
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
    expect(totals.gameClubMoneyLeft).toBe(3_572_222);
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
    expect(totals.gameClubMoneyLeft).toBe(3_202_222);
    expect(totals.netProfit).toBe(3_260_222);
    expect(totals.inventoryValue).toBeCloseTo(153_428.57142857145);
    expect(totals.activeDebts).toBe(100_000);
    expect(totals.activeDebtCount).toBe(1);
    expect(totals.profitMargin).toBe(96.4);
  });

  it('subtracts expenses from the selected money source only', () => {
    const totals = calculateDashboardTotals(
      [
        {
          date: '2026-07-04',
          cash_income: 500_000,
          terminal_income: 0,
          card_income: 0,
          playstation_income: 0,
        },
      ],
      [{ date: '2026-07-04', bar_income: 300_000, bar_profit: 100_000, bar_cost: 200_000, sold_quantity: 10 }],
      [{ date: '2026-07-04', quantity: 2, cost_price: 50_000 }],
      [
        {
          id: 'game-club-expense',
          date: '2026-07-04',
          amount: 120_000,
          category: 'salary',
          payment_source: 'game_club',
          comment: null,
          created_at: '2026-07-04T10:00:00Z',
        },
        {
          id: 'bar-expense',
          date: '2026-07-04',
          amount: 40_000,
          category: 'repair',
          payment_source: 'bar',
          comment: null,
          created_at: '2026-07-04T11:00:00Z',
        },
      ],
      [],
      [],
    );

    expect(totals.stockPurchaseCost).toBe(100_000);
    expect(totals.gameClubExpenses).toBe(120_000);
    expect(totals.barExpenses).toBe(40_000);
    expect(totals.gameClubMoneyLeft).toBe(380_000);
    expect(totals.barIncome).toBe(160_000);
    expect(totals.totalIncome).toBe(700_000);
    expect(totals.netProfit).toBe(540_000);
  });

  it('breaks game club money left down by payment method', () => {
    const breakdown = calculateGameClubMoneyLeftByPaymentMethod(
      [
        {
          date: '2026-07-04',
          cash_income: 500_000,
          terminal_income: 300_000,
          card_income: 100_000,
          playstation_income: 50_000,
        },
      ],
      [
        {
          id: 'cash-expense',
          date: '2026-07-04',
          amount: 120_000,
          category: 'salary',
          payment_method: 'cash',
          payment_source: 'game_club',
          comment: null,
          created_at: '2026-07-04T10:00:00Z',
        },
        {
          id: 'terminal-expense',
          date: '2026-07-04',
          amount: 50_000,
          category: 'repair',
          payment_method: 'terminal',
          payment_source: 'game_club',
          comment: null,
          created_at: '2026-07-04T11:00:00Z',
        },
        {
          id: 'transfer-expense',
          date: '2026-07-04',
          amount: 40_000,
          category: 'internet',
          payment_method: 'transfer',
          payment_source: 'game_club',
          comment: null,
          created_at: '2026-07-04T12:00:00Z',
        },
        {
          id: 'bar-expense',
          date: '2026-07-04',
          amount: 10_000,
          category: 'cleaning',
          payment_method: 'cash',
          payment_source: 'bar',
          comment: null,
          created_at: '2026-07-04T13:00:00Z',
        },
      ],
    );

    expect(breakdown).toEqual({
      cash: 380_000,
      terminal: 250_000,
      card: 60_000,
      playstation: 50_000,
    });
    expect(Object.values(breakdown).reduce((sum, value) => sum + value, 0)).toBe(740_000);
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

  it('counts average days for current periods through the selected date', () => {
    expect(countDashboardRangeDays({ from: '2026-07-01', to: '2026-07-31' })).toBe(31);
    expect(
      getDashboardAverageDayCount(
        'month',
        { from: '2026-07-01', to: '2026-07-31' },
        '2026-07-06',
      ),
    ).toBe(6);
    expect(
      getDashboardAverageDayCount(
        'week',
        { from: '2026-07-06', to: '2026-07-12' },
        '2026-07-08',
      ),
    ).toBe(3);
    expect(
      getDashboardAverageDayCount(
        'lastMonth',
        { from: '2026-06-01', to: '2026-06-30' },
        '2026-07-06',
      ),
    ).toBe(30);
    expect(calculateAverageDailyIncome(10_000, 3)).toBe(3_333);
  });

  it('averages game club income through the latest daily cashier entry date', () => {
    const range = { from: '2026-07-01', to: '2026-07-05' };
    const latestCashierEntryDate = getLatestRowDateInRange(
      [
        { date: '2026-07-01', cash_income: 1_000, terminal_income: 0, card_income: 0 },
        { date: '2026-07-04', cash_income: 1_000, terminal_income: 0, card_income: 0 },
      ],
      range,
    );

    expect(latestCashierEntryDate).toBe('2026-07-04');
    expect(countDashboardRangeDaysThroughDate(range, latestCashierEntryDate)).toBe(4);
    expect(calculateAverageDailyIncome(10_254_000, 4)).toBe(2_563_500);
  });
});

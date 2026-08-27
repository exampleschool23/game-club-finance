import { describe, it, expect } from 'vitest';
import {
  calculateManualIncome,
  calculateTotalIncome,
  calculateNetProfit,
  calculateFinancialReportTotals,
} from './dailyReport';
import { calculateDashboardTotals } from './dashboardMetrics';

describe('calculateManualIncome', () => {
  it('sums game club payment method fields', () => {
    const entry = {
      cash_income: 100000,
      terminal_income: 50000,
      card_income: 30000,
      playstation_income: 20000,
    };
    expect(calculateManualIncome(entry)).toBe(200000);
  });

  it('returns 0 when all fields are 0', () => {
    const entry = {
      cash_income: 0,
      terminal_income: 0,
      card_income: 0,
      playstation_income: 0,
    };
    expect(calculateManualIncome(entry)).toBe(0);
  });
});

describe('calculateTotalIncome', () => {
  it('adds manual income and bar income', () => {
    expect(calculateTotalIncome(415000, 80000)).toBe(495000);
  });

  it('recognizes a new debt as income without requiring a repayment', () => {
    expect(calculateTotalIncome(415000, 80000, 120000)).toBe(615000);
  });
});

describe('calculateNetProfit', () => {
  it('subtracts expenses from total income', () => {
    expect(calculateNetProfit(495000, 100000)).toBe(395000);
  });

  it('can return negative profit', () => {
    expect(calculateNetProfit(50000, 100000)).toBe(-50000);
  });
});

describe('calculateFinancialReportTotals', () => {
  it('keeps gross sales, bar cash left, and accounting profit separate', () => {
    expect(calculateFinancialReportTotals({
      manualIncome: 415000,
      debtIncome: 120000,
      stockRows: [
        { bar_income: 80000, bar_cost: 30000 },
        { bar_income: 20000, bar_cost: 7500 },
      ],
      purchaseRows: [
        { date: '2026-07-03', quantity: 10, cost_price: 4000 },
      ],
      expenseRows: [
        { amount: 10000, payment_source: 'bar' },
        { amount: 50000, payment_source: 'game_club' },
      ],
    })).toEqual({
      manualIncome: 415000,
      debtIncome: 120000,
      barSales: 100000,
      barCost: 37500,
      stockPurchaseCost: 40000,
      barExpenses: 10000,
      totalIncome: 635000,
      totalExpenses: 60000,
      barCashLeft: 50000,
      accountingNetProfit: 537500,
    });
  });

  it('does not subtract inventory purchases from accounting profit', () => {
    const totals = calculateFinancialReportTotals({
      manualIncome: 0,
      stockRows: [{ bar_income: 100000, bar_cost: 25000 }],
      purchaseRows: [{ date: '2026-07-03', quantity: 20, cost_price: 3000 }],
      expenseRows: [],
    });

    expect(totals.barCashLeft).toBe(40000);
    expect(totals.accountingNetProfit).toBe(75000);
  });

  it('subtracts only bar-paid expenses from bar cash left but all expenses from profit', () => {
    const totals = calculateFinancialReportTotals({
      manualIncome: 200000,
      stockRows: [{ bar_income: 50000, bar_cost: 15000 }],
      purchaseRows: [],
      expenseRows: [
        { amount: 5000, payment_source: 'bar' },
        { amount: 20000, payment_source: 'game_club' },
      ],
    });

    expect(totals.barCashLeft).toBe(45000);
    expect(totals.accountingNetProfit).toBe(210000);
  });

  it('matches the dashboard accounting and bar-cash definitions', () => {
    const cashRows = [{
      date: '2026-07-03',
      cash_income: 100000,
      terminal_income: 50000,
      card_income: 25000,
      playstation_income: 10000,
    }];
    const stockRows = [{
      date: '2026-07-03',
      bar_income: 80000,
      bar_cost: 30000,
      bar_profit: 50000,
      sold_quantity: 10,
    }];
    const purchaseRows = [{ date: '2026-07-03', quantity: 5, cost_price: 4000 }];
    const expenseRows = [{
      id: 'expense-1',
      date: '2026-07-03',
      amount: 10000,
      category: 'other',
      payment_source: 'bar' as const,
      comment: null,
      created_at: '2026-07-03T12:00:00Z',
    }];
    const debtRows = [{
      date: '2026-07-03',
      amount: 120000,
      remaining_amount: 120000,
      status: 'active',
    }];

    const dashboard = calculateDashboardTotals(
      cashRows,
      stockRows,
      purchaseRows,
      expenseRows,
      [],
      debtRows,
    );
    const report = calculateFinancialReportTotals({
      manualIncome: calculateManualIncome(cashRows[0]),
      debtIncome: 120000,
      stockRows,
      purchaseRows,
      expenseRows,
    });

    expect(report.barSales).toBe(dashboard.barSales);
    expect(report.barCost).toBe(dashboard.barCost);
    expect(report.barCashLeft).toBe(dashboard.barIncome);
    expect(report.accountingNetProfit).toBe(dashboard.accountingNetProfit);
    expect(report.totalIncome).toBe(dashboard.gameClubIncome + dashboard.barSales);
  });
});

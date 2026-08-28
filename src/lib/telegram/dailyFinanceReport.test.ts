import { describe, expect, it } from 'vitest';
import {
  buildDailyFinanceReportInput,
  formatRussianDailyFinanceReportCaption,
  formatRussianDailyFinanceReport,
} from './dailyFinanceReport';
import { monthStartIso, previousTashkentDateIso } from './sendDailyFinanceReport';

describe('formatRussianDailyFinanceReport', () => {
  it('formats the two-line photo caption without duplicating the club name', () => {
    expect(formatRussianDailyFinanceReportCaption({
      clubName: 'Main Game Club',
      businessDateLabel: '27 августа 2026',
      dailyRevenue: 0,
      gameClubIncome: 0,
      computerIncome: 0,
      debtIncome: 0,
      playstationIncome: 0,
      barSales: 0,
      barCost: 0,
      grossProfit: 0,
      netProfit: 0,
      stockPurchases: 0,
      totalExpenses: 0,
      gameClubExpenses: 0,
      barExpenses: 0,
      gameClubExpenseCategories: [],
      barExpenseCategories: [],
      salaryCosts: 0,
      kpiCosts: 0,
      rentCosts: 0,
      utilitiesCosts: 0,
      otherOperatingCosts: 0,
      monthToDateRevenue: 0,
      averageDailyRevenue: 0,
      gameClubMoneyLeft: 0,
      averageDailyGameClubIncome: 0,
      barMoneyLeft: 0,
      inventoryValue: 0,
      activeDebts: 0,
    })).toBe('📊 Ежедневный финансовый отчёт\nРабочий день: 27 августа 2026');
  });

  it('formats the saved Russian Telegram daily finance template', () => {
    const message = formatRussianDailyFinanceReport({
        clubName: 'Pixel Game Zone',
        businessDateLabel: '4 июля 2026',
        dailyRevenue: 931_000,
        gameClubIncome: 0,
        computerIncome: 0,
        debtIncome: 0,
        playstationIncome: 0,
        barSales: 931_000,
        barCost: 400_000,
        grossProfit: 531_000,
        netProfit: 531_000,
        stockPurchases: 668_000,
        totalExpenses: 0,
        gameClubExpenses: 0,
        barExpenses: 0,
        gameClubExpenseCategories: [],
        barExpenseCategories: [],
        salaryCosts: 0,
        kpiCosts: 0,
        rentCosts: 0,
        utilitiesCosts: 0,
        otherOperatingCosts: 0,
        monthToDateRevenue: 4_000_000,
        averageDailyRevenue: 1_000_000,
        gameClubMoneyLeft: 3_024_000,
        averageDailyGameClubIncome: 756_000,
        barMoneyLeft: 2_311_000,
        inventoryValue: 8_473_309,
        activeDebts: 0,
      });

    expect(message).toContain('💳 Выручка за день: 931 000 UZS');
    expect(message).toContain('🍫 Продажи бара: 931 000 UZS (100%)');
    expect(message).toContain('📈 Валовая прибыль: 531 000 UZS');
    expect(message).toContain('✅ Чистая прибыль: 531 000 UZS');
    expect(message).toContain('🗓 Выручка с начала месяца: 4 000 000 UZS');
    expect(message).toContain('📊 Средняя выручка в день: 1 000 000 UZS');
  });

  it('uses daily rows for the report day and month-to-date rows for balances', () => {
    const input = buildDailyFinanceReportInput({
      clubName: 'Pixel Game Club',
      businessDate: '2026-07-04',
      businessDateLabel: '4 июля 2026',
      cashRows: [
        {
          date: '2026-07-04',
          cash_income: 500_000,
          terminal_income: 120_000,
          card_income: 80_000,
          playstation_income: 50_000,
        },
      ],
      stockRows: [
        {
          date: '2026-07-04',
          bar_income: 300_000,
          bar_profit: 100_000,
          bar_cost: 200_000,
          sold_quantity: 10,
        },
      ],
      stockPurchaseRows: [{ date: '2026-07-04', quantity: 2, cost_price: 50_000 }],
      expenseRows: [
        {
          id: 'game-club-expense',
          date: '2026-07-04',
          amount: 80_000,
          category: 'salary',
          payment_source: 'game_club',
          comment: null,
          created_at: '2026-07-04T10:00:00Z',
        },
        {
          id: 'custom-game-club-expense',
          date: '2026-07-04',
          amount: 40_000,
          category: 'other',
          payment_source: 'game_club',
          comment: 'Elektrenergiya',
          created_at: '2026-07-04T10:30:00Z',
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
      monthCashRows: [
        {
          date: '2026-07-01',
          cash_income: 1_000_000,
          terminal_income: 100_000,
          card_income: 0,
          playstation_income: 0,
        },
        {
          date: '2026-07-04',
          cash_income: 500_000,
          terminal_income: 120_000,
          card_income: 80_000,
          playstation_income: 50_000,
        },
      ],
      monthStockRows: [
        {
          date: '2026-07-01',
          bar_income: 400_000,
          bar_profit: 150_000,
          bar_cost: 250_000,
          sold_quantity: 14,
        },
        {
          date: '2026-07-04',
          bar_income: 300_000,
          bar_profit: 100_000,
          bar_cost: 200_000,
          sold_quantity: 10,
        },
      ],
      monthStockPurchaseRows: [
        { date: '2026-07-01', quantity: 5, cost_price: 20_000 },
        { date: '2026-07-04', quantity: 2, cost_price: 50_000 },
      ],
      monthExpenseRows: [
        {
          id: 'month-game-club-expense',
          date: '2026-07-01',
          amount: 100_000,
          category: 'salary',
          payment_source: 'game_club',
          comment: null,
          created_at: '2026-07-01T10:00:00Z',
        },
        {
          id: 'month-bar-expense',
          date: '2026-07-04',
          amount: 40_000,
          category: 'repair',
          payment_source: 'bar',
          comment: null,
          created_at: '2026-07-04T11:00:00Z',
        },
      ],
      debtRows: [
        { date: '2026-07-04', amount: 90_000, remaining_amount: 90_000, status: 'unpaid' },
        { remaining_amount: 20_000, status: 'paid' },
      ],
      productRows: [
        { current_stock: 3, cost_price: 12_000 },
        { current_stock: 2, cost_price: 7_000 },
      ],
    });

    expect(input).toMatchObject({
      dailyRevenue: 1_140_000,
      gameClubIncome: 840_000,
      computerIncome: 790_000,
      debtIncome: 90_000,
      playstationIncome: 50_000,
      barSales: 300_000,
      barCost: 200_000,
      grossProfit: 940_000,
      netProfit: 780_000,
      stockPurchases: 100_000,
      totalExpenses: 160_000,
      gameClubExpenses: 120_000,
      barExpenses: 40_000,
      gameClubExpenseCategories: [
        { name: 'Зарплата', amount: 80_000 },
        { name: 'Elektrenergiya', amount: 40_000 },
      ],
      barExpenseCategories: [{ name: 'Ремонт', amount: 40_000 }],
      salaryCosts: 80_000,
      kpiCosts: 0,
      rentCosts: 0,
      utilitiesCosts: 40_000,
      otherOperatingCosts: 40_000,
      monthToDateRevenue: 2_640_000,
      averageDailyRevenue: 660_000,
      gameClubMoneyLeft: 1_750_000,
      averageDailyGameClubIncome: 485_000,
      barMoneyLeft: 560_000,
      inventoryValue: 50_000,
      activeDebts: 90_000,
    });
  });

  it('formats expense category breakdowns under each money source', () => {
    expect(
      formatRussianDailyFinanceReport({
        clubName: 'Main Game Club',
        businessDateLabel: '3 июля 2026',
        dailyRevenue: 2_496_000,
        gameClubIncome: 1_904_000,
        computerIncome: 1_904_000,
        debtIncome: 0,
        playstationIncome: 0,
        barSales: 592_000,
        barCost: 250_000,
        grossProfit: 2_246_000,
        netProfit: 1_622_000,
        stockPurchases: 0,
        totalExpenses: 624_000,
        gameClubExpenses: 564_000,
        barExpenses: 60_000,
        gameClubExpenseCategories: [
          { name: 'Зарплата', amount: 340_000 },
          { name: 'Пополнение Номера', amount: 224_000 },
        ],
        barExpenseCategories: [{ name: 'Еда / Напитки', amount: 60_000 }],
        salaryCosts: 340_000,
        kpiCosts: 0,
        rentCosts: 0,
        utilitiesCosts: 0,
        otherOperatingCosts: 284_000,
        monthToDateRevenue: 5_000_000,
        averageDailyRevenue: 1_666_667,
        gameClubMoneyLeft: 2_941_000,
        averageDailyGameClubIncome: 980_333,
        barMoneyLeft: 1_084_000,
        inventoryValue: 8_473_309,
        activeDebts: 0,
      }),
    ).toContain(`💸 Расходы: 624 000 UZS
  • Из денег клуба: 564 000 UZS
    - Зарплата: 340 000 UZS
    - Пополнение Номера: 224 000 UZS
  • Из денег бара: 60 000 UZS
    - Еда / Напитки: 60 000 UZS`);
  });

  it('uses the saved description for other expenses and falls back when it is blank', () => {
    const input = buildDailyFinanceReportInput({
      clubName: 'Pixel Game Club',
      businessDate: '2026-08-25',
      businessDateLabel: '25 августа 2026',
      cashRows: [],
      stockRows: [],
      stockPurchaseRows: [],
      expenseRows: [
        {
          id: 'described-other',
          date: '2026-08-25',
          amount: 3_541_000,
          category: 'other',
          payment_source: 'game_club',
          comment: '  Elektrenergiya  ',
          created_at: '2026-08-25T17:56:47Z',
        },
        {
          id: 'blank-other',
          date: '2026-08-25',
          amount: 25_000,
          category: 'other',
          payment_source: 'game_club',
          comment: '   ',
          created_at: '2026-08-25T18:00:00Z',
        },
      ],
      debtRows: [],
    });

    expect(input.gameClubExpenseCategories).toEqual([
      { name: 'Elektrenergiya', amount: 3_541_000 },
      { name: 'Другое', amount: 25_000 },
    ]);
    expect(input.utilitiesCosts).toBe(3_541_000);
    expect(input.otherOperatingCosts).toBe(25_000);
  });
});

describe('previousTashkentDateIso', () => {
  it('uses the previous Tashkent calendar day for the 06:00 scheduled report', () => {
    expect(previousTashkentDateIso(new Date('2026-07-05T01:00:00.000Z'))).toBe('2026-07-04');
  });
});

describe('monthStartIso', () => {
  it('returns the first date of the same month', () => {
    expect(monthStartIso('2026-07-04')).toBe('2026-07-01');
  });
});

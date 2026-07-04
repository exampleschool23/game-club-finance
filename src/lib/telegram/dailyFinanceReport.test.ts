import { describe, expect, it } from 'vitest';
import {
  buildDailyFinanceReportInput,
  formatRussianDailyFinanceReport,
} from './dailyFinanceReport';
import { monthStartIso, previousTashkentDateIso } from './sendDailyFinanceReport';

describe('formatRussianDailyFinanceReport', () => {
  it('formats the saved Russian Telegram daily finance template', () => {
    expect(
      formatRussianDailyFinanceReport({
        clubName: 'Pixel Game Zone',
        businessDateLabel: '4 июля 2026',
        gameClubIncome: 0,
        computerIncome: 0,
        playstationIncome: 0,
        barSales: 931_000,
        stockPurchases: 668_000,
        totalExpenses: 0,
        gameClubExpenses: 0,
        barExpenses: 0,
        gameClubMoneyLeft: 3_024_000,
        barMoneyLeft: 2_311_000,
        netProfit: 263_000,
        activeDebts: 0,
      }),
    ).toBe(`📊 Ежедневный финансовый отчёт
Pixel Game Zone
Рабочий день: 4 июля 2026

🎮 Доход клуба: 0 UZS
  • Компьютеры: 0 UZS
  • PlayStation: 0 UZS

🍫 Продажи бара: 931 000 UZS
📦 Закупки склада: 668 000 UZS

💸 Расходы: 0 UZS
  • Из денег клуба: 0 UZS
  • Из денег бара: 0 UZS

💰 Остаток денег клуба за месяц: 3 024 000 UZS
🧾 Остаток денег бара за месяц: 2 311 000 UZS
✅ Чистая прибыль сегодня: 263 000 UZS

🤝 Активные долги: 0 UZS`);
  });

  it('uses daily rows for the report day and month-to-date rows for balances', () => {
    const input = buildDailyFinanceReportInput({
      clubName: 'Pixel Game Club',
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
        { remaining_amount: 90_000, status: 'unpaid' },
        { remaining_amount: 20_000, status: 'paid' },
      ],
    });

    expect(input).toMatchObject({
      gameClubIncome: 750_000,
      computerIncome: 700_000,
      playstationIncome: 50_000,
      barSales: 300_000,
      stockPurchases: 100_000,
      totalExpenses: 160_000,
      gameClubExpenses: 120_000,
      barExpenses: 40_000,
      gameClubMoneyLeft: 1_750_000,
      barMoneyLeft: 560_000,
      netProfit: 790_000,
      activeDebts: 90_000,
    });
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

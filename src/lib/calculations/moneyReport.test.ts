import { describe, expect, it } from 'vitest';
import { buildMoneyReport } from './moneyReport';

describe('money report', () => {
  it('shows collected, expenses, and money left by payment method', () => {
    const report = buildMoneyReport(
      [
        {
          date: '2026-08-25',
          cash_income: 1_000_000,
          terminal_income: 2_000_000,
          card_income: 300_000,
          playstation_income: 200_000,
        },
      ],
      [
        {
          id: 'cash-expense',
          date: '2026-08-25',
          amount: 150_000,
          category: 'other',
          payment_method: 'cash',
          payment_source: 'game_club',
          comment: null,
          created_at: '2026-08-25T10:00:00Z',
        },
        {
          id: 'terminal-expense',
          date: '2026-08-25',
          amount: 250_000,
          category: 'other',
          payment_method: 'terminal',
          payment_source: 'game_club',
          comment: null,
          created_at: '2026-08-25T11:00:00Z',
        },
        {
          id: 'bar-expense',
          date: '2026-08-25',
          amount: 900_000,
          category: 'other',
          payment_method: 'cash',
          payment_source: 'bar',
          comment: null,
          created_at: '2026-08-25T12:00:00Z',
        },
      ],
      [{ date: '2026-08-25', amount: 50_000, payment_method: 'card' }],
    );

    expect(report.paymentMethods.cash).toEqual({
      collected: 1_000_000,
      expenses: 150_000,
      left: 850_000,
    });
    expect(report.paymentMethods.terminal.left).toBe(1_750_000);
    expect(report.paymentMethods.card).toEqual({
      collected: 350_000,
      expenses: 0,
      left: 350_000,
    });
    expect(report.paymentMethods.playstation.left).toBe(200_000);
    expect(report.totalCollected).toBe(3_550_000);
    expect(report.totalExpenses).toBe(400_000);
    expect(report.totalLeft).toBe(3_150_000);
    expect(report.days).toEqual([
      {
        date: '2026-08-25',
        cash: 850_000,
        terminal: 1_750_000,
        card: 350_000,
        playstation: 200_000,
        total: 3_150_000,
      },
    ]);
  });

  it('sorts daily closeouts newest first and includes expense-only dates', () => {
    const report = buildMoneyReport(
      [{ date: '2026-08-24', cash_income: 100, terminal_income: 0, card_income: 0 }],
      [{
        id: 'expense-only',
        date: '2026-08-25',
        amount: 40,
        category: 'other',
        payment_method: 'cash',
        payment_source: 'game_club',
        comment: null,
        created_at: '2026-08-25T10:00:00Z',
      }],
    );

    expect(report.days.map((day) => day.date)).toEqual(['2026-08-25', '2026-08-24']);
    expect(report.days[0].total).toBe(-40);
  });
});

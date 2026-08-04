import { describe, expect, it } from 'vitest';
import { calculateAvailableMoney } from './availableMoney';

const expense = (
  id: string,
  date: string,
  amount: number,
  paymentSource: 'game_club' | 'bar',
) => ({
  id,
  date,
  amount,
  category: 'other',
  payment_source: paymentSource,
  comment: null,
  created_at: `${date}T10:00:00Z`,
});

describe('available owner money', () => {
  it('carries retained money across months and subtracts withdrawals by source', () => {
    const result = calculateAvailableMoney({
      cashRows: [
        {
          date: '2026-07-31',
          cash_income: 1_000_000,
          terminal_income: 200_000,
          card_income: 100_000,
          playstation_income: 200_000,
        },
        {
          date: '2026-08-01',
          cash_income: 500_000,
          terminal_income: 300_000,
          card_income: 200_000,
          playstation_income: 100_000,
        },
      ],
      stockRows: [
        { date: '2026-07-31', bar_income: 1_000_000, bar_profit: 0, bar_cost: 0, sold_quantity: 0 },
        { date: '2026-08-01', bar_income: 500_000, bar_profit: 0, bar_cost: 0, sold_quantity: 0 },
      ],
      purchaseRows: [
        { date: '2026-07-01', quantity: 10, cost_price: 100_000 },
        { date: '2026-07-31', quantity: 2, cost_price: 100_000 },
      ],
      expenseRows: [
        expense('club-expense', '2026-08-01', 300_000, 'game_club'),
        expense('bar-expense', '2026-08-01', 100_000, 'bar'),
      ],
      debtPaymentRows: [
        { date: '2026-08-01', amount: 200_000, payment_method: 'cash' },
      ],
      withdrawalRows: [
        { id: 'club-take', date: '2026-08-01', source: 'game_club', amount: 1_100_000 },
        { id: 'bar-take', date: '2026-08-01', source: 'bar', amount: 400_000 },
      ],
    });

    expect(result.gameClub).toEqual({
      earned: 2_500_000,
      withdrawn: 1_100_000,
      available: 1_400_000,
      overdrawnBy: 0,
    });
    expect(result.bar).toEqual({
      earned: 1_200_000,
      withdrawn: 400_000,
      available: 800_000,
      overdrawnBy: 0,
    });
    expect(result.totalEarned).toBe(3_700_000);
    expect(result.totalWithdrawn).toBe(1_500_000);
    expect(result.totalAvailable).toBe(2_200_000);
    expect(result.hasOverWithdrawal).toBe(false);
  });

  it('does not allow one source balance to cover a withdrawal from the other', () => {
    const result = calculateAvailableMoney({
      cashRows: [
        { date: '2026-08-01', cash_income: 1_000, terminal_income: 0, card_income: 0 },
      ],
      stockRows: [],
      purchaseRows: [],
      expenseRows: [],
      withdrawalRows: [
        { id: 'bar-overdraw', date: '2026-08-01', source: 'bar', amount: 100 },
      ],
    });

    expect(result.gameClub.available).toBe(1_000);
    expect(result.bar.available).toBe(-100);
    expect(result.bar.overdrawnBy).toBe(100);
    expect(result.invalidWithdrawals).toEqual([
      {
        id: 'bar-overdraw',
        date: '2026-08-01',
        source: 'bar',
        amount: 100,
        availableBefore: 0,
        overdrawnBy: 100,
      },
    ]);
  });

  it('deducts bar expenses when there are no stock purchases', () => {
    const result = calculateAvailableMoney({
      cashRows: [],
      stockRows: [
        { date: '2026-08-01', bar_income: 500, bar_profit: 500, bar_cost: 0, sold_quantity: 1 },
      ],
      purchaseRows: [],
      expenseRows: [expense('bar-expense', '2026-08-01', 125, 'bar')],
    });

    expect(result.bar.earned).toBe(375);
    expect(result.bar.available).toBe(375);
  });

  it('flags a withdrawal that was invalid on its date even if later earnings recover the balance', () => {
    const result = calculateAvailableMoney({
      cashRows: [],
      stockRows: [
        { date: '2026-08-01', bar_income: 100, bar_profit: 100, bar_cost: 0, sold_quantity: 1 },
        { date: '2026-08-03', bar_income: 100, bar_profit: 100, bar_cost: 0, sold_quantity: 1 },
      ],
      purchaseRows: [],
      expenseRows: [],
      withdrawalRows: [
        { id: 'first', date: '2026-08-01', source: 'bar', amount: 80, created_at: '2026-08-01T10:00:00Z' },
        { id: 'second', date: '2026-08-02', source: 'bar', amount: 30, created_at: '2026-08-02T10:00:00Z' },
      ],
    });

    expect(result.bar.available).toBe(90);
    expect(result.bar.overdrawnBy).toBe(0);
    expect(result.hasOverWithdrawal).toBe(true);
    expect(result.invalidWithdrawals).toEqual([
      {
        id: 'second',
        date: '2026-08-02',
        source: 'bar',
        amount: 30,
        availableBefore: 20,
        overdrawnBy: 10,
      },
    ]);
  });

  it('uses rows through the requested date inclusively', () => {
    const result = calculateAvailableMoney({
      cashRows: [
        { date: '2026-07-31', cash_income: 300, terminal_income: 0, card_income: 0 },
        { date: '2026-08-01', cash_income: 900, terminal_income: 0, card_income: 0 },
      ],
      stockRows: [],
      purchaseRows: [],
      expenseRows: [expense('included', '2026-07-31', 50, 'game_club')],
      withdrawalRows: [
        { date: '2026-07-31', source: 'game_club', amount: 100 },
        { date: '2026-08-01', source: 'game_club', amount: 200 },
      ],
      throughDate: '2026-07-31',
    });

    expect(result.gameClub).toEqual({
      earned: 250,
      withdrawn: 100,
      available: 150,
      overdrawnBy: 0,
    });
  });

  it('rejects malformed withdrawal amounts instead of increasing the balance', () => {
    expect(() => calculateAvailableMoney({
      cashRows: [],
      stockRows: [],
      purchaseRows: [],
      expenseRows: [],
      withdrawalRows: [{ date: '2026-08-01', source: 'bar', amount: -100 }],
    })).toThrow(new RangeError('Withdrawal amount must be a finite number greater than zero'));
  });
});

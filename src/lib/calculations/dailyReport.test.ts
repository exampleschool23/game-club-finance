import { describe, it, expect } from 'vitest';
import {
  calculateManualIncome,
  calculateTotalIncome,
  calculateNetProfit,
} from './dailyReport';

describe('calculateManualIncome', () => {
  it('sums all income fields', () => {
    const entry = {
      cash_income: 100000,
      terminal_income: 50000,
      qr_income: 30000,
      transfer_income: 20000,
      debt_income: 10000,
      game_income: 200000,
      other_income: 5000,
    };
    expect(calculateManualIncome(entry)).toBe(415000);
  });

  it('returns 0 when all fields are 0', () => {
    const entry = {
      cash_income: 0,
      terminal_income: 0,
      qr_income: 0,
      transfer_income: 0,
      debt_income: 0,
      game_income: 0,
      other_income: 0,
    };
    expect(calculateManualIncome(entry)).toBe(0);
  });
});

describe('calculateTotalIncome', () => {
  it('adds manual income and bar income', () => {
    expect(calculateTotalIncome(415000, 80000)).toBe(495000);
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

import { describe, it, expect } from 'vitest';
import {
  calculateManualIncome,
  calculateTotalIncome,
  calculateNetProfit,
} from './dailyReport';

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

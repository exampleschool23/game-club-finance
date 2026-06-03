import { describe, expect, it } from 'vitest';
import { calculateGameClubIncome } from './dailyCash';

describe('calculateGameClubIncome', () => {
  it('adds cash, terminal, and card totals', () => {
    expect(
      calculateGameClubIncome({
        cashIncome: 1_250_000,
        terminalIncome: 1_550_000,
        cardIncome: 450_000,
      }),
    ).toBe(3_250_000);
  });

  it('handles zero values', () => {
    expect(
      calculateGameClubIncome({
        cashIncome: 0,
        terminalIncome: 0,
        cardIncome: 0,
      }),
    ).toBe(0);
  });

  it('handles large values', () => {
    expect(
      calculateGameClubIncome({
        cashIncome: 900_000_000,
        terminalIncome: 850_000_000,
        cardIncome: 750_000_000,
      }),
    ).toBe(2_500_000_000);
  });
});

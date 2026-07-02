import { describe, expect, it } from 'vitest';
import { calculateGameClubIncome } from './dailyCash';

describe('calculateGameClubIncome', () => {
  it('adds cash, terminal, card, and PlayStation totals', () => {
    expect(
      calculateGameClubIncome({
        cashIncome: 1_250_000,
        terminalIncome: 1_550_000,
        cardIncome: 450_000,
        playstationIncome: 300_000,
      }),
    ).toBe(3_550_000);
  });

  it('handles zero values', () => {
    expect(
      calculateGameClubIncome({
        cashIncome: 0,
        terminalIncome: 0,
        cardIncome: 0,
        playstationIncome: 0,
      }),
    ).toBe(0);
  });

  it('only supported game club income fields contribute', () => {
    expect(calculateGameClubIncome({ cashIncome: 1000, terminalIncome: 0, cardIncome: 0 })).toBe(1000);
    expect(calculateGameClubIncome({ cashIncome: 0, terminalIncome: 500, cardIncome: 0 })).toBe(500);
    expect(calculateGameClubIncome({ cashIncome: 0, terminalIncome: 0, cardIncome: 250 })).toBe(250);
    expect(calculateGameClubIncome({ cashIncome: 0, terminalIncome: 0, cardIncome: 0, playstationIncome: 750 })).toBe(750);
  });

  it('handles large values', () => {
    expect(
      calculateGameClubIncome({
        cashIncome: 900_000_000,
        terminalIncome: 850_000_000,
        cardIncome: 750_000_000,
        playstationIncome: 250_000_000,
      }),
    ).toBe(2_750_000_000);
  });
});

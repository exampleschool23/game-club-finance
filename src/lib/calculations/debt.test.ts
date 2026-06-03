import { describe, it, expect } from 'vitest';
import { calculateRemainingDebt, getDebtStatus } from './debt';

describe('calculateRemainingDebt', () => {
  it('returns difference between amount and paid', () => {
    expect(calculateRemainingDebt(100000, 30000)).toBe(70000);
  });

  it('returns 0 when fully paid', () => {
    expect(calculateRemainingDebt(100000, 100000)).toBe(0);
  });

  it('returns 0 when overpaid (clamps to 0)', () => {
    expect(calculateRemainingDebt(100000, 120000)).toBe(0);
  });

  it('new debt has remaining equal to full amount', () => {
    expect(calculateRemainingDebt(500000, 0)).toBe(500000);
  });

  it('partial payment reduces remaining correctly', () => {
    expect(calculateRemainingDebt(500000, 200000)).toBe(300000);
  });

  it('remaining cannot go below zero (overpayment clamps)', () => {
    expect(calculateRemainingDebt(500000, 600000)).toBe(0);
  });
});

describe('getDebtStatus', () => {
  it('returns unpaid when nothing paid', () => {
    expect(getDebtStatus(100000, 0)).toBe('unpaid');
  });

  it('returns partial when partially paid', () => {
    expect(getDebtStatus(100000, 50000)).toBe('partial');
  });

  it('returns paid when fully paid', () => {
    expect(getDebtStatus(100000, 100000)).toBe('paid');
  });

  it('returns paid when overpaid', () => {
    expect(getDebtStatus(100000, 120000)).toBe('paid');
  });
});

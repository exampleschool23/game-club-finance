import { describe, expect, it } from 'vitest';
import { clampWithdrawalInput } from './withdrawalInput';

describe('clampWithdrawalInput', () => {
  it('caps typed and pasted amounts at the available profit', () => {
    expect(clampWithdrawalInput('5 555 555 555', 7391000)).toBe('7 391 000');
    expect(clampWithdrawalInput('9'.repeat(400), 7391000)).toBe('7 391 000');
  });

  it('preserves smaller amounts, the exact maximum, and clearing the field', () => {
    expect(clampWithdrawalInput('1234', 7391000)).toBe('1 234');
    expect(clampWithdrawalInput('7391000', 7391000)).toBe('7 391 000');
    expect(clampWithdrawalInput('', 7391000)).toBe('');
  });

  it('reapplies a reduced balance without rounding above it', () => {
    expect(clampWithdrawalInput('7 391 000', 1000.75)).toBe('1 000');
    expect(clampWithdrawalInput('1000', 0)).toBe('0');
    expect(clampWithdrawalInput('1000', -100)).toBe('0');
    expect(clampWithdrawalInput('1000', NaN)).toBe('0');
  });
});

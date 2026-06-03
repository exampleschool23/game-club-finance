import { describe, it, expect } from 'vitest';
import {
  calculateTotalExpenses,
  filterExpensesByDate,
  filterExpensesByCategory,
  expensesByCategory,
  expensesByPaymentMethod,
} from './expenses';
import type { ExpenseEntry } from './expenses';

const sample: ExpenseEntry[] = [
  { id: '1', date: '2026-06-03', amount: 120000, category: 'cleaning', payment_method: 'cash', comment: null },
  { id: '2', date: '2026-06-03', amount: 50000, category: 'internet', payment_method: 'transfer', comment: null },
  { id: '3', date: '2026-06-04', amount: 200000, category: 'salary', payment_method: 'cash', comment: null },
  { id: '4', date: '2026-06-04', amount: 80000, category: 'cleaning', payment_method: 'terminal', comment: null },
];

describe('calculateTotalExpenses', () => {
  it('sums all expense amounts', () => {
    expect(calculateTotalExpenses(sample)).toBe(450000);
  });
  it('returns 0 for empty list', () => {
    expect(calculateTotalExpenses([])).toBe(0);
  });
});

describe('filterExpensesByDate', () => {
  it('returns only expenses for that date', () => {
    const result = filterExpensesByDate(sample, '2026-06-03');
    expect(result).toHaveLength(2);
    expect(calculateTotalExpenses(result)).toBe(170000);
  });
  it('returns empty when no match', () => {
    expect(filterExpensesByDate(sample, '2026-06-01')).toHaveLength(0);
  });
});

describe('filterExpensesByCategory', () => {
  it('returns expenses for a given category', () => {
    const result = filterExpensesByCategory(sample, 'cleaning');
    expect(result).toHaveLength(2);
    expect(calculateTotalExpenses(result)).toBe(200000);
  });
});

describe('expensesByCategory', () => {
  it('groups and sums by category', () => {
    const result = expensesByCategory(sample);
    expect(result.cleaning).toBe(200000);
    expect(result.internet).toBe(50000);
    expect(result.salary).toBe(200000);
  });
});

describe('expensesByPaymentMethod', () => {
  it('groups and sums by payment method', () => {
    const result = expensesByPaymentMethod(sample);
    expect(result.cash).toBe(320000);
    expect(result.transfer).toBe(50000);
    expect(result.terminal).toBe(80000);
  });
});

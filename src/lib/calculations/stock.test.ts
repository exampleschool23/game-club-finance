import { describe, it, expect } from 'vitest';
import {
  calculateSoldQuantity,
  calculateBarIncome,
  calculateBarCost,
  calculateBarProfit,
  calculateStockCountSummary,
} from './stock';

describe('calculateSoldQuantity', () => {
  it('returns correct sold quantity', () => {
    expect(calculateSoldQuantity(100, 20, 80)).toBe(40);
  });

  it('returns 0 when closing stock exceeds opening + added', () => {
    expect(calculateSoldQuantity(10, 0, 20)).toBe(0);
  });

  it('returns 0 when nothing was sold', () => {
    expect(calculateSoldQuantity(50, 10, 60)).toBe(0);
  });
});

describe('calculateBarIncome', () => {
  it('multiplies sold quantity by sale price', () => {
    expect(calculateBarIncome(10, 5000)).toBe(50000);
  });

  it('returns 0 when nothing was sold', () => {
    expect(calculateBarIncome(0, 5000)).toBe(0);
  });
});

describe('calculateBarCost', () => {
  it('multiplies sold quantity by cost price', () => {
    expect(calculateBarCost(10, 3000)).toBe(30000);
  });
});

describe('calculateBarProfit', () => {
  it('subtracts cost from income', () => {
    expect(calculateBarProfit(50000, 30000)).toBe(20000);
  });

  it('can return negative profit', () => {
    expect(calculateBarProfit(1000, 2000)).toBe(-1000);
  });
});

describe('calculateStockCountSummary', () => {
  it('returns full summary correctly', () => {
    const result = calculateStockCountSummary({
      previousStock: 100,
      addedToday: 20,
      closingStock: 80,
      salePrice: 5000,
      costPrice: 3000,
    });
    expect(result.soldQuantity).toBe(40);
    expect(result.barIncome).toBe(200000);
    expect(result.barCost).toBe(120000);
    expect(result.barProfit).toBe(80000);
  });
});

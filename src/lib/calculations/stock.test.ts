import { describe, it, expect } from 'vitest';
import {
  calculateSoldQuantity,
  calculateBarIncome,
  calculateBarCost,
  calculateBarProfit,
  calculateStockCountSummary,
  calculateWeightedAverageCost,
  calculateClosingStockDefaults,
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

describe('calculateWeightedAverageCost', () => {
  it('calculates weighted average when existing and purchased quantities are equal', () => {
    expect(calculateWeightedAverageCost({
      currentStock: 10,
      currentCostPrice: 8200,
      purchasedQuantity: 10,
      purchaseCostPrice: 7200,
    })).toBe(7700);
  });

  it('weights by quantity when purchase quantity differs from current stock', () => {
    expect(calculateWeightedAverageCost({
      currentStock: 5,
      currentCostPrice: 10000,
      purchasedQuantity: 15,
      purchaseCostPrice: 6000,
    })).toBe(7000);
  });

  it('uses purchase cost when there is no existing stock', () => {
    expect(calculateWeightedAverageCost({
      currentStock: 0,
      currentCostPrice: 8200,
      purchasedQuantity: 10,
      purchaseCostPrice: 7200,
    })).toBe(7200);
  });

  it('keeps current cost when purchased quantity is zero', () => {
    expect(calculateWeightedAverageCost({
      currentStock: 10,
      currentCostPrice: 8200,
      purchasedQuantity: 0,
      purchaseCostPrice: 7200,
    })).toBe(8200);
  });

  it('returns zero when no stock exists before or after purchase', () => {
    expect(calculateWeightedAverageCost({
      currentStock: 0,
      currentCostPrice: 8200,
      purchasedQuantity: 0,
      purchaseCostPrice: 7200,
    })).toBe(0);
  });

  it('treats negative quantities as zero', () => {
    expect(calculateWeightedAverageCost({
      currentStock: -10,
      currentCostPrice: 8200,
      purchasedQuantity: 10,
      purchaseCostPrice: 7200,
    })).toBe(7200);
  });
});

describe('calculateClosingStockDefaults', () => {
  it('splits current stock into previous stock and purchases made today', () => {
    expect(calculateClosingStockDefaults({
      currentStock: 124,
      purchasedToday: 24,
    })).toEqual({
      previousStock: 100,
      addedToday: 24,
      closingStock: 124,
    });
  });

  it('keeps added today at zero when no purchases were made today', () => {
    expect(calculateClosingStockDefaults({
      currentStock: 79,
      purchasedToday: 0,
    })).toEqual({
      previousStock: 79,
      addedToday: 0,
      closingStock: 79,
    });
  });

  it('does not allow previous stock to become negative', () => {
    expect(calculateClosingStockDefaults({
      currentStock: 10,
      purchasedToday: 24,
    })).toEqual({
      previousStock: 0,
      addedToday: 24,
      closingStock: 10,
    });
  });
});

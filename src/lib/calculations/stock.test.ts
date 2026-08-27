import { describe, it, expect } from 'vitest';
import {
  calculateSoldQuantity,
  calculateClosingStockFromSold,
  calculateBarIncome,
  calculateBarCost,
  calculateBarProfit,
  calculateDirectSalesSummary,
  calculateStockCountSummary,
  applyPurchaseDeltaToStockCount,
  calculateWeightedAverageCost,
  calculateClosingStockDefaults,
  calculateAvailableStock,
  validateStockAvailability,
  isWholePositiveStockQuantity,
  recalculateFutureStockCounts,
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

  it('includes an explicit signed inventory adjustment', () => {
    expect(calculateSoldQuantity(10, 0, 13, 5)).toBe(2);
    expect(calculateSoldQuantity(10, 5, 8, -2)).toBe(5);
  });
});

describe('stock availability validation', () => {
  it('identifies unexplained inventory increases', () => {
    expect(validateStockAvailability(10, 0, 13)).toEqual({
      availableStock: 10,
      excessClosingStock: 3,
      isValid: false,
    });
  });

  it('accepts a closing count covered by an explicit adjustment', () => {
    expect(calculateAvailableStock(10, 0, 5)).toBe(15);
    expect(validateStockAvailability(10, 0, 13, 5)).toEqual({
      availableStock: 15,
      excessClosingStock: 0,
      isValid: true,
    });
  });

  it('rejects an adjustment that makes available stock negative', () => {
    expect(validateStockAvailability(2, 0, 0, -3).isValid).toBe(false);
  });
});

describe('stock purchase quantity validation', () => {
  it('accepts only positive whole units', () => {
    expect(isWholePositiveStockQuantity(1)).toBe(true);
    expect(isWholePositiveStockQuantity(306)).toBe(true);
    expect(isWholePositiveStockQuantity(0)).toBe(false);
    expect(isWholePositiveStockQuantity(-1)).toBe(false);
    expect(isWholePositiveStockQuantity(0.01)).toBe(false);
    expect(isWholePositiveStockQuantity(305.99)).toBe(false);
  });
});

describe('calculateClosingStockFromSold', () => {
  it('calculates ending stock from previous stock, added stock and sold quantity', () => {
    expect(calculateClosingStockFromSold(20, 50, 0)).toBe(70);
    expect(calculateClosingStockFromSold(20, 50, 7)).toBe(63);
  });

  it('does not allow ending stock to become negative', () => {
    expect(calculateClosingStockFromSold(20, 50, 80)).toBe(0);
  });

  it('includes an inventory adjustment when deriving closing stock', () => {
    expect(calculateClosingStockFromSold(10, 0, 2, 5)).toBe(13);
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

describe('calculateDirectSalesSummary', () => {
  it('calculates made-to-order revenue and cost without stock limits', () => {
    expect(calculateDirectSalesSummary(4, 25_000, 11_000)).toEqual({
      soldQuantity: 4,
      barIncome: 100_000,
      barCost: 44_000,
      barProfit: 56_000,
    });
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

  it('scenario: prev=100 added=20 closing=90 → soldQty=30', () => {
    const result = calculateStockCountSummary({
      previousStock: 100,
      addedToday: 20,
      closingStock: 90,
      salePrice: 15000,
      costPrice: 7000,
    });
    expect(result.soldQuantity).toBe(30);
    expect(result.barIncome).toBe(450000);
    expect(result.barCost).toBe(210000);
    expect(result.barProfit).toBe(240000);
  });

  it('zero sale calculates correctly', () => {
    const result = calculateStockCountSummary({
      previousStock: 50,
      addedToday: 0,
      closingStock: 50,
      salePrice: 5000,
      costPrice: 2000,
    });
    expect(result.soldQuantity).toBe(0);
    expect(result.barIncome).toBe(0);
    expect(result.barCost).toBe(0);
    expect(result.barProfit).toBe(0);
  });

  it('calculates sales after an explicit positive adjustment', () => {
    expect(calculateStockCountSummary({
      previousStock: 10,
      addedToday: 0,
      adjustmentQuantity: 5,
      closingStock: 13,
      salePrice: 10_000,
      costPrice: 6_000,
    })).toEqual({
      soldQuantity: 2,
      barIncome: 20_000,
      barCost: 12_000,
      barProfit: 8_000,
    });
  });
});

describe('applyPurchaseDeltaToStockCount', () => {
  it('adds a same-day purchase to saved added and closing stock without changing sold quantity', () => {
    expect(applyPurchaseDeltaToStockCount({
      previousStock: 10,
      addedToday: 5,
      closingStock: 12,
      quantityDelta: 3,
      salePrice: 15000,
      costPrice: 9000,
    })).toEqual({
      addedToday: 8,
      closingStock: 15,
      soldQuantity: 3,
      barIncome: 45000,
      barCost: 27000,
      barProfit: 18000,
    });
  });

  it('removes a deleted purchase from saved added and closing stock and clamps at zero', () => {
    expect(applyPurchaseDeltaToStockCount({
      previousStock: 10,
      addedToday: 2,
      closingStock: 1,
      quantityDelta: -5,
      salePrice: 10000,
      costPrice: 6000,
    })).toEqual({
      addedToday: 0,
      closingStock: 0,
      soldQuantity: 10,
      barIncome: 100000,
      barCost: 60000,
      barProfit: 40000,
    });
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

describe('recalculateFutureStockCounts', () => {
  it('chains previous stock from the edited closing stock into later saved days', () => {
    expect(recalculateFutureStockCounts(66, [
      {
        date: '2026-06-03',
        added_today: 10,
        adjustment_quantity: 2,
        closing_stock: 70,
        sale_price: 15000,
        cost_price: 10000,
      },
      {
        date: '2026-06-02',
        added_today: 0,
        closing_stock: 60,
        sale_price: 15000,
        cost_price: 10000,
      },
    ])).toEqual([
      {
        date: '2026-06-02',
        previous_stock: 66,
        added_today: 0,
        closing_stock: 60,
        sold_quantity: 6,
        sale_price: 15000,
        cost_price: 10000,
        bar_income: 90000,
        bar_cost: 60000,
        bar_profit: 30000,
      },
      {
        date: '2026-06-03',
        previous_stock: 60,
        added_today: 10,
        adjustment_quantity: 2,
        closing_stock: 70,
        sold_quantity: 2,
        sale_price: 15000,
        cost_price: 10000,
        bar_income: 30000,
        bar_cost: 20000,
        bar_profit: 10000,
      },
    ]);
  });
});

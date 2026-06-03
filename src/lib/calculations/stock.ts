export interface StockCountInput {
  previousStock: number;
  addedToday: number;
  closingStock: number;
  salePrice: number;
  costPrice: number;
}

export interface StockCountResult {
  soldQuantity: number;
  barIncome: number;
  barCost: number;
  barProfit: number;
}

export interface AverageCostInput {
  currentStock: number;
  currentCostPrice: number;
  purchasedQuantity: number;
  purchaseCostPrice: number;
}

export interface ClosingStockDefaultsInput {
  currentStock: number;
  purchasedToday: number;
}

export interface ClosingStockDefaults {
  previousStock: number;
  addedToday: number;
  closingStock: number;
}

export interface FutureStockCountInput {
  date: string;
  added_today: number;
  closing_stock: number;
  sale_price: number;
  cost_price: number;
}

export interface RecalculatedFutureStockCount extends FutureStockCountInput {
  previous_stock: number;
  sold_quantity: number;
  bar_income: number;
  bar_cost: number;
  bar_profit: number;
}

export function calculateSoldQuantity(
  previousStock: number,
  addedToday: number,
  closingStock: number,
): number {
  return Math.max(0, previousStock + addedToday - closingStock);
}

export function calculateClosingStockFromSold(
  previousStock: number,
  addedToday: number,
  soldQuantity: number,
): number {
  return Math.max(0, previousStock + addedToday - soldQuantity);
}

export function calculateBarIncome(soldQuantity: number, salePrice: number): number {
  return soldQuantity * salePrice;
}

export function calculateBarCost(soldQuantity: number, costPrice: number): number {
  return soldQuantity * costPrice;
}

export function calculateBarProfit(barIncome: number, barCost: number): number {
  return barIncome - barCost;
}

export function calculateStockCountSummary(input: StockCountInput): StockCountResult {
  const soldQuantity = calculateSoldQuantity(
    input.previousStock,
    input.addedToday,
    input.closingStock,
  );
  const barIncome = calculateBarIncome(soldQuantity, input.salePrice);
  const barCost = calculateBarCost(soldQuantity, input.costPrice);
  return {
    soldQuantity,
    barIncome,
    barCost,
    barProfit: calculateBarProfit(barIncome, barCost),
  };
}

export function calculateWeightedAverageCost(input: AverageCostInput): number {
  const currentStock = Math.max(0, input.currentStock);
  const purchasedQuantity = Math.max(0, input.purchasedQuantity);
  const totalQuantity = currentStock + purchasedQuantity;

  if (totalQuantity === 0) return 0;
  if (currentStock === 0) return input.purchaseCostPrice;
  if (purchasedQuantity === 0) return input.currentCostPrice;

  return (
    (currentStock * input.currentCostPrice) +
    (purchasedQuantity * input.purchaseCostPrice)
  ) / totalQuantity;
}

export function calculateClosingStockDefaults(input: ClosingStockDefaultsInput): ClosingStockDefaults {
  const currentStock = Math.max(0, input.currentStock);
  const addedToday = Math.max(0, input.purchasedToday);

  return {
    previousStock: Math.max(0, currentStock - addedToday),
    addedToday,
    closingStock: currentStock,
  };
}

export function recalculateFutureStockCounts(
  startingClosingStock: number,
  rows: FutureStockCountInput[],
): RecalculatedFutureStockCount[] {
  let previousStock = startingClosingStock;

  return [...rows]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => {
      const summary = calculateStockCountSummary({
        previousStock,
        addedToday: row.added_today,
        closingStock: row.closing_stock,
        salePrice: row.sale_price,
        costPrice: row.cost_price,
      });

      const recalculated = {
        ...row,
        previous_stock: previousStock,
        sold_quantity: summary.soldQuantity,
        bar_income: summary.barIncome,
        bar_cost: summary.barCost,
        bar_profit: summary.barProfit,
      };

      previousStock = row.closing_stock;
      return recalculated;
    });
}

export interface StockCountInput {
  previousStock: number;
  addedToday: number;
  adjustmentQuantity?: number;
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

export interface StockCountPurchaseDeltaInput extends StockCountInput {
  quantityDelta: number;
}

export interface StockCountPurchaseDeltaResult extends StockCountResult {
  addedToday: number;
  closingStock: number;
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
  adjustment_quantity?: number;
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

export interface StockAvailability {
  availableStock: number;
  excessClosingStock: number;
  isValid: boolean;
}

export function isWholePositiveStockQuantity(value: number): boolean {
  return Number.isFinite(value) && value > 0 && Number.isInteger(value);
}

export function calculateAvailableStock(
  previousStock: number,
  addedToday: number,
  adjustmentQuantity = 0,
): number {
  return previousStock + addedToday + adjustmentQuantity;
}

export function validateStockAvailability(
  previousStock: number,
  addedToday: number,
  closingStock: number,
  adjustmentQuantity = 0,
): StockAvailability {
  const availableStock = calculateAvailableStock(previousStock, addedToday, adjustmentQuantity);
  const excessClosingStock = Math.max(0, closingStock - availableStock);

  return {
    availableStock,
    excessClosingStock,
    isValid: availableStock >= 0 && excessClosingStock === 0,
  };
}

export function calculateSoldQuantity(
  previousStock: number,
  addedToday: number,
  closingStock: number,
  adjustmentQuantity = 0,
): number {
  return Math.max(0, calculateAvailableStock(previousStock, addedToday, adjustmentQuantity) - closingStock);
}

export function calculateClosingStockFromSold(
  previousStock: number,
  addedToday: number,
  soldQuantity: number,
  adjustmentQuantity = 0,
): number {
  return Math.max(0, calculateAvailableStock(previousStock, addedToday, adjustmentQuantity) - soldQuantity);
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

export function calculateDirectSalesSummary(
  soldQuantity: number,
  salePrice: number,
  costPrice: number,
): StockCountResult {
  const normalizedSoldQuantity = Math.max(0, soldQuantity);
  const barIncome = calculateBarIncome(normalizedSoldQuantity, salePrice);
  const barCost = calculateBarCost(normalizedSoldQuantity, costPrice);

  return {
    soldQuantity: normalizedSoldQuantity,
    barIncome,
    barCost,
    barProfit: calculateBarProfit(barIncome, barCost),
  };
}

export function calculateStockCountSummary(input: StockCountInput): StockCountResult {
  const soldQuantity = calculateSoldQuantity(
    input.previousStock,
    input.addedToday,
    input.closingStock,
    input.adjustmentQuantity,
  );
  return calculateDirectSalesSummary(soldQuantity, input.salePrice, input.costPrice);
}

export function applyPurchaseDeltaToStockCount(input: StockCountPurchaseDeltaInput): StockCountPurchaseDeltaResult {
  const addedToday = Math.max(0, input.addedToday + input.quantityDelta);
  const closingStock = Math.max(0, input.closingStock + input.quantityDelta);
  const summary = calculateStockCountSummary({
    previousStock: input.previousStock,
    addedToday,
    adjustmentQuantity: input.adjustmentQuantity,
    closingStock,
    salePrice: input.salePrice,
    costPrice: input.costPrice,
  });

  return {
    addedToday,
    closingStock,
    ...summary,
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
        adjustmentQuantity: row.adjustment_quantity,
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

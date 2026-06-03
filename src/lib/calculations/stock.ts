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

export function calculateSoldQuantity(
  previousStock: number,
  addedToday: number,
  closingStock: number,
): number {
  return Math.max(0, previousStock + addedToday - closingStock);
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

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

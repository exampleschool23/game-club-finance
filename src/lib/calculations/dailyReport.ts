export interface DailyCashEntry {
  cash_income: number;
  terminal_income: number;
  qr_income: number;
  transfer_income: number;
  debt_income: number;
  game_income: number;
  other_income: number;
}

export function calculateManualIncome(entry: DailyCashEntry): number {
  return (
    entry.cash_income +
    entry.terminal_income +
    entry.qr_income +
    entry.transfer_income +
    entry.debt_income +
    entry.game_income +
    entry.other_income
  );
}

export function calculateTotalIncome(manualIncome: number, barIncome: number): number {
  return manualIncome + barIncome;
}

export function calculateNetProfit(totalIncome: number, totalExpenses: number): number {
  return totalIncome - totalExpenses;
}

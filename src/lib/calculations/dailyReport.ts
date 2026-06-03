import { calculateGameClubIncome } from './dailyCash';

export interface DailyCashEntry {
  cash_income: number;
  terminal_income: number;
  card_income: number;
}

export function calculateManualIncome(entry: DailyCashEntry): number {
  return calculateGameClubIncome({
    cashIncome: entry.cash_income,
    terminalIncome: entry.terminal_income,
    cardIncome: entry.card_income,
  });
}

export function calculateTotalIncome(manualIncome: number, barIncome: number): number {
  return manualIncome + barIncome;
}

export function calculateNetProfit(totalIncome: number, totalExpenses: number): number {
  return totalIncome - totalExpenses;
}

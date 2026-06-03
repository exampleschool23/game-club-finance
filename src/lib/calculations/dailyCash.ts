export interface GameClubIncomeInput {
  cashIncome: number;
  terminalIncome: number;
  cardIncome: number;
}

export function calculateGameClubIncome({
  cashIncome,
  terminalIncome,
  cardIncome,
}: GameClubIncomeInput): number {
  return cashIncome + terminalIncome + cardIncome;
}

export interface GameClubIncomeInput {
  cashIncome: number;
  terminalIncome: number;
  cardIncome: number;
  playstationIncome?: number;
}

export function calculateGameClubIncome({
  cashIncome,
  terminalIncome,
  cardIncome,
  playstationIncome = 0,
}: GameClubIncomeInput): number {
  return cashIncome + terminalIncome + cardIncome + playstationIncome;
}

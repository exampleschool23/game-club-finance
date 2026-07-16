export function calculateRemainingDebt(amount: number, paidAmount: number): number {
  return Math.max(0, amount - paidAmount);
}

export function getDebtStatus(
  amount: number,
  paidAmount: number,
): 'unpaid' | 'partial' | 'paid' {
  if (paidAmount <= 0) return 'unpaid';
  if (paidAmount >= amount) return 'paid';
  return 'partial';
}

export function canManageDebts(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

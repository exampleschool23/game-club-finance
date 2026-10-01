/** The only expense categories new entries may use (migration 068 enforces it). */
export const EXPENSE_CATEGORIES = [
  'rent', 'salary', 'electricity', 'internet', 'repair',
  'cleaning', 'food_drinks', 'marketing', 'equipment', 'tax',
  'correction', 'discount', 'other',
] as const;

export type KnownExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export function isKnownExpenseCategory(category: string): category is KnownExpenseCategory {
  return (EXPENSE_CATEGORIES as readonly string[]).includes(category);
}

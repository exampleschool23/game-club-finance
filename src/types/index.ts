export type UserRole = 'owner' | 'admin' | 'cashier';
export type PaymentMethod = 'cash' | 'terminal' | 'qr' | 'transfer' | 'debt';
export type PaymentSource = 'cash' | 'terminal' | 'bank';
export type IncomeCategory = 'game_time' | 'food' | 'drinks' | 'other';
export type ExpenseCategory =
  | 'rent' | 'salary' | 'electricity' | 'internet' | 'repair'
  | 'cleaning' | 'food_drinks' | 'marketing' | 'equipment' | 'tax' | 'other';
export type MovementType = 'deposit' | 'withdraw' | 'correction';
export type DebtStatus = 'unpaid' | 'paid';

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Balance {
  id: string;
  account: 'cash' | 'terminal' | 'bank' | 'debt';
  amount: number;
  updated_at: string;
}

export interface IncomeTransaction {
  id: string;
  amount: number;
  payment_method: PaymentMethod;
  category: IncomeCategory;
  comment: string | null;
  transaction_date: string;
  created_by: string;
  created_at: string;
}

export interface ExpenseTransaction {
  id: string;
  amount: number;
  category: ExpenseCategory;
  payment_source: PaymentSource;
  comment: string | null;
  transaction_date: string;
  created_by: string;
  created_at: string;
}

export interface CashMovement {
  id: string;
  movement_type: MovementType;
  account: string;
  amount: number;
  comment: string | null;
  created_by: string;
  created_at: string;
}

export interface Debt {
  id: string;
  customer_name: string;
  amount: number;
  comment: string | null;
  debt_date: string;
  status: DebtStatus;
  paid_at: string | null;
  paid_method: PaymentMethod | null;
  created_by: string;
  created_at: string;
}

export interface DailyStats {
  date: string;
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
  incomeByMethod: Record<PaymentMethod, number>;
  expenseByCategory: Partial<Record<ExpenseCategory, number>>;
}

export interface MonthlyStats {
  month: string;
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
  incomeByCategory: Partial<Record<IncomeCategory, number>>;
  expenseByCategory: Partial<Record<ExpenseCategory, number>>;
  incomeByMethod: Record<PaymentMethod, number>;
}

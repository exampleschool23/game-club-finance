export type UserRole = 'owner' | 'admin' | 'viewer';
export type PaymentMethod = 'cash' | 'terminal' | 'qr' | 'transfer' | 'debt';
export type PaymentSource = 'cash' | 'terminal' | 'bank';
export type IncomeCategory = 'game_time' | 'food' | 'drinks' | 'other';
export type ExpenseCategory =
  | 'rent' | 'salary' | 'electricity' | 'internet' | 'repair'
  | 'cleaning' | 'food_drinks' | 'marketing' | 'equipment' | 'tax' | 'other';
export type MovementType = 'deposit' | 'withdraw' | 'correction';
export type DebtStatus = 'unpaid' | 'partial' | 'paid';

// Legacy types for old pages
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

export interface LegacyDebt {
  id: string;
  customer_name: string;
  amount: number;
  comment: string | null;
  debt_date: string;
  status: 'unpaid' | 'paid';
  paid_at: string | null;
  paid_method: PaymentMethod | null;
  created_by: string;
  created_at: string;
}

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  name: string;
  category: string | null;
  sale_price: number;
  cost_price: number;
  current_stock: number;
  low_stock_threshold: number | null;
  sort_order?: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DailyCashEntry {
  id: string;
  date: string;
  cash_income: number;
  terminal_income: number;
  card_income: number;
  comment: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface StockPurchase {
  id: string;
  date: string;
  product_id: string;
  quantity: number;
  cost_price: number;
  sale_price: number | null;
  payment_method: string;
  comment: string | null;
  created_by: string | null;
  created_at: string;
}

export interface DailyStockCount {
  id: string;
  date: string;
  product_id: string;
  previous_stock: number;
  added_today: number;
  closing_stock: number;
  sold_quantity: number;
  sale_price: number;
  cost_price: number;
  bar_income: number;
  bar_cost: number;
  bar_profit: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Expense {
  id: string;
  date: string;
  amount: number;
  payment_method: string;
  category: string;
  comment: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewDebt {
  id: string;
  person_name: string;
  date: string;
  amount: number;
  paid_amount: number;
  remaining_amount: number;
  category: string | null;
  comment: string | null;
  status: DebtStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DebtPayment {
  id: string;
  debt_id: string;
  date: string;
  amount: number;
  payment_method: string;
  comment: string | null;
  created_at: string;
}

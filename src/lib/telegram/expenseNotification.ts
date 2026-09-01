import { formatCurrency, formatDateShort } from '../formatters';

export interface ExpenseNotificationInput {
  addedBy: string;
  amount: number;
  category: string;
  comment: string | null;
  date: string;
  paymentMethod: string;
  paymentSource: 'game_club' | 'bar';
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Наличные',
  terminal: 'Терминал',
  card: 'Карта',
};

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  rent: 'Аренда',
  salary: 'Зарплата',
  electricity: 'Электричество',
  internet: 'Интернет',
  repair: 'Ремонт',
  cleaning: 'Уборка',
  food_drinks: 'Еда / Напитки',
  marketing: 'Маркетинг',
  equipment: 'Оборудование',
  tax: 'Налог',
  other: 'Другое',
};

export function buildExpenseNotification(input: ExpenseNotificationInput): string {
  const source = input.paymentSource === 'bar' ? 'Бар' : 'Игровой клуб';
  const method = PAYMENT_METHOD_LABELS[input.paymentMethod] ?? input.paymentMethod;
  const category = EXPENSE_CATEGORY_LABELS[input.category] ?? input.category;
  const lines = [
    '💸 Добавлен расход',
    '',
    `Сумма: ${formatCurrency(input.amount)} сум`,
    `Категория: ${category}`,
    `Источник: ${source}`,
    `Способ оплаты: ${method}`,
    `Дата: ${formatDateShort(input.date, 'ru')}`,
    `Добавил(а): ${input.addedBy}`,
  ];

  if (input.comment) lines.push(`Комментарий: ${input.comment}`);
  return lines.join('\n');
}

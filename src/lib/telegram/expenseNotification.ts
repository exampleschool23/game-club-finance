import { formatCurrency } from '../formatters';

export interface ExpenseNotificationInput {
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

export function buildExpenseNotification(input: ExpenseNotificationInput): string {
  const source = input.paymentSource === 'bar' ? 'Бар' : 'Игровой клуб';
  const method = PAYMENT_METHOD_LABELS[input.paymentMethod] ?? input.paymentMethod;
  const lines = [
    '💸 Добавлен расход',
    '',
    `Сумма: ${formatCurrency(input.amount)} сум`,
    `Категория: ${input.category}`,
    `Источник: ${source}`,
    `Способ оплаты: ${method}`,
    `Дата: ${input.date}`,
  ];

  if (input.comment) lines.push(`Комментарий: ${input.comment}`);
  return lines.join('\n');
}

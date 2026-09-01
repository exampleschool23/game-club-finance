import { describe, expect, it } from 'vitest';
import { buildExpenseNotification } from './expenseNotification';

describe('buildExpenseNotification', () => {
  it('formats the saved expense for its club Telegram group', () => {
    expect(buildExpenseNotification({
      addedBy: 'Mehrinoz Amondullayeva',
      amount: 125000,
      category: 'repair',
      comment: 'Замена кабеля',
      date: '2026-09-01',
      paymentMethod: 'cash',
      paymentSource: 'game_club',
    })).toBe([
      '💸 Добавлен расход',
      '',
      'Сумма: 125 000 сум',
      'Категория: Ремонт',
      'Источник: Игровой клуб',
      'Способ оплаты: Наличные',
      'Дата: 1 сентября',
      'Добавил(а): Mehrinoz Amondullayeva',
      'Комментарий: Замена кабеля',
    ].join('\n'));
  });

  it('omits an absent comment and labels bar/card payments', () => {
    const message = buildExpenseNotification({
      addedBy: 'Алишер',
      amount: 50000,
      category: 'food_drinks',
      comment: null,
      date: '2026-09-01',
      paymentMethod: 'card',
      paymentSource: 'bar',
    });

    expect(message).toContain('Источник: Бар');
    expect(message).toContain('Способ оплаты: Карта');
    expect(message).toContain('Категория: Еда / Напитки');
    expect(message).not.toContain('Комментарий:');
  });
});

import { createClient } from '@/lib/supabase/server';
import { buildExpenseNotification } from '@/lib/telegram/expenseNotification';
import { sendTelegramMessage } from '@/lib/telegram/sendDailyFinanceReport';
import { PAYMENT_METHODS, type Expense } from '@/types';

const PAYMENT_SOURCES = ['game_club', 'bar'] as const;

interface ExpenseRequestBody {
  clubId?: unknown;
  date?: unknown;
  amount?: unknown;
  category?: unknown;
  paymentMethod?: unknown;
  paymentSource?: unknown;
  comment?: unknown;
}

interface ValidExpenseRequestBody {
  clubId: string;
  date: string;
  amount: number;
  category: string;
  paymentMethod: (typeof PAYMENT_METHODS)[number];
  paymentSource: (typeof PAYMENT_SOURCES)[number];
  comment?: string | null;
}

function targetChatId(clubId: string): string | null {
  const targets = [
    ['TELEGRAM_PIXEL_CLUB_ID', 'TELEGRAM_PIXEL_CHAT_ID'],
    ['TELEGRAM_MAIN_CLUB_ID', 'TELEGRAM_MAIN_CHAT_ID'],
    ['TELEGRAM_BUNKER_CLUB_ID', 'TELEGRAM_BUNKER_CHAT_ID'],
  ] as const;

  for (const [clubKey, chatKey] of targets) {
    if (process.env[clubKey] === clubId) return process.env[chatKey] ?? null;
  }
  return null;
}

function isValidBody(body: ExpenseRequestBody): body is ValidExpenseRequestBody {
  return typeof body.clubId === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(String(body.date))
    && typeof body.amount === 'number'
    && Number.isFinite(body.amount)
    && body.amount > 0
    && typeof body.category === 'string'
    && body.category.trim().length > 0
    && body.category.length <= 80
    && PAYMENT_METHODS.includes(body.paymentMethod as (typeof PAYMENT_METHODS)[number])
    && PAYMENT_SOURCES.includes(body.paymentSource as (typeof PAYMENT_SOURCES)[number])
    && (body.comment === null || body.comment === undefined || (typeof body.comment === 'string' && body.comment.length <= 300));
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null) as ExpenseRequestBody | null;
  if (!body || !isValidBody(body)) {
    return Response.json({ error: 'Invalid expense data' }, { status: 400 });
  }

  const { data, error } = await supabase.from('expenses').insert({
    club_id: body.clubId,
    date: body.date,
    amount: body.amount,
    category: body.category.trim(),
    payment_method: body.paymentMethod,
    payment_source: body.paymentSource,
    comment: typeof body.comment === 'string' && body.comment.trim() ? body.comment.trim() : null,
    created_by: user.id,
  }).select('*').single();

  if (error) return Response.json({ error: error.message }, { status: 400 });

  const expense = data as Expense;
  const chatId = targetChatId(expense.club_id);
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  let notificationSent = false;

  if (chatId && botToken) {
    try {
      await sendTelegramMessage({
        botToken,
        chatId,
        text: buildExpenseNotification({
          amount: Number(expense.amount),
          category: expense.category,
          comment: expense.comment,
          date: expense.date,
          paymentMethod: expense.payment_method,
          paymentSource: expense.payment_source,
        }),
      });
      notificationSent = true;
    } catch (notificationError) {
      console.error('[telegram/expense] notification failed', {
        clubId: expense.club_id,
        expenseId: expense.id,
        error: notificationError instanceof Error ? notificationError.message : String(notificationError),
      });
    }
  }

  return Response.json({ expense, notificationSent }, { status: 201 });
}

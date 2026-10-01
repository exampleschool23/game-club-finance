import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { targetChatId } from '@/lib/telegram/clubChat';
import { buildSalaryNotification, type SalaryNotificationInput } from '@/lib/telegram/salaryNotification';
import { sendTelegramMessage } from '@/lib/telegram/sendDailyFinanceReport';

type Body = Record<string, unknown>;
type Notification = SalaryNotificationInput extends infer T ? T extends unknown ? Omit<T, 'addedBy' | 'employee'> : never : never;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isId = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
const isDate = (value: unknown): value is string => typeof value === 'string' && DATE.test(value);
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isSalaryType = (value: unknown): value is 'daily' | 'monthly' => value === 'daily' || value === 'monthly';
const text = (value: unknown, max: number) => (typeof value === 'string' && value.length <= max ? value.trim() : null);

class BadRequest extends Error {}

async function actorName(supabase: SupabaseClient, user: User) {
  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
  return profile?.full_name?.trim()
    || (typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name.trim() : '')
    || user.email
    || user.id;
}

/** Best-effort: a Telegram problem never fails an already committed payroll change. */
async function notify(supabase: SupabaseClient, user: User, clubId: string, employeeId: string, notification: Notification) {
  const chatId = targetChatId(clubId);
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!chatId || !botToken) return false;
  try {
    const [{ data: employee }, addedBy] = await Promise.all([
      supabase.from('salary_employees').select('name').eq('club_id', clubId).eq('id', employeeId).maybeSingle(),
      actorName(supabase, user),
    ]);
    await sendTelegramMessage({
      botToken,
      chatId,
      text: buildSalaryNotification({ ...notification, employee: employee?.name ?? '—', addedBy } as SalaryNotificationInput),
    });
    return true;
  } catch (error) {
    console.error('[telegram/salary] notification failed', {
      clubId, employeeId, error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null) as Body | null;
  if (!body || !isId(body.clubId) || !isId(body.employeeId)) {
    return Response.json({ error: 'Invalid salary request' }, { status: 400 });
  }
  const clubId = body.clubId;
  const employeeId = body.employeeId;

  try {
    let notification: Notification | null = null;
    let rpcResult: { error: { message: string; code?: string } | null };

    switch (body.action) {
      case 'save_employee': {
        const name = text(body.name, 120);
        const jobTitle = text(body.jobTitle, 120);
        if (!name || jobTitle === null || !isDate(body.date) || !isSalaryType(body.salaryType)
          || !isNumber(body.amount) || !isNumber(body.kpi) || typeof body.active !== 'boolean') throw new BadRequest();
        const { data: existing } = await supabase.from('salary_employees').select('id').eq('club_id', clubId).eq('id', employeeId).maybeSingle();
        rpcResult = await supabase.rpc('save_salary_employee', {
          p_club_id: clubId, p_employee_id: employeeId, p_name: name, p_job_title: jobTitle,
          p_effective_date: body.date, p_salary_type: body.salaryType, p_amount: body.amount, p_kpi_percent: body.kpi, p_active: body.active,
        });
        notification = { event: existing ? 'employee_updated' : 'employee_added', role: jobTitle, salaryType: body.salaryType, amount: body.amount, kpi: body.kpi, date: body.date };
        break;
      }
      case 'change_term': {
        if ((body.kind !== 'salary' && body.kind !== 'kpi') || !isNumber(body.amount)) throw new BadRequest();
        const salaryType = body.kind === 'salary' ? body.salaryType : null;
        if (body.kind === 'salary' && !isSalaryType(salaryType)) throw new BadRequest();
        rpcResult = await supabase.rpc('change_salary_term', {
          p_club_id: clubId, p_employee_id: employeeId, p_kind: body.kind, p_amount: body.amount, p_salary_type: salaryType,
        });
        notification = body.kind === 'kpi'
          ? { event: 'kpi_changed', kpi: body.amount }
          : { event: 'salary_changed', salaryType: salaryType as 'daily' | 'monthly', amount: body.amount };
        break;
      }
      case 'change_role': {
        const role = text(body.jobTitle, 120);
        if (!role) throw new BadRequest();
        rpcResult = await supabase.rpc('change_salary_employee_role', { p_club_id: clubId, p_employee_id: employeeId, p_job_title: role });
        break;
      }
      case 'set_active': {
        if (typeof body.active !== 'boolean') throw new BadRequest();
        rpcResult = await supabase.rpc(body.active ? 'activate_salary_employee' : 'deactivate_salary_employee', { p_club_id: clubId, p_employee_id: employeeId });
        notification = { event: body.active ? 'activated' : 'deactivated' };
        break;
      }
      case 'record_entry': {
        if (!isId(body.requestId) || !isDate(body.date) || !isNumber(body.amount)
          || (body.kind !== 'payment' && body.kind !== 'bonus' && body.kind !== 'fine')) throw new BadRequest();
        const comment = text(body.comment, 1000);
        if (comment === null) throw new BadRequest();
        const paymentMethod = body.kind === 'payment' && typeof body.paymentMethod === 'string' ? body.paymentMethod : null;
        const paymentSource = body.kind === 'payment' && typeof body.paymentSource === 'string' ? body.paymentSource : null;
        // A retried request id is idempotent in the database, so it must not notify twice.
        const { data: existing } = await supabase.from('salary_entries').select('id').eq('club_id', clubId).eq('id', body.requestId).maybeSingle();
        rpcResult = await supabase.rpc('record_salary_entry', {
          p_club_id: clubId, p_employee_id: employeeId, p_request_id: body.requestId, p_date: body.date,
          p_kind: body.kind, p_amount: body.amount, p_comment: comment, p_payment_method: paymentMethod, p_payment_source: paymentSource,
        });
        if (!existing) notification = { event: body.kind, amount: body.amount, date: body.date, comment: comment || null, paymentMethod, paymentSource };
        break;
      }
      default:
        throw new BadRequest();
    }

    if (rpcResult.error) {
      console.error('[salaries] write failed', { action: body.action, clubId, code: rpcResult.error.code, error: rpcResult.error.message });
      const status = rpcResult.error.code === '42501' ? 403 : 400;
      return Response.json({ error: rpcResult.error.message, code: rpcResult.error.code ?? null }, { status });
    }

    const notificationSent = notification ? await notify(supabase, user, clubId, employeeId, notification) : false;
    return Response.json({ ok: true, notificationSent });
  } catch (error) {
    if (error instanceof BadRequest) return Response.json({ error: 'Invalid salary request' }, { status: 400 });
    throw error;
  }
}

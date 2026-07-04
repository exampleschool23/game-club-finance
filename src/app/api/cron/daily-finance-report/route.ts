import type { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import {
  buildDailyFinanceTelegramReport,
  isIsoDate,
  previousTashkentDateIso,
  sendTelegramMessage,
} from '@/lib/telegram/sendDailyFinanceReport';

export const dynamic = 'force-dynamic';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

interface TelegramReportTarget {
  key: 'pixel' | 'main';
  chatId: string;
  clubId: string;
}

function optionalTarget(
  key: TelegramReportTarget['key'],
  chatEnvName: string,
  clubEnvName: string,
): TelegramReportTarget | null {
  const chatId = process.env[chatEnvName];
  const clubId = process.env[clubEnvName];

  if (!chatId && !clubId) return null;
  if (!chatId || !clubId) {
    throw new Error(`Missing ${chatEnvName} or ${clubEnvName}`);
  }

  return { key, chatId, clubId };
}

function getTelegramReportTargets(): TelegramReportTarget[] {
  const targets = [
    optionalTarget('pixel', 'TELEGRAM_PIXEL_CHAT_ID', 'TELEGRAM_PIXEL_CLUB_ID'),
    optionalTarget('main', 'TELEGRAM_MAIN_CHAT_ID', 'TELEGRAM_MAIN_CLUB_ID'),
  ].filter((target): target is TelegramReportTarget => Boolean(target));

  if (targets.length === 0) {
    throw new Error('No Telegram report targets configured');
  }

  return targets;
}

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  return Boolean(cronSecret && request.headers.get('authorization') === `Bearer ${cronSecret}`);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const requestedDate = request.nextUrl.searchParams.get('date');
    const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';
    const businessDate = requestedDate ?? previousTashkentDateIso();

    if (!isIsoDate(businessDate)) {
      return Response.json({ ok: false, error: 'date must be YYYY-MM-DD' }, { status: 400 });
    }

    const botToken = requireEnv('TELEGRAM_BOT_TOKEN');
    const targets = getTelegramReportTargets();
    const supabase = createServiceClient();
    const reports = await Promise.all(
      targets.map(async (target) => ({
        target: target.key,
        ...(await buildDailyFinanceTelegramReport(supabase, {
          businessDate,
          chatId: target.chatId,
          clubId: target.clubId,
        })),
      })),
    );

    if (dryRun) {
      return Response.json({
        ok: true,
        dryRun: true,
        businessDate,
        reports: reports.map(({ target, businessDate: reportDate, message }) => ({
          target,
          businessDate: reportDate,
          message,
        })),
      });
    }

    const sent = await Promise.all(
      reports.map(async (report) => {
        const telegram = await sendTelegramMessage({
          botToken,
          chatId: report.chatId,
          text: report.message,
        });

        return {
          target: report.target,
          businessDate: report.businessDate,
          messageId: telegram.result.message_id,
        };
      }),
    );

    return Response.json({
      ok: true,
      businessDate,
      sent,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

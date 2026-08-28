import type { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import {
  buildDailyFinanceTelegramReport,
  isIsoDate,
  previousTashkentDateIso,
  sendTelegramMessage,
  sendTelegramPhoto,
  TelegramSendError,
} from '@/lib/telegram/sendDailyFinanceReport';
import {
  beginReportDispatch,
  claimReportDelivery,
  completeReportDelivery,
  describeUnknownError,
  resolveDeliveryKey,
  retryReportBuild,
  type ReportDeliveryClaim,
} from '@/lib/telegram/reportDelivery';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';
export const maxDuration = 60;

const MIN_CRON_SECRET_LENGTH = 16;
const CRON_SECRET_PATTERN = /^[A-Za-z0-9._~-]+$/;

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set('cache-control', 'no-store, no-cache, max-age=0, must-revalidate');
  headers.set('pragma', 'no-cache');
  headers.set('expires', '0');

  return Response.json(body, {
    ...init,
    headers,
  });
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

interface TelegramReportTarget {
  key: 'pixel' | 'main' | 'bunker';
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
    optionalTarget('bunker', 'TELEGRAM_BUNKER_CHAT_ID', 'TELEGRAM_BUNKER_CLUB_ID'),
  ].filter((target): target is TelegramReportTarget => Boolean(target));

  if (targets.length === 0) {
    throw new Error('No Telegram report targets configured');
  }

  return targets;
}

function filterTargets(
  targets: TelegramReportTarget[],
  targetKey: string | null,
): TelegramReportTarget[] {
  if (!targetKey) return targets;

  if (targetKey !== 'pixel' && targetKey !== 'main' && targetKey !== 'bunker') {
    throw new Error('target must be pixel, main, or bunker');
  }

  const selectedTarget = targets.find((target) => target.key === targetKey);
  if (!selectedTarget) {
    throw new Error(`Target ${targetKey} is not configured`);
  }

  return [selectedTarget];
}

function cronAuthorizationStatus(
  request: NextRequest,
): 'authorized' | 'unauthorized' | 'invalid_configuration' {
  const cronSecret = process.env.CRON_SECRET;

  if (
    !cronSecret
    || cronSecret.length < MIN_CRON_SECRET_LENGTH
    || !CRON_SECRET_PATTERN.test(cronSecret)
  ) {
    return 'invalid_configuration';
  }

  return request.headers.get('authorization') === `Bearer ${cronSecret}`
    ? 'authorized'
    : 'unauthorized';
}

function logDeliveryEvent(
  level: 'info' | 'warn' | 'error',
  event: string,
  fields: Record<string, unknown>,
) {
  const entry = JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    ...fields,
  });

  if (level === 'error') console.error(entry);
  else if (level === 'warn') console.warn(entry);
  else console.info(entry);
}

function failurePayload(stage: string, error: unknown) {
  return {
    stage,
    message: describeUnknownError(error).slice(0, 1_000),
  };
}

async function finalizeClaim(
  supabase: ReturnType<typeof createServiceClient>,
  claim: Extract<ReportDeliveryClaim, { outcome: 'claimed' }>,
  input: {
    outcome: 'sent' | 'failed' | 'manual_review';
    telegramAttemptCount: number;
    attemptHistory: Array<Record<string, unknown>>;
    telegramResult?: Record<string, unknown> | null;
    error?: Record<string, unknown> | null;
    retryNotBefore?: string | null;
  },
) {
  await retryReportBuild(
    () => completeReportDelivery(supabase, {
      deliveryId: claim.deliveryId,
      claimToken: claim.claimToken,
      ...input,
    }),
    { attempts: 3, delayMs: 200 },
  );
}

export async function GET(request: NextRequest) {
  const authorizationStatus = cronAuthorizationStatus(request);

  if (authorizationStatus === 'invalid_configuration') {
    logDeliveryEvent('error', 'telegram_report_cron_auth_misconfigured', {
      cronSecretPresent: Boolean(process.env.CRON_SECRET),
      cronSecretLength: process.env.CRON_SECRET?.length ?? 0,
    });
    return jsonNoStore(
      { ok: false, error: 'CRON_SECRET must be a header-safe random string of at least 16 characters' },
      { status: 500 },
    );
  }

  if (authorizationStatus === 'unauthorized') {
    const authorization = request.headers.get('authorization');
    logDeliveryEvent('error', 'telegram_report_cron_auth_failed', {
      authorizationPresent: Boolean(authorization),
      bearerTokenLength: authorization?.startsWith('Bearer ')
        ? authorization.length - 'Bearer '.length
        : null,
      userAgent: request.headers.get('user-agent'),
    });
    return new Response('Unauthorized', {
      status: 401,
      headers: {
        'cache-control': 'no-store, no-cache, max-age=0, must-revalidate',
      },
    });
  }

  try {
    const requestedDate = request.nextUrl.searchParams.get('date');
    const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';
    const targetKey = request.nextUrl.searchParams.get('target');
    const force = request.nextUrl.searchParams.get('force');
    const requestId = request.nextUrl.searchParams.get('requestId');
    const businessDate = requestedDate ?? previousTashkentDateIso();

    if (!isIsoDate(businessDate)) {
      return jsonNoStore({ ok: false, error: 'date must be YYYY-MM-DD' }, { status: 400 });
    }

    let deliveryKey: string;
    try {
      deliveryKey = resolveDeliveryKey({
        force,
        requestId,
        requestedDate,
        targetKey,
        dryRun,
      });
    } catch (error) {
      return jsonNoStore({ ok: false, error: describeUnknownError(error) }, { status: 400 });
    }

    const targets = filterTargets(getTelegramReportTargets(), targetKey);
    const supabase = createServiceClient();
    const buildReport = (target: TelegramReportTarget) => retryReportBuild(
      () => buildDailyFinanceTelegramReport(supabase, {
        businessDate,
        chatId: target.chatId,
        clubId: target.clubId,
      }),
    );

    if (dryRun) {
      const built = await Promise.allSettled(
        targets.map(async (target) => ({
          target: target.key,
          ...(await buildReport(target)),
        })),
      );
      const reports = built.map((result, index) => {
        const target = targets[index];

        if (result.status === 'fulfilled') {
          return {
            ok: true,
            target: result.value.target,
            businessDate: result.value.businessDate,
            message: result.value.message,
            caption: result.value.caption,
            image: {
              format: result.value.imagePng ? 'png' : 'text-fallback',
              fileName: result.value.imagePng ? result.value.imageFileName : null,
              bytes: result.value.imagePng?.byteLength ?? 0,
            },
          };
        }

        return {
          ok: false,
          target: target.key,
          businessDate,
          error: describeUnknownError(result.reason),
        };
      });
      const hasFailure = reports.some((report) => !report.ok);

      return jsonNoStore({
        ok: !hasFailure,
        dryRun: true,
        businessDate,
        reports,
      }, { status: hasFailure ? 500 : 200 });
    }

    const botToken = requireEnv('TELEGRAM_BOT_TOKEN');
    const results = await Promise.all(targets.map(async (target) => {
      let claim: ReportDeliveryClaim;

      try {
        claim = await retryReportBuild(
          () => claimReportDelivery(supabase, {
            businessDate,
            targetKey: target.key,
            clubId: target.clubId,
            chatId: target.chatId,
            deliveryKey,
          }),
          { attempts: 3, delayMs: 250 },
        );
      } catch (error) {
        const failure = failurePayload('claim', error);
        logDeliveryEvent('error', 'telegram_report_delivery_claim_failed', {
          businessDate,
          target: target.key,
          deliveryKey,
          error: failure.message,
        });
        return { ok: false, target: target.key, businessDate, ...failure };
      }

      if (claim.outcome === 'already_sent') {
        logDeliveryEvent('info', 'telegram_report_delivery_skipped', {
          businessDate,
          target: target.key,
          deliveryId: claim.deliveryId,
          reason: 'already_sent',
        });
        return {
          ok: true,
          target: target.key,
          businessDate,
          deliveryId: claim.deliveryId,
          status: 'already_sent',
          skipped: true,
          sentAt: claim.sentAt,
          telegram: claim.telegramResult,
        };
      }

      if (claim.outcome === 'in_progress') {
        logDeliveryEvent('info', 'telegram_report_delivery_skipped', {
          businessDate,
          target: target.key,
          deliveryId: claim.deliveryId,
          reason: 'in_progress',
          claimExpiresAt: claim.claimExpiresAt,
        });
        return {
          ok: true,
          target: target.key,
          businessDate,
          deliveryId: claim.deliveryId,
          status: 'in_progress',
          skipped: true,
          claimExpiresAt: claim.claimExpiresAt,
        };
      }

      if (claim.outcome === 'retry_deferred') {
        logDeliveryEvent('info', 'telegram_report_delivery_skipped', {
          businessDate,
          target: target.key,
          deliveryId: claim.deliveryId,
          reason: 'retry_deferred',
          retryNotBefore: claim.retryNotBefore,
        });
        return {
          ok: true,
          target: target.key,
          businessDate,
          deliveryId: claim.deliveryId,
          status: 'retry_deferred',
          skipped: true,
          retryNotBefore: claim.retryNotBefore,
        };
      }

      if (claim.outcome === 'manual_review') {
        logDeliveryEvent('error', 'telegram_report_delivery_manual_review', {
          businessDate,
          target: target.key,
          deliveryId: claim.deliveryId,
          dispatchStartedAt: claim.dispatchStartedAt,
          error: claim.lastError,
        });
        return {
          ok: false,
          target: target.key,
          businessDate,
          deliveryId: claim.deliveryId,
          status: 'manual_review',
          stage: 'manual_review',
          dispatchStartedAt: claim.dispatchStartedAt,
          error: claim.lastError,
        };
      }

      logDeliveryEvent('info', 'telegram_report_delivery_claimed', {
        businessDate,
        target: target.key,
        deliveryId: claim.deliveryId,
        claimCount: claim.claimCount,
      });

      let report;
      try {
        report = await buildReport(target);
      } catch (error) {
        const failure = failurePayload('build', error);
        const attemptHistory = [{
          stage: 'build',
          outcome: 'failed',
          timestamp: new Date().toISOString(),
          error: failure.message,
        }];
        let ledgerFinalized = true;

        try {
          await finalizeClaim(supabase, claim, {
            outcome: 'failed',
            telegramAttemptCount: 0,
            attemptHistory,
            error: failure,
          });
        } catch (finalizeError) {
          ledgerFinalized = false;
          logDeliveryEvent('error', 'telegram_report_delivery_finalize_failed', {
            businessDate,
            target: target.key,
            deliveryId: claim.deliveryId,
            error: describeUnknownError(finalizeError),
          });
        }

        logDeliveryEvent('error', 'telegram_report_delivery_failed', {
          businessDate,
          target: target.key,
          deliveryId: claim.deliveryId,
          stage: 'build',
          error: failure.message,
          ledgerFinalized,
        });
        return {
          ok: false,
          target: target.key,
          businessDate,
          deliveryId: claim.deliveryId,
          ledgerFinalized,
          ...failure,
        };
      }

      try {
        await retryReportBuild(
          () => beginReportDispatch(supabase, {
            deliveryId: claim.deliveryId,
            claimToken: claim.claimToken,
          }),
          { attempts: 3, delayMs: 200 },
        );
        logDeliveryEvent('info', 'telegram_report_dispatch_started', {
          businessDate,
          target: target.key,
          deliveryId: claim.deliveryId,
        });
      } catch (error) {
        const failure = failurePayload('begin_dispatch', error);
        logDeliveryEvent('error', 'telegram_report_dispatch_start_failed', {
          businessDate,
          target: target.key,
          deliveryId: claim.deliveryId,
          error: failure.message,
        });
        return {
          ok: false,
          target: target.key,
          businessDate,
          deliveryId: claim.deliveryId,
          ledgerStateUnknown: true,
          ...failure,
        };
      }

      try {
        const deliveryType = report.imagePng ? 'photo' : 'text';
        const telegram = report.imagePng
          ? await sendTelegramPhoto({
              botToken,
              chatId: report.chatId,
              imagePng: report.imagePng,
              imageFileName: report.imageFileName,
              caption: report.caption,
            })
          : await sendTelegramMessage({
              botToken,
              chatId: report.chatId,
              text: report.message,
            });
        const telegramResult = {
          deliveryType,
          messageId: telegram.result.message_id,
          chatId: telegram.result.chat.id,
          chatTitle: telegram.result.chat.title ?? null,
          chatType: telegram.result.chat.type,
          telegramDate: telegram.result.date,
        };

        try {
          await finalizeClaim(supabase, claim, {
            outcome: 'sent',
            telegramAttemptCount: telegram.attempts.length,
            attemptHistory: telegram.attempts,
            telegramResult,
          });
        } catch (error) {
          const failure = failurePayload('finalize', error);
          logDeliveryEvent('error', 'telegram_report_delivery_finalize_failed', {
            businessDate,
            target: target.key,
            deliveryId: claim.deliveryId,
            error: failure.message,
          });
          return {
            ok: false,
            target: target.key,
            businessDate,
            deliveryId: claim.deliveryId,
            telegramDelivered: true,
            ...failure,
          };
        }

        logDeliveryEvent('info', 'telegram_report_delivery_sent', {
          businessDate,
          target: target.key,
          deliveryId: claim.deliveryId,
          messageId: telegram.result.message_id,
          attempts: telegram.attempts.length,
        });
        return {
          ok: true,
          target: target.key,
          businessDate: report.businessDate,
          deliveryId: claim.deliveryId,
          status: 'sent',
          messageId: telegram.result.message_id,
          telegramChatId: telegram.result.chat.id,
          telegramChatTitle: telegram.result.chat.title ?? null,
          telegramChatType: telegram.result.chat.type,
          telegramDate: telegram.result.date,
          attempts: telegram.attempts.length,
        };
      } catch (error) {
        const telegramAttempts = error instanceof TelegramSendError ? error.attempts : [];
        const requiresManualReview = !(error instanceof TelegramSendError)
          || error.requiresManualReview;
        const retryNotBefore = !requiresManualReview
          && error instanceof TelegramSendError
          && error.retryAfterSeconds !== null
          ? new Date(Date.now() + error.retryAfterSeconds * 1_000).toISOString()
          : null;
        const failure = {
          ...failurePayload('telegram', error),
          retryable: error instanceof TelegramSendError ? error.retryable : true,
          requiresManualReview,
        };
        let ledgerFinalized = true;

        try {
          await finalizeClaim(supabase, claim, {
            outcome: requiresManualReview ? 'manual_review' : 'failed',
            telegramAttemptCount: telegramAttempts.length,
            attemptHistory: telegramAttempts,
            error: failure,
            retryNotBefore,
          });
        } catch (finalizeError) {
          ledgerFinalized = false;
          logDeliveryEvent('error', 'telegram_report_delivery_finalize_failed', {
            businessDate,
            target: target.key,
            deliveryId: claim.deliveryId,
            error: describeUnknownError(finalizeError),
          });
        }

        logDeliveryEvent('error', 'telegram_report_delivery_failed', {
          businessDate,
          target: target.key,
          deliveryId: claim.deliveryId,
          stage: 'telegram',
          attempts: telegramAttempts.length,
          error: failure.message,
          ledgerFinalized,
        });
        return {
          ok: false,
          target: target.key,
          businessDate,
          deliveryId: claim.deliveryId,
          attempts: telegramAttempts.length,
          ledgerFinalized,
          status: requiresManualReview ? 'manual_review' : 'failed',
          retryNotBefore,
          ...failure,
        };
      }
    }));
    const hasFailure = results.some((result) => !result.ok);

    logDeliveryEvent(hasFailure ? 'error' : 'info', 'telegram_report_delivery_batch_completed', {
      businessDate,
      force: force === '1',
      targets: results.map((result) => ({
        target: result.target,
        ok: result.ok,
        status: 'status' in result ? result.status : 'failed',
      })),
    });

    return jsonNoStore({
      ok: !hasFailure,
      businessDate,
      forced: force === '1',
      sent: results,
    }, { status: hasFailure ? 500 : 200 });
  } catch (error) {
    logDeliveryEvent('error', 'telegram_report_delivery_request_failed', {
      error: describeUnknownError(error).slice(0, 1_000),
    });
    return jsonNoStore(
      {
        ok: false,
        error: describeUnknownError(error),
      },
      { status: 500 },
    );
  }
}

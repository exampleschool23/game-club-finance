import { GET as handleDailyFinanceReport } from '../daily-finance-report/route';

// Distinct once-daily Vercel Cron path. It intentionally reuses the primary
// handler and its business-date delivery ledger, so only definite failures are
// retried and successful/ambiguous deliveries are never sent again.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const maxDuration = 60;
export const GET = handleDailyFinanceReport;

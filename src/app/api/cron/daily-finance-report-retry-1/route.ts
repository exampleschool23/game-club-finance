import { GET as handleDailyFinanceReport } from '../daily-finance-report/route';

// Manual recovery alias. It reuses the primary handler and its delivery ledger,
// so only definite failures are retried and successful/ambiguous deliveries are
// never sent again. Supabase Cron owns the production schedule.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const maxDuration = 60;
export const GET = handleDailyFinanceReport;

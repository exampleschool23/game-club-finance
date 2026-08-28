import { GET as handleDailyFinanceReport } from '../daily-finance-report/route';

// Second manual recovery alias; see retry-1 for the safety model.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const maxDuration = 60;
export const GET = handleDailyFinanceReport;

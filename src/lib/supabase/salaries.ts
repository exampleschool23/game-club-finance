import { createClient } from '@/lib/supabase/client';
import { fetchAllRows } from '@/lib/supabase/pagination';
import type { SalaryEmployee, SalaryEntry, SalaryRate } from '@/lib/calculations/salaries';
import type { OwnerProfitSnapshotPayload } from '@/lib/calculations/ownerProfitSnapshot';

export async function loadSalaries(clubId: string, throughDate: string) {
  const db = createClient();
  const [employees, rates, entries, profit] = await Promise.all([
    fetchAllRows<SalaryEmployee>(() => db.from('salary_employees').select('*').eq('club_id', clubId).order('id')),
    fetchAllRows<SalaryRate>(() => db.from('salary_rates').select('*').eq('club_id', clubId).order('id')),
    fetchAllRows<SalaryEntry>(() => db.from('salary_entries').select('*').eq('club_id', clubId).lte('date', throughDate).order('id')),
    db.rpc('get_salary_profit_snapshot', { p_club_id: clubId, p_through_date: throughDate }),
  ]);
  const error = [employees.error, rates.error, entries.error, profit.error].find(Boolean);
  if (error) throw error;
  return {
    employees: employees.data ?? [], rates: rates.data ?? [], entries: entries.data ?? [],
    monthlyProfit: (profit.data as OwnerProfitSnapshotPayload).monthlyBalances,
  };
}

import { redirect } from 'next/navigation';

export default function LegacyIncomeRedirect() {
  redirect('/daily-cash');
}

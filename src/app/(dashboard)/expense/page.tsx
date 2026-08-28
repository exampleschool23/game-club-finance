import { redirect } from 'next/navigation';

export default function LegacyExpenseRedirect() {
  redirect('/reports');
}

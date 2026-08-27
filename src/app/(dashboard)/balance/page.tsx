import { redirect } from 'next/navigation';

export default function LegacyBalanceRedirect() {
  redirect('/expenses');
}

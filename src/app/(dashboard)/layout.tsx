import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DashboardShell } from '@/components/layout/DashboardShell';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  // getUser() verifies the JWT with Supabase Auth (secure)
  // Layout only runs on first load / hard refresh, not on client navigations
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single();

  return (
    <DashboardShell
      role={profile?.role ?? 'cashier'}
      fullName={profile?.full_name ?? user.email ?? ''}
    >
      {children}
    </DashboardShell>
  );
}

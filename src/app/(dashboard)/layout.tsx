import { redirect } from 'next/navigation';
import { createClient, getServerProfile } from '@/lib/supabase/server';
import { DashboardShell } from '@/components/layout/DashboardShell';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  // getSession() reads from the cookie — no Supabase Auth network call.
  // Security is enforced by middleware (which does getUser-level validation).
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    redirect('/login');
  }

  // getServerProfile is cached with React cache() — one DB query per request
  // even if multiple server components call it.
  const profile = await getServerProfile();

  return (
    <DashboardShell
      role={profile?.role ?? 'viewer'}
      fullName={profile?.full_name ?? session.user.email ?? ''}
    >
      {children}
    </DashboardShell>
  );
}

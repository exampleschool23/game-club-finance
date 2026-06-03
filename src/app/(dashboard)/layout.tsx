import { redirect } from 'next/navigation';
import { getServerProfile, getServerUser } from '@/lib/supabase/server';
import { DashboardShell } from '@/components/layout/DashboardShell';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getServerUser();

  if (!user) {
    redirect('/login');
  }

  // getServerProfile is cached with React cache() — one DB query per request
  // even if multiple server components call it.
  const profile = await getServerProfile();

  return (
    <DashboardShell
      role={profile?.role ?? 'viewer'}
      fullName={profile?.full_name ?? user.email ?? ''}
    >
      {children}
    </DashboardShell>
  );
}

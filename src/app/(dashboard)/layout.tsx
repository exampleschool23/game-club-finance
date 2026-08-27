import { DashboardShell } from '@/components/layout/DashboardShell';
import { getDashboardBootstrap } from '@/lib/supabase/dashboardBootstrap';
import { redirect } from 'next/navigation';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const bootstrap = await getDashboardBootstrap();
  if (!bootstrap) redirect('/login');

  return (
    <DashboardShell
      initialEmail={bootstrap.initialEmail}
      initialFullName={bootstrap.initialFullName}
      initialProfileRole={bootstrap.initialRole}
      initialMembershipRows={bootstrap.initialMemberships}
      initialSelectedClubId={bootstrap.initialSelectedClubId}
    >
      {children}
    </DashboardShell>
  );
}

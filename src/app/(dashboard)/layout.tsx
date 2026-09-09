import { DashboardShell } from '@/components/layout/DashboardShell';
import { getDashboardBootstrap } from '@/lib/supabase/dashboardBootstrap';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { DashboardContentLoading } from '@/components/layout/DashboardContentLoading';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={
      <main className="mx-auto w-full max-w-7xl p-4 sm:p-8" aria-busy="true">
        <DashboardContentLoading />
      </main>
    }>
      <AuthenticatedDashboardLayout>{children}</AuthenticatedDashboardLayout>
    </Suspense>
  );
}

async function AuthenticatedDashboardLayout({
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

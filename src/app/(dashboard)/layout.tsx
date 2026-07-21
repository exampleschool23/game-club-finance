import { DashboardShell } from '@/components/layout/DashboardShell';
import { createClient } from '@/lib/supabase/server';
import type { ClubMembership, UserRole } from '@/types';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let initialEmail = '';
  let initialFullName = '';
  let initialRole: UserRole = 'viewer';
  let initialMemberships: ClubMembership[] = [];

  if (user) {
    const [profileRes, membershipRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', user.id)
        .maybeSingle(),
      supabase
        .from('club_memberships')
        .select('club_id,user_id,role,created_at,updated_at,clubs(id,name,address,business_day_start_hour,is_active,created_at,updated_at)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true }),
    ]);

    initialEmail = user.email ?? '';
    initialFullName = profileRes.data?.full_name ?? initialEmail;
    initialRole = (profileRes.data?.role as UserRole | null) ?? 'viewer';
    initialMemberships = (membershipRes.data as ClubMembership[] | null) ?? [];
  }

  return (
    <DashboardShell
      initialEmail={initialEmail}
      initialFullName={initialFullName}
      initialProfileRole={initialRole}
      initialMembershipRows={initialMemberships}
    >
      {children}
    </DashboardShell>
  );
}

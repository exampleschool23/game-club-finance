import { DashboardShell } from '@/components/layout/DashboardShell';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ClubMembership, UserRole } from '@/types';

const SELECTED_CLUB_COOKIE = 'game-club-finance-selected-club-id';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  let initialEmail = user.email ?? '';
  let initialFullName = '';
  let initialRole: UserRole = 'viewer';
  let initialMemberships: ClubMembership[] = [];

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

  initialFullName = profileRes.data?.full_name ?? initialEmail;
  initialRole = (profileRes.data?.role as UserRole | null) ?? 'viewer';
  initialMemberships = (membershipRes.data as ClubMembership[] | null) ?? [];

  const cookieStore = await cookies();
  const preferredClubId = cookieStore.get(SELECTED_CLUB_COOKIE)?.value ?? '';
  const initialSelectedClubId = initialMemberships.some((membership) => membership.club_id === preferredClubId)
    ? preferredClubId
    : initialMemberships[0]?.club_id ?? '';

  return (
    <DashboardShell
      initialEmail={initialEmail}
      initialFullName={initialFullName}
      initialProfileRole={initialRole}
      initialMembershipRows={initialMemberships}
      initialSelectedClubId={initialSelectedClubId}
    >
      {children}
    </DashboardShell>
  );
}

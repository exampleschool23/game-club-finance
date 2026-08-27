import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import type { ClubMembership, UserRole } from '@/types';
import { isMissingDatabaseColumn } from './errors';
import { createClient } from './server';

const SELECTED_CLUB_COOKIE = 'game-club-finance-selected-club-id';

export interface DashboardBootstrap {
  initialEmail: string;
  initialFullName: string;
  initialMemberships: ClubMembership[];
  initialRole: UserRole;
  initialSelectedClubId: string;
  userId: string;
}

/**
 * Shared by the dashboard layout and index page. React cache keeps auth,
 * profile, and membership lookup to one server-side bootstrap per request.
 */
export const getDashboardBootstrap = cache(async (): Promise<DashboardBootstrap | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [profileRes, membershipRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name, role')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('club_memberships')
      .select('club_id,user_id,role,feature_access,created_at,updated_at,clubs(id,name,address,business_day_start_hour,is_active,created_at,updated_at)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true }),
  ]);

  let memberships = (membershipRes.data as ClubMembership[] | null) ?? [];
  if (isMissingDatabaseColumn(membershipRes.error, 'feature_access')) {
    const fallbackMembershipRes = await supabase
      .from('club_memberships')
      .select('club_id,user_id,role,created_at,updated_at,clubs(id,name,address,business_day_start_hour,is_active,created_at,updated_at)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    memberships = (fallbackMembershipRes.data as ClubMembership[] | null) ?? [];
  }

  const cookieStore = await cookies();
  const preferredClubId = cookieStore.get(SELECTED_CLUB_COOKIE)?.value ?? '';
  const initialSelectedClubId = memberships.some((membership) => membership.club_id === preferredClubId)
    ? preferredClubId
    : memberships[0]?.club_id ?? '';

  const initialEmail = user.email ?? '';
  return {
    initialEmail,
    initialFullName: profileRes.data?.full_name ?? initialEmail,
    initialMemberships: memberships,
    initialRole: (profileRes.data?.role as UserRole | null) ?? 'viewer',
    initialSelectedClubId,
    userId: user.id,
  };
});


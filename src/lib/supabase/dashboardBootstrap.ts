import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import type { ClubMembership, UserRole } from '@/types';
import { isMissingDatabaseColumn, isMissingDatabaseFunction } from './errors';
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

interface DashboardBootstrapSnapshot {
  profile: {
    full_name: string | null;
    role: UserRole | null;
  } | null;
  memberships: ClubMembership[];
}

/**
 * Shared by the dashboard layout and index page. React cache keeps auth,
 * profile, and membership lookup to one server-side bootstrap per request.
 */
export const getDashboardBootstrap = cache(async (): Promise<DashboardBootstrap | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const snapshotRes = await supabase.rpc('get_dashboard_bootstrap');
  let profile: DashboardBootstrapSnapshot['profile'] = null;
  let memberships: ClubMembership[] = [];

  if (!snapshotRes.error) {
    const snapshot = snapshotRes.data as DashboardBootstrapSnapshot;
    profile = snapshot.profile;
    memberships = snapshot.memberships ?? [];
  } else if (isMissingDatabaseFunction(snapshotRes.error, 'get_dashboard_bootstrap')) {
    // Compatibility path while migration 048 is being deployed.
    const [profileRes, membershipRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', user.id)
        .maybeSingle(),
      supabase
        .from('club_memberships')
        .select('club_id,user_id,role,feature_access,created_at,updated_at,clubs(id,name,address,business_day_start_hour,enabled_payment_methods,is_active,created_at,updated_at)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true }),
    ]);

    profile = profileRes.data as DashboardBootstrapSnapshot['profile'];
    memberships = (membershipRes.data as ClubMembership[] | null) ?? [];
    if (isMissingDatabaseColumn(membershipRes.error, 'enabled_payment_methods')) {
      const withoutPaymentMethodsRes = await supabase
        .from('club_memberships')
        .select('club_id,user_id,role,feature_access,created_at,updated_at,clubs(id,name,address,business_day_start_hour,is_active,created_at,updated_at)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });
      memberships = (withoutPaymentMethodsRes.data as ClubMembership[] | null) ?? [];

      if (isMissingDatabaseColumn(withoutPaymentMethodsRes.error, 'feature_access')) {
        const legacyMembershipRes = await supabase
          .from('club_memberships')
          .select('club_id,user_id,role,created_at,updated_at,clubs(id,name,address,business_day_start_hour,is_active,created_at,updated_at)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true });
        memberships = (legacyMembershipRes.data as ClubMembership[] | null) ?? [];
      }
    } else if (isMissingDatabaseColumn(membershipRes.error, 'feature_access')) {
      const withoutFeatureAccessRes = await supabase
        .from('club_memberships')
        .select('club_id,user_id,role,created_at,updated_at,clubs(id,name,address,business_day_start_hour,enabled_payment_methods,is_active,created_at,updated_at)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });
      memberships = (withoutFeatureAccessRes.data as ClubMembership[] | null) ?? [];

      if (isMissingDatabaseColumn(withoutFeatureAccessRes.error, 'enabled_payment_methods')) {
        const legacyMembershipRes = await supabase
          .from('club_memberships')
          .select('club_id,user_id,role,created_at,updated_at,clubs(id,name,address,business_day_start_hour,is_active,created_at,updated_at)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true });
        memberships = (legacyMembershipRes.data as ClubMembership[] | null) ?? [];
      }
    }
  } else {
    // Null means unauthenticated to the layout. Returning it for a database
    // outage loops between /login (valid session) and the dashboard.
    throw new Error('Could not load dashboard account data. Please try again.');
  }

  const cookieStore = await cookies();
  const preferredClubId = cookieStore.get(SELECTED_CLUB_COOKIE)?.value ?? '';
  const initialSelectedClubId = memberships.some((membership) => membership.club_id === preferredClubId)
    ? preferredClubId
    : memberships[0]?.club_id ?? '';

  const initialEmail = user.email ?? '';
  return {
    initialEmail,
    initialFullName: profile?.full_name ?? initialEmail,
    initialMemberships: memberships,
    initialRole: profile?.role ?? 'viewer',
    initialSelectedClubId,
    userId: user.id,
  };
});

import DashboardPage from './DashboardPage';
import type { Club, ClubMembership } from '@/types';
import { normalizeBusinessDayStartHour, todayIso } from '@/lib/utils';
import { createClient } from '@/lib/supabase/server';
import { getDashboardBootstrap } from '@/lib/supabase/dashboardBootstrap';
import {
  dashboardPeriodForRange,
  initialDashboardRange,
} from '@/lib/calculations/dashboardRangeState';
import {
  getDashboardComparisonRange,
  getDashboardRange,
  type InventorySnapshotRow,
} from '@/lib/calculations/dashboardMetrics';
import {
  buildDashboardDataFromSnapshot,
  type DashboardSnapshotPayload,
} from '@/lib/calculations/dashboardSnapshot';

type PageSearchParams = Record<string, string | string[] | undefined>;

function relatedClub(relation: ClubMembership['clubs']): Club | null {
  if (!relation) return null;
  return Array.isArray(relation) ? relation[0] ?? null : relation;
}

function selectedMembership(
  memberships: ClubMembership[],
  clubId: string,
) {
  return memberships.find((membership) => membership.club_id === clubId);
}

export default async function DashboardRoute({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const [bootstrap, resolvedSearchParams] = await Promise.all([
    getDashboardBootstrap(),
    searchParams,
  ]);

  if (!bootstrap?.initialSelectedClubId) return <DashboardPage />;

  const membership = selectedMembership(
    bootstrap.initialMemberships,
    bootstrap.initialSelectedClubId,
  );
  const club = relatedClub(membership?.clubs ?? null);
  if (!club) return <DashboardPage />;

  const query = {
    get(name: string) {
      const value = resolvedSearchParams[name];
      return typeof value === 'string' ? value : null;
    },
  };
  const businessToday = todayIso(
    new Date(),
    normalizeBusinessDayStartHour(club.business_day_start_hour),
  );
  const range = initialDashboardRange(query, businessToday);
  const period = dashboardPeriodForRange(range, businessToday);
  const previousRange = getDashboardComparisonRange(period, range);
  const lastMonthRange = getDashboardRange('lastMonth', businessToday);
  const inventoryComparisonRange = period === 'lastMonth' ? previousRange : lastMonthRange;
  const supabase = await createClient();
  const snapshotResult = await supabase.rpc('get_dashboard_snapshot', {
    p_club_id: bootstrap.initialSelectedClubId,
    p_range_from: range.from,
    p_range_to: range.to,
    p_previous_from: previousRange.from,
    p_previous_to: previousRange.to,
    p_inventory_from: inventoryComparisonRange.from,
    p_inventory_to: inventoryComparisonRange.to,
  });

  if (snapshotResult.error) return <DashboardPage />;

  const snapshot = snapshotResult.data as Omit<DashboardSnapshotPayload, 'inventoryRows'> & {
    inventoryRows?: InventorySnapshotRow[];
  };
  const data = buildDashboardDataFromSnapshot({
    period,
    range,
    previousRange,
    inventoryComparisonRange,
    payload: {
      ...snapshot,
      inventoryRows: snapshot.inventoryRows ?? snapshot.stockRows as unknown as InventorySnapshotRow[],
    },
  });

  return (
    <DashboardPage
      initialSnapshot={{
        clubId: bootstrap.initialSelectedClubId,
        data,
        range,
      }}
    />
  );
}

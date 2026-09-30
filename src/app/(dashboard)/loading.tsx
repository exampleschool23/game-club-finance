import { PageSkeleton } from '@/components/PresentationFoundation';

/** Shown inside the shell the moment a sidebar item is tapped, until the route arrives. */
export default function DashboardLoading() {
  return <PageSkeleton />;
}

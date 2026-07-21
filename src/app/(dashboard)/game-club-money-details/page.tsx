import GameClubMoneyDetailsPage from './GameClubMoneyDetailsPage';

export default function Page({
  searchParams,
}: {
  searchParams: { from?: string; to?: string };
}) {
  return <GameClubMoneyDetailsPage requestedFrom={searchParams.from} requestedTo={searchParams.to} />;
}

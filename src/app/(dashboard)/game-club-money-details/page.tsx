import GameClubMoneyDetailsPage from './GameClubMoneyDetailsPage';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  return <GameClubMoneyDetailsPage requestedFrom={from} requestedTo={to} />;
}

import BarMoneyDetailsPage from './BarMoneyDetailsPage';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  return <BarMoneyDetailsPage requestedFrom={from} requestedTo={to} />;
}

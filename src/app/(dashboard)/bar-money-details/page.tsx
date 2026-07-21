import BarMoneyDetailsPage from './BarMoneyDetailsPage';

export default function Page({
  searchParams,
}: {
  searchParams: { from?: string; to?: string };
}) {
  return <BarMoneyDetailsPage requestedFrom={searchParams.from} requestedTo={searchParams.to} />;
}

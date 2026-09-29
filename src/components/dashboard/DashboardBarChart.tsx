import { ChartCard, HorizontalBars } from './ChartCard';

interface DashboardBarChartProps {
  title: string;
  data: Array<{ name: string; value: number; fill: string }>;
}

export function DashboardBarChart({ title, data }: DashboardBarChartProps) {
  return (
    <ChartCard title={title} className="min-h-72">
      <div className="mt-4">
        <HorizontalBars data={data.map((item) => ({ name: item.name, value: item.value, color: item.fill }))} />
      </div>
    </ChartCard>
  );
}

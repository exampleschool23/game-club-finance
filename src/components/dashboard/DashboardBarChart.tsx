import { ChartCard, HorizontalBars } from './ChartCard';

interface DashboardBarChartProps {
  title: string;
  data: Array<{ name: string; value: number; fill: string }>;
}

/** Income vs expenses as a horizontal bar list (one row per figure). */
export function DashboardBarChart({ title, data }: DashboardBarChartProps) {
  return (
    <ChartCard title={title}>
      <div className="mt-4">
        <HorizontalBars data={data.map((item) => ({ name: item.name, value: item.value, color: item.fill }))} />
      </div>
    </ChartCard>
  );
}

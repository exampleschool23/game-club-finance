'use client';

import { PieBreakdownChart, type PieBreakdownChartProps } from './PieBreakdownChart';

export function PaymentMethodChart(props: Pick<PieBreakdownChartProps, 'title' | 'data' | 'total'>) {
  return <PieBreakdownChart {...props} />;
}

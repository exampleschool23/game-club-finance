import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import type { DailyFinanceReportInput } from './dailyFinanceReport';
import {
  buildDailyFinanceReportSvg,
  renderDailyFinanceReportPng,
} from './dailyFinanceReportImage';

function reportInput(): DailyFinanceReportInput {
  return {
    clubName: 'Main Game Club',
    businessDateLabel: '27 августа 2026',
    gameClubIncome: 1_431_000,
    computerIncome: 1_431_000,
    debtIncome: 0,
    playstationIncome: 0,
    barSales: 375_500,
    stockPurchases: 489_948,
    totalExpenses: 687_000,
    gameClubExpenses: 526_000,
    barExpenses: 161_000,
    gameClubExpenseCategories: [
      { name: 'Зарплата', amount: 480_000 },
      { name: 'SKIDKA & bonus', amount: 46_000 },
    ],
    barExpenseCategories: [
      { name: 'Sasiska', amount: 145_000 },
      { name: 'NON', amount: 16_000 },
    ],
    gameClubMoneyLeft: 37_830_000,
    averageDailyGameClubIncome: 2_323_741,
    barMoneyLeft: 10_086_526,
    inventoryValue: 23_749_204,
    activeDebts: 474_000,
  };
}

describe('daily finance report image', () => {
  it('builds deterministic SVG with escaped labels and exact calculated values', () => {
    const svg = buildDailyFinanceReportSvg(reportInput());

    expect(svg).toContain('width="1254"');
    expect(svg).toContain('ДОХОД КЛУБА');
    expect(svg).toContain('1 431 000 UZS');
    expect(svg).toContain('SKIDKA &amp; bonus');
    expect(svg).toContain('ДОХОД БАРА');
    expect(svg).toContain('10 086 526 UZS');
    expect(svg).toContain('АКТИВНЫЕ ДОЛГИ');
    expect(svg).toContain('474 000 UZS');
    expect(svg).not.toContain('Ежедневный финансовый отчёт');
    expect(buildDailyFinanceReportSvg(reportInput())).toBe(svg);
  });

  it('renders the SVG into a real PNG buffer', async () => {
    const png = await renderDailyFinanceReportPng(reportInput());
    const metadata = await sharp(png).metadata();

    expect(png.subarray(0, 8)).toEqual(Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]));
    expect(metadata).toMatchObject({
      format: 'png',
      width: 1254,
      channels: 4,
    });
    expect(metadata.height).toBeGreaterThan(1_100);
  });
});

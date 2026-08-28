import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
    dailyRevenue: 1_806_500,
    gameClubIncome: 1_431_000,
    computerIncome: 1_431_000,
    debtIncome: 0,
    playstationIncome: 0,
    barSales: 375_500,
    barCost: 210_000,
    grossProfit: 1_596_500,
    netProfit: 909_500,
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
    salaryCosts: 480_000,
    kpiCosts: 46_000,
    rentCosts: 80_000,
    utilitiesCosts: 45_000,
    otherOperatingCosts: 36_000,
    monthToDateRevenue: 58_240_000,
    averageDailyRevenue: 2_240_000,
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

    expect(svg).toContain('width="1200"');
    expect(svg).toContain('GAME CLUB · ФИНАНСОВЫЙ ОТЧЁТ');
    expect(svg).toContain('Рабочий день: 27 августа 2026');
    expect(svg).toContain('ВЫРУЧКА ЗА ДЕНЬ');
    expect(svg).toContain('1 806 500 UZS');
    expect(svg).toContain('KPI и бонусы');
    expect(svg).toContain('ВАЛОВАЯ ПРИБЫЛЬ');
    expect(svg).toContain('ЧИСТАЯ ПРИБЫЛЬ');
    expect(svg).toContain('МЕСЯЦ НА ТЕКУЩУЮ ДАТУ');
    expect(svg).toContain('474 000 UZS');
    expect(svg).toContain('font-family="Noto Sans"');
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
      width: 1200,
      channels: 4,
    });
    expect(metadata.height).toBe(1540);
  });

  it('configures the bundled Noto Sans directory through FONTCONFIG_FILE', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/lib/telegram/dailyFinanceReportImage.ts'), 'utf8');

    expect(source).toContain("'notosans-fontface', 'fonts'");
    expect(source).toContain('process.env.FONTCONFIG_FILE = configPath');
    expect(source).toMatch(/configureReportFonts\(\);[\s\S]*sharp\(Buffer\.from\(svg\)\)/);
  });
});

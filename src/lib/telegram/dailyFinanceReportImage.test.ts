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
    averageDailyGameClubIncomeChange: 12,
    barMoneyLeftChange: -5,
    inventoryValueChange: 20,
    activeDebts: 474_000,
  };
}

function fontHasCodePoint(font: Buffer, codePoint: number): boolean {
  const tableCount = font.readUInt16BE(4);
  let cmapOffset = -1;

  for (let index = 0; index < tableCount; index += 1) {
    const tableOffset = 12 + index * 16;
    if (font.toString('ascii', tableOffset, tableOffset + 4) === 'cmap') {
      cmapOffset = font.readUInt32BE(tableOffset + 8);
      break;
    }
  }

  if (cmapOffset < 0) return false;
  const encodingCount = font.readUInt16BE(cmapOffset + 2);

  for (let index = 0; index < encodingCount; index += 1) {
    const subtableOffset = cmapOffset + font.readUInt32BE(cmapOffset + 8 + index * 8);
    if (font.readUInt16BE(subtableOffset) !== 4) continue;
    const segmentCount = font.readUInt16BE(subtableOffset + 6) / 2;
    const endCodesOffset = subtableOffset + 14;
    const startCodesOffset = endCodesOffset + segmentCount * 2 + 2;

    for (let segment = 0; segment < segmentCount; segment += 1) {
      const start = font.readUInt16BE(startCodesOffset + segment * 2);
      const end = font.readUInt16BE(endCodesOffset + segment * 2);
      if (codePoint >= start && codePoint <= end) return true;
    }
  }

  return false;
}

describe('daily finance report image', () => {
  it('builds deterministic SVG with escaped labels and exact calculated values', () => {
    const svg = buildDailyFinanceReportSvg(reportInput());

    expect(svg).toContain('width="1200"');
    expect(svg).toContain('height="1468"');
    expect(svg).not.toContain('GAME CLUB · ФИНАНСОВЫЙ ОТЧЁТ');
    expect(svg).not.toContain('Рабочий день: 27 августа 2026');
    expect(svg).not.toContain('url(#header)');
    expect(svg).toContain('ДОХОД КЛУБА — 1 431 000 UZS');
    expect(svg).toContain('ДОХОД БАРА — 375 500 UZS');
    expect(svg).toContain('РАСХОДЫ КЛУБА — 526 000 UZS');
    expect(svg).toContain('РАСХОДЫ БАРА — 161 000 UZS');
    expect(svg).toContain('ОБЩИЕ РАСХОДЫ — 687 000 UZS');
    expect(svg).toContain('SKIDKA &amp; bonus');
    expect(svg).toContain('ОСТАТОК ДЕНЕГ КЛУБА ЗА МЕСЯЦ');
    expect(svg).toContain('СРЕДНИЙ ДНЕВНОЙ ДОХОД КЛУБА');
    expect(svg).toContain('ДОХОД БАРА ЗА МЕСЯЦ');
    expect(svg).toContain('СТОИМОСТЬ СКЛАДА');
    expect(svg).toContain('АКТИВНЫЕ ДОЛГИ');
    expect(svg).toContain('▲ 12% к прошлому месяцу');
    expect(svg).toContain('▼ 5% к прошлому месяцу');
    expect(svg).toContain('▲ 20% к прошлому месяцу');
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
    expect(metadata.height).toBe(1468);
  });

  it('configures application-owned Noto Sans before the static Sharp import', () => {
    const rendererSource = readFileSync(
      resolve(process.cwd(), 'src/lib/telegram/dailyFinanceReportImage.ts'),
      'utf8',
    );
    const fontConfigSource = readFileSync(
      resolve(process.cwd(), 'src/lib/telegram/reportFontConfig.ts'),
      'utf8',
    );

    expect(rendererSource.indexOf("import './reportFontConfig';"))
      .toBeLessThan(rendererSource.indexOf("import sharp from 'sharp';"));
    expect(fontConfigSource).toContain("'src', 'assets', 'fonts'");
    expect(fontConfigSource).toContain('process.env.FONTCONFIG_FILE = configPath');
    expect(fontConfigSource).toContain('process.env.FONTCONFIG_PATH = configDirectory');
    expect(rendererSource).toContain('assertReportFontsAvailable();');
  });

  it('bundles real TrueType Noto Sans files instead of relying on host fonts', () => {
    for (const fileName of [
      'NotoSans-Regular.ttf',
      'NotoSans-Bold.ttf',
      'NotoSans-ExtraBold.ttf',
    ]) {
      const font = readFileSync(resolve(process.cwd(), 'src/assets/fonts', fileName));
      expect(font.subarray(0, 4)).toEqual(Buffer.from([0x00, 0x01, 0x00, 0x00]));
      expect(font.byteLength).toBeGreaterThan(500_000);
      expect(fontHasCodePoint(font, 'Ё'.codePointAt(0)!)).toBe(true);
      expect(fontHasCodePoint(font, 'я'.codePointAt(0)!)).toBe(true);
    }
  });
});

import './reportFontConfig';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { formatCurrency } from '../formatters';
import type { DailyFinanceReportInput } from './dailyFinanceReport';
import { REPORT_FONT_DIRECTORY, REPORT_FONT_FILES } from './reportFontConfig';

const WIDTH = 1200;
const INK = '#173B3F';
const MUTED = '#70817E';
const ORANGE = '#F97316';
const PURPLE = '#A855F7';
const BLUE = '#3B82F6';
const RED = '#DC2626';

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  })[character] ?? character);
}

function assertReportFontsAvailable() {
  const missingFonts = REPORT_FONT_FILES.filter(
    (fileName) => !existsSync(join(REPORT_FONT_DIRECTORY, fileName)),
  );

  if (missingFonts.length > 0) {
    throw new Error(`Bundled report fonts are missing: ${missingFonts.join(', ')}`);
  }
}

function money(value: number): string {
  return `${formatCurrency(Math.round(value))} UZS`;
}

function detailRow(label: string, value: number, y: number, color: string, outlined = false): string {
  return `<circle cx="112" cy="${y - 9}" r="8" fill="${color}"/>
    <text x="140" y="${y}" font-size="28" font-weight="650" fill="#4D5A59">${escapeXml(label)}</text>
    ${outlined ? `<circle cx="112" cy="${y - 9}" r="8" fill="#FFFFFF" stroke="${color}" stroke-width="4"/>` : ''}
    <text x="1090" y="${y}" text-anchor="end" font-size="29" font-weight="750" fill="${INK}">${escapeXml(money(value))}</text>`;
}

function summaryCard(x: number, y: number, label: string, value: number, color: string): string {
  return `<rect x="${x}" y="${y}" width="517" height="166" rx="28" fill="#FFFFFF" stroke="#DDE8E5" stroke-width="2"/>
    <rect x="${x + 28}" y="${y + 26}" width="10" height="114" rx="5" fill="${color}"/>
    <text x="${x + 62}" y="${y + 52}" font-size="20" font-weight="800" letter-spacing="1" fill="${MUTED}">${escapeXml(label)}</text>
    <text x="${x + 62}" y="${y + 117}" font-size="31" font-weight="850" fill="${color}">${escapeXml(money(value))}</text>`;
}

export function buildDailyFinanceReportSvg(input: DailyFinanceReportInput): string {
  const clubExpenseRows = input.gameClubExpenseCategories.length > 5
    ? [
        ...input.gameClubExpenseCategories.slice(0, 4),
        {
          name: 'Прочие расходы',
          amount: input.gameClubExpenseCategories
            .slice(4)
            .reduce((sum, category) => sum + category.amount, 0),
        },
      ]
    : input.gameClubExpenseCategories;
  const visibleClubExpenseRows = clubExpenseRows.length > 0
    ? clubExpenseRows
    : [{ name: 'Нет расходов', amount: 0 }];
  const clubExpenseRowsSvg = visibleClubExpenseRows
    .map((category, index) => detailRow(category.name, category.amount, 449 + index * 44, RED, true))
    .join('\n    ');
  const clubCardBottom = 442 + visibleClubExpenseRows.length * 44;
  const clubCardHeight = clubCardBottom - 68;
  const barY = clubCardBottom + 24;
  const totalExpensesY = barY + 302;
  const firstSummaryY = totalExpensesY + 110;
  const secondSummaryY = firstSummaryY + 190;
  const activeDebtsY = secondSummaryY + 190;
  const height = activeDebtsY + 122;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}">
  <rect width="${WIDTH}" height="${height}" rx="52" fill="#EAF0EE"/>
  <g font-family="Noto Sans">
    <rect x="34" y="34" width="1132" height="${height - 68}" rx="44" fill="#F8FAF9"/>

    <rect x="68" y="68" width="1064" height="${clubCardHeight}" rx="34" fill="#FFFFFF" stroke="#C9D8D5" stroke-width="2"/>
    <text x="108" y="126" font-size="34" font-weight="850" fill="${BLUE}">ДОХОД КЛУБА — ${escapeXml(money(input.gameClubIncome))}</text>
    ${detailRow('Компьютеры', input.computerIncome, 188, BLUE)}
    ${detailRow('PlayStation', input.playstationIncome, 246, BLUE)}
    ${detailRow('Долги', input.debtIncome, 304, BLUE)}
    <line x1="108" y1="338" x2="1092" y2="338" stroke="${BLUE}" stroke-width="2"/>
    <text x="108" y="394" font-size="32" font-weight="850" fill="${RED}">РАСХОДЫ КЛУБА — ${escapeXml(money(input.gameClubExpenses))}</text>
    ${clubExpenseRowsSvg}

    <rect x="68" y="${barY}" width="1064" height="278" rx="34" fill="#FFFFFF" stroke="#C9D8D5" stroke-width="2"/>
    <text x="108" y="${barY + 60}" font-size="34" font-weight="850" fill="${BLUE}">ДОХОД БАРА — ${escapeXml(money(input.barSales))}</text>
    <line x1="108" y1="${barY + 88}" x2="1092" y2="${barY + 88}" stroke="#E7EEEC" stroke-width="2"/>
    <text x="108" y="${barY + 144}" font-size="32" font-weight="850" fill="${RED}">РАСХОДЫ БАРА — ${escapeXml(money(input.barExpenses))}</text>
    <line x1="108" y1="${barY + 172}" x2="1092" y2="${barY + 172}" stroke="#E7EEEC" stroke-width="2"/>
    <text x="108" y="${barY + 229}" font-size="32" font-weight="850" fill="${RED}">ЗАКУПКИ СКЛАДА — ${escapeXml(money(input.stockPurchases))}</text>

    <rect x="68" y="${totalExpensesY}" width="1064" height="86" rx="28" fill="#FFFFFF" stroke="#DDE8E5" stroke-width="2"/>
    <text x="108" y="${totalExpensesY + 56}" font-size="31" font-weight="850" fill="${RED}">ОБЩИЕ РАСХОДЫ — ${escapeXml(money(input.totalExpenses))}</text>

    ${summaryCard(68, firstSummaryY, 'ОСТАТОК ДЕНЕГ КЛУБА ЗА МЕСЯЦ', input.gameClubMoneyLeft, '#15803D')}
    ${summaryCard(615, firstSummaryY, 'СРЕДНИЙ ДНЕВНОЙ ДОХОД КЛУБА', input.averageDailyGameClubIncome, PURPLE)}
    ${summaryCard(68, secondSummaryY, 'ДОХОД БАРА ЗА МЕСЯЦ', input.barMoneyLeft, ORANGE)}
    ${summaryCard(615, secondSummaryY, 'СТОИМОСТЬ СКЛАДА', input.inventoryValue, INK)}

    <rect x="68" y="${activeDebtsY}" width="1064" height="68" rx="24" fill="${RED}"/>
    <text x="108" y="${activeDebtsY + 45}" font-size="30" font-weight="850" fill="#FFFFFF">АКТИВНЫЕ ДОЛГИ</text>
    <text x="1090" y="${activeDebtsY + 45}" text-anchor="end" font-size="32" font-weight="850" fill="#FFFFFF">${escapeXml(money(input.activeDebts))}</text>
  </g>
</svg>`;
}

export async function renderDailyFinanceReportPng(input: DailyFinanceReportInput): Promise<Buffer> {
  assertReportFontsAvailable();
  const svg = buildDailyFinanceReportSvg(input);
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
}

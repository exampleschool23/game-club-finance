import sharp from 'sharp';
import { formatCurrency } from '../formatters';
import type {
  DailyFinanceExpenseCategory,
  DailyFinanceReportInput,
} from './dailyFinanceReport';

const WIDTH = 1254;
const PAGE_PADDING = 34;
const CARD_GAP = 14;
const BLUE = '#1769E0';
const RED = '#E53935';
const GREEN = '#079455';
const PURPLE = '#7C3AED';
const ORANGE = '#F97316';
const CHARCOAL = '#17212B';
const BORDER = '#CBD5E1';
const WHITE = '#FFFFFF';

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function money(value: number): string {
  return `${formatCurrency(value)} UZS`;
}

function shorten(value: string, maxLength = 34): string {
  const trimmed = value.trim();
  return trimmed.length <= maxLength
    ? trimmed
    : `${trimmed.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

function card(x: number, y: number, width: number, height: number, stroke = BORDER): string {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="20" fill="${WHITE}" stroke="${stroke}" stroke-width="2"/>`;
}

function line(x1: number, y1: number, x2: number, color: string): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y1}" stroke="${color}" stroke-width="2"/>`;
}

function sectionHeading(
  label: string,
  amount: number,
  x: number,
  y: number,
  right: number,
  color: string,
): string {
  return [
    `<text x="${x}" y="${y}" class="section-heading" fill="${color}">${escapeXml(label)}</text>`,
    `<text x="${right}" y="${y}" class="section-amount" fill="${color}" text-anchor="end">${escapeXml(money(amount))}</text>`,
  ].join('');
}

function metricRow(
  label: string,
  amount: number,
  x: number,
  y: number,
  right: number,
  color: string,
  filled: boolean,
): string {
  return [
    `<circle cx="${x + 12}" cy="${y - 10}" r="10" fill="${filled ? color : WHITE}" stroke="${color}" stroke-width="3"/>`,
    `<text x="${x + 44}" y="${y}" class="row-label">${escapeXml(shorten(label))}</text>`,
    `<text x="${right}" y="${y}" class="row-value" text-anchor="end">${escapeXml(money(amount))}</text>`,
  ].join('');
}

function categoryRows(
  categories: DailyFinanceExpenseCategory[],
  x: number,
  startY: number,
  right: number,
  color: string,
): string {
  return categories.map((category, index) => metricRow(
    category.name,
    category.amount,
    x,
    startY + index * 42,
    right,
    color,
    false,
  )).join('');
}

function safeIcon(x: number, y: number, color: string): string {
  return [
    `<rect x="${x}" y="${y}" width="92" height="76" rx="12" fill="none" stroke="${color}" stroke-width="6"/>`,
    `<circle cx="${x + 47}" cy="${y + 38}" r="15" fill="none" stroke="${color}" stroke-width="5"/>`,
    `<line x1="${x + 47}" y1="${y + 23}" x2="${x + 47}" y2="${y + 53}" stroke="${color}" stroke-width="4"/>`,
    `<line x1="${x + 32}" y1="${y + 38}" x2="${x + 62}" y2="${y + 38}" stroke="${color}" stroke-width="4"/>`,
  ].join('');
}

function chartIcon(x: number, y: number, color: string): string {
  return [
    `<polyline points="${x},${y + 60} ${x + 30},${y + 28} ${x + 52},${y + 48} ${x + 88},${y + 8}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<polyline points="${x + 66},${y + 8} ${x + 88},${y + 8} ${x + 88},${y + 30}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<rect x="${x + 2}" y="${y + 68}" width="18" height="30" fill="none" stroke="${color}" stroke-width="5"/>`,
    `<rect x="${x + 34}" y="${y + 56}" width="18" height="42" fill="none" stroke="${color}" stroke-width="5"/>`,
    `<rect x="${x + 66}" y="${y + 42}" width="18" height="56" fill="none" stroke="${color}" stroke-width="5"/>`,
  ].join('');
}

function barIcon(x: number, y: number, color: string): string {
  return [
    `<path d="M ${x + 10} ${y + 8} H ${x + 82} L ${x + 48} ${y + 45} Z" fill="none" stroke="${color}" stroke-width="6" stroke-linejoin="round"/>`,
    `<line x1="${x + 48}" y1="${y + 45}" x2="${x + 48}" y2="${y + 86}" stroke="${color}" stroke-width="6"/>`,
    `<line x1="${x + 20}" y1="${y + 88}" x2="${x + 76}" y2="${y + 88}" stroke="${color}" stroke-width="6" stroke-linecap="round"/>`,
    `<line x1="${x + 60}" y1="${y + 18}" x2="${x + 76}" y2="${y - 4}" stroke="${color}" stroke-width="5"/>`,
  ].join('');
}

function warehouseIcon(x: number, y: number, color: string): string {
  return [
    `<path d="M ${x + 6} ${y + 35} L ${x + 48} ${y + 5} L ${x + 90} ${y + 35} V ${y + 92} H ${x + 6} Z" fill="none" stroke="${color}" stroke-width="6" stroke-linejoin="round"/>`,
    `<rect x="${x + 22}" y="${y + 54}" width="24" height="24" fill="none" stroke="${color}" stroke-width="4"/>`,
    `<rect x="${x + 50}" y="${y + 54}" width="24" height="24" fill="none" stroke="${color}" stroke-width="4"/>`,
    `<rect x="${x + 36}" y="${y + 30}" width="24" height="24" fill="none" stroke="${color}" stroke-width="4"/>`,
  ].join('');
}

function warningIcon(x: number, y: number): string {
  return [
    `<path d="M ${x + 48} ${y} L ${x + 94} ${y + 80} H ${x + 2} Z" fill="none" stroke="${WHITE}" stroke-width="6" stroke-linejoin="round"/>`,
    `<line x1="${x + 48}" y1="${y + 25}" x2="${x + 48}" y2="${y + 52}" stroke="${WHITE}" stroke-width="7" stroke-linecap="round"/>`,
    `<circle cx="${x + 48}" cy="${y + 67}" r="4" fill="${WHITE}"/>`,
  ].join('');
}

function wrapKpiLabel(label: string): [string, string] {
  const knownLabels: Record<string, [string, string]> = {
    'ОСТАТОК ДЕНЕГ КЛУБА ЗА МЕСЯЦ': ['ОСТАТОК ДЕНЕГ', 'КЛУБА ЗА МЕСЯЦ'],
    'СРЕДНИЙ ДНЕВНОЙ ДОХОД КЛУБА': ['СРЕДНИЙ ДНЕВНОЙ', 'ДОХОД КЛУБА'],
    'ДОХОД БАРА ЗА МЕСЯЦ': ['ДОХОД БАРА', 'ЗА МЕСЯЦ'],
    'СТОИМОСТЬ СКЛАДА': ['СТОИМОСТЬ', 'СКЛАДА'],
  };
  return knownLabels[label] ?? [shorten(label, 24), ''];
}

function kpiCard({
  x,
  y,
  width,
  label,
  value,
  color,
  icon,
}: {
  x: number;
  y: number;
  width: number;
  label: string;
  value: number;
  color: string;
  icon: 'safe' | 'chart' | 'bar' | 'warehouse';
}): string {
  const [firstLine, secondLine] = wrapKpiLabel(label);
  const iconMarkup = icon === 'safe'
    ? safeIcon(x + 36, y + 34, color)
    : icon === 'chart'
      ? chartIcon(x + 36, y + 25, color)
      : icon === 'bar'
        ? barIcon(x + 36, y + 28, color)
        : warehouseIcon(x + 36, y + 23, color);

  return [
    card(x, y, width, 148),
    iconMarkup,
    `<text x="${x + 158}" y="${y + 53}" class="kpi-label">${escapeXml(firstLine)}</text>`,
    secondLine ? `<text x="${x + 158}" y="${y + 82}" class="kpi-label">${escapeXml(secondLine)}</text>` : '',
    `<text x="${x + 158}" y="${y + 126}" class="kpi-value" fill="${color}">${escapeXml(money(value))}</text>`,
  ].join('');
}

export function buildDailyFinanceReportSvg(input: DailyFinanceReportInput): string {
  const contentWidth = WIDTH - PAGE_PADDING * 2;
  const right = WIDTH - PAGE_PADDING - 30;
  const sectionX = PAGE_PADDING + 30;
  const clubCategoryCount = input.gameClubExpenseCategories.length;
  const barCategoryCount = input.barExpenseCategories.length;
  const clubHeight = 316 + clubCategoryCount * 42;
  const barHeight = 218 + barCategoryCount * 42;
  const summaryHeight = 64;
  const kpiHeight = 148;
  const debtHeight = 86;
  const totalHeight = PAGE_PADDING
    + clubHeight + CARD_GAP
    + barHeight + CARD_GAP
    + summaryHeight + CARD_GAP
    + kpiHeight * 2 + CARD_GAP
    + debtHeight + PAGE_PADDING;

  let y = PAGE_PADDING;
  const markup: string[] = [];

  markup.push(card(PAGE_PADDING, y, contentWidth, clubHeight, BLUE));
  markup.push(sectionHeading('ДОХОД КЛУБА', input.gameClubIncome, sectionX, y + 54, right, BLUE));
  markup.push(metricRow('Компьютеры', input.computerIncome, sectionX, y + 104, right, BLUE, true));
  markup.push(metricRow('PlayStation', input.playstationIncome, sectionX, y + 150, right, BLUE, true));
  markup.push(metricRow('Долги', input.debtIncome, sectionX, y + 196, right, BLUE, true));
  markup.push(line(sectionX, y + 222, right, BLUE));
  markup.push(sectionHeading('РАСХОДЫ КЛУБА', input.gameClubExpenses, sectionX, y + 270, right, RED));
  markup.push(categoryRows(input.gameClubExpenseCategories, sectionX, y + 312, right, RED));
  y += clubHeight + CARD_GAP;

  markup.push(card(PAGE_PADDING, y, contentWidth, barHeight));
  markup.push(sectionHeading('ДОХОД БАРА', input.barSales, sectionX, y + 54, right, BLUE));
  markup.push(line(sectionX, y + 76, right, BLUE));
  markup.push(sectionHeading('РАСХОДЫ БАРА', input.barExpenses, sectionX, y + 124, right, RED));
  markup.push(categoryRows(input.barExpenseCategories, sectionX, y + 166, right, RED));
  const purchasesDividerY = y + 144 + barCategoryCount * 42;
  markup.push(line(sectionX, purchasesDividerY, right, RED));
  markup.push(sectionHeading('ЗАКУПКИ СКЛАДА', input.stockPurchases, sectionX, purchasesDividerY + 52, right, RED));
  y += barHeight + CARD_GAP;

  markup.push(card(PAGE_PADDING, y, contentWidth, summaryHeight));
  markup.push(sectionHeading('ОБЩИЕ РАСХОДЫ', input.totalExpenses, sectionX, y + 44, right, RED));
  y += summaryHeight + CARD_GAP;

  const kpiGap = 12;
  const kpiWidth = (contentWidth - kpiGap) / 2;
  markup.push(kpiCard({
    x: PAGE_PADDING,
    y,
    width: kpiWidth,
    label: 'ОСТАТОК ДЕНЕГ КЛУБА ЗА МЕСЯЦ',
    value: input.gameClubMoneyLeft,
    color: GREEN,
    icon: 'safe',
  }));
  markup.push(kpiCard({
    x: PAGE_PADDING + kpiWidth + kpiGap,
    y,
    width: kpiWidth,
    label: 'СРЕДНИЙ ДНЕВНОЙ ДОХОД КЛУБА',
    value: input.averageDailyGameClubIncome,
    color: PURPLE,
    icon: 'chart',
  }));
  y += kpiHeight + CARD_GAP;
  markup.push(kpiCard({
    x: PAGE_PADDING,
    y,
    width: kpiWidth,
    label: 'ДОХОД БАРА ЗА МЕСЯЦ',
    value: input.barMoneyLeft,
    color: ORANGE,
    icon: 'bar',
  }));
  markup.push(kpiCard({
    x: PAGE_PADDING + kpiWidth + kpiGap,
    y,
    width: kpiWidth,
    label: 'СТОИМОСТЬ СКЛАДА',
    value: input.inventoryValue,
    color: CHARCOAL,
    icon: 'warehouse',
  }));
  y += kpiHeight + CARD_GAP;

  markup.push(`<rect x="${PAGE_PADDING}" y="${y}" width="${contentWidth}" height="${debtHeight}" rx="20" fill="${RED}"/>`);
  markup.push(warningIcon(PAGE_PADDING + 38, y + 4));
  markup.push(`<text x="${PAGE_PADDING + 160}" y="${y + 57}" class="debt-label" fill="${WHITE}">АКТИВНЫЕ ДОЛГИ</text>`);
  markup.push(`<text x="${right}" y="${y + 57}" class="debt-value" fill="${WHITE}" text-anchor="end">${escapeXml(money(input.activeDebts))}</text>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${totalHeight}" viewBox="0 0 ${WIDTH} ${totalHeight}">
    <rect width="${WIDTH}" height="${totalHeight}" fill="${WHITE}"/>
    <style>
      text { font-family: Arial, "DejaVu Sans", sans-serif; fill: ${CHARCOAL}; font-variant-numeric: tabular-nums; }
      .section-heading { font-size: 32px; font-weight: 800; }
      .section-amount { font-size: 32px; font-weight: 800; }
      .row-label { font-size: 28px; font-weight: 650; }
      .row-value { font-size: 28px; font-weight: 650; }
      .kpi-label { font-size: 23px; font-weight: 800; }
      .kpi-value { font-size: 31px; font-weight: 800; }
      .debt-label { font-size: 34px; font-weight: 800; }
      .debt-value { font-size: 38px; font-weight: 800; }
    </style>
    ${markup.join('\n')}
  </svg>`;
}

export async function renderDailyFinanceReportPng(input: DailyFinanceReportInput): Promise<Buffer> {
  const svg = buildDailyFinanceReportSvg(input);
  return sharp(Buffer.from(svg))
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

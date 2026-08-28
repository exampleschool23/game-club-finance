import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { formatCurrency } from '../formatters';
import type { DailyFinanceReportInput } from './dailyFinanceReport';

const WIDTH = 1200;
const HEIGHT = 1540;
const INK = '#173B3F';
const MUTED = '#70817E';
const TEAL = '#0D9488';
const ORANGE = '#F97316';
const PURPLE = '#A855F7';
const BLUE = '#3B82F6';
const RED = '#DC2626';
let reportFontsConfigured = false;

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  })[character] ?? character);
}

function configureReportFonts() {
  if (reportFontsConfigured) return;

  const fontDirectory = join(process.cwd(), 'node_modules', 'notosans-fontface', 'fonts');
  const configDirectory = join(tmpdir(), 'game-club-finance-fontconfig');
  const configPath = join(configDirectory, 'fonts.conf');
  mkdirSync(configDirectory, { recursive: true });
  writeFileSync(configPath, `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${escapeXml(fontDirectory)}</dir>
  <cachedir>${escapeXml(join(tmpdir(), 'game-club-finance-font-cache'))}</cachedir>
  <config></config>
</fontconfig>`);
  process.env.FONTCONFIG_FILE = configPath;
  reportFontsConfigured = true;
}

function money(value: number): string {
  return `${formatCurrency(Math.round(value))} UZS`;
}

function percentage(value: number, total: number): string {
  const result = total > 0 ? (value / total) * 100 : 0;
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(result)}%`;
}

function revenueRow(label: string, value: number, total: number, y: number, color: string): string {
  return `<circle cx="112" cy="${y - 9}" r="8" fill="${color}"/>
    <text x="140" y="${y}" font-size="28" font-weight="650" fill="#4D5A59">${escapeXml(label)}</text>
    <text x="930" y="${y}" text-anchor="end" font-size="29" font-weight="750" fill="${INK}">${escapeXml(money(value))}</text>
    <rect x="958" y="${y - 38}" width="132" height="48" rx="24" fill="${color}" fill-opacity="0.12"/>
    <text x="1024" y="${y - 5}" text-anchor="middle" font-size="24" font-weight="800" fill="${color}">${escapeXml(percentage(value, total))}</text>`;
}

function expenseRow(label: string, value: number, y: number, color: string): string {
  return `<circle cx="112" cy="${y - 9}" r="8" fill="${color}"/>
    <text x="140" y="${y}" font-size="27" font-weight="650" fill="#4D5A59">${escapeXml(label)}</text>
    <text x="1090" y="${y}" text-anchor="end" font-size="29" font-weight="750" fill="${INK}">${escapeXml(money(value))}</text>`;
}

function metricCard(x: number, y: number, width: number, label: string, value: number, color: string): string {
  return `<rect x="${x}" y="${y}" width="${width}" height="142" rx="28" fill="#FFFFFF" stroke="#DDE8E5" stroke-width="2"/>
    <rect x="${x + 28}" y="${y + 28}" width="10" height="86" rx="5" fill="${color}"/>
    <text x="${x + 62}" y="${y + 54}" font-size="20" font-weight="800" letter-spacing="1.2" fill="${MUTED}">${escapeXml(label)}</text>
    <text x="${x + 62}" y="${y + 105}" font-size="34" font-weight="850" fill="${color}">${escapeXml(money(value))}</text>`;
}

export function buildDailyFinanceReportSvg(input: DailyFinanceReportInput): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs><linearGradient id="header" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#173B3F"/><stop offset="1" stop-color="#0D766F"/></linearGradient></defs>
  <rect width="${WIDTH}" height="${HEIGHT}" rx="52" fill="#EAF0EE"/>
  <g font-family="Noto Sans">
    <rect x="34" y="34" width="1132" height="1472" rx="44" fill="#F8FAF9"/>
    <rect x="68" y="68" width="1064" height="188" rx="34" fill="url(#header)"/>
    <text x="108" y="119" font-size="20" font-weight="800" letter-spacing="2.4" fill="#A8E6DC">GAME CLUB · ФИНАНСОВЫЙ ОТЧЁТ</text>
    <text x="108" y="177" font-size="42" font-weight="850" fill="#FFFFFF">${escapeXml(input.clubName)}</text>
    <text x="108" y="222" font-size="27" font-weight="650" fill="#D8F3EE">Рабочий день: ${escapeXml(input.businessDateLabel)}</text>

    <rect x="68" y="280" width="1064" height="390" rx="34" fill="#FFFFFF" stroke="#DDE8E5" stroke-width="2"/>
    <text x="108" y="331" font-size="20" font-weight="800" letter-spacing="2" fill="${MUTED}">ВЫРУЧКА ЗА ДЕНЬ</text>
    <text x="1090" y="335" text-anchor="end" font-size="43" font-weight="850" fill="${INK}">${escapeXml(money(input.dailyRevenue))}</text>
    <line x1="108" y1="359" x2="1092" y2="359" stroke="#E7EEEC" stroke-width="2"/>
    ${revenueRow('Компьютеры', input.computerIncome, input.dailyRevenue, 414, TEAL)}
    ${revenueRow('PlayStation', input.playstationIncome, input.dailyRevenue, 477, BLUE)}
    ${revenueRow('Погашение долгов', input.debtIncome, input.dailyRevenue, 540, PURPLE)}
    ${revenueRow('Бар', input.barSales, input.dailyRevenue, 603, ORANGE)}

    ${metricCard(68, 694, 517, 'ВАЛОВАЯ ПРИБЫЛЬ', input.grossProfit, TEAL)}
    ${metricCard(615, 694, 517, 'ЧИСТАЯ ПРИБЫЛЬ', input.netProfit, input.netProfit >= 0 ? TEAL : RED)}

    <rect x="68" y="860" width="1064" height="382" rx="34" fill="#FFFFFF" stroke="#DDE8E5" stroke-width="2"/>
    <text x="108" y="914" font-size="22" font-weight="800" letter-spacing="2" fill="${INK}">РАСХОДЫ И СЕБЕСТОИМОСТЬ</text>
    <text x="1090" y="914" text-anchor="end" font-size="31" font-weight="850" fill="${RED}">${escapeXml(money(input.totalExpenses + input.barCost))}</text>
    <line x1="108" y1="940" x2="1092" y2="940" stroke="#E7EEEC" stroke-width="2"/>
    ${expenseRow('Себестоимость бара', input.barCost, 985, ORANGE)}
    ${expenseRow('Зарплата', input.salaryCosts, 1032, TEAL)}
    ${expenseRow('KPI и бонусы', input.kpiCosts, 1079, PURPLE)}
    ${expenseRow('Аренда', input.rentCosts, 1126, BLUE)}
    ${expenseRow('Коммунальные услуги', input.utilitiesCosts, 1173, '#EAB308')}
    ${expenseRow('Прочие операционные расходы', input.otherOperatingCosts, 1220, RED)}

    <rect x="68" y="1266" width="1064" height="202" rx="34" fill="#FFFFFF" stroke="#DDE8E5" stroke-width="2"/>
    <text x="108" y="1317" font-size="20" font-weight="800" letter-spacing="2" fill="${MUTED}">МЕСЯЦ НА ТЕКУЩУЮ ДАТУ</text>
    <line x1="600" y1="1338" x2="600" y2="1435" stroke="#E7EEEC" stroke-width="2"/>
    <text x="108" y="1376" font-size="24" font-weight="700" fill="#4D5A59">Выручка с начала месяца</text>
    <text x="108" y="1427" font-size="36" font-weight="850" fill="${INK}">${escapeXml(money(input.monthToDateRevenue))}</text>
    <text x="640" y="1376" font-size="24" font-weight="700" fill="#4D5A59">Средняя выручка в день</text>
    <text x="640" y="1427" font-size="36" font-weight="850" fill="${TEAL}">${escapeXml(money(input.averageDailyRevenue))}</text>
    <text x="68" y="1492" font-size="18" font-weight="650" fill="${MUTED}">Закупки склада: ${escapeXml(money(input.stockPurchases))} · Активные долги: ${escapeXml(money(input.activeDebts))}</text>
  </g>
</svg>`;
}

export async function renderDailyFinanceReportPng(input: DailyFinanceReportInput): Promise<Buffer> {
  configureReportFonts();
  const svg = buildDailyFinanceReportSvg(input);
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
}

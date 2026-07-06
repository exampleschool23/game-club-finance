import type { Product } from '../types';
import {
  calculateClosingStockDefaults,
  calculateClosingStockFromSold,
  calculateStockCountSummary,
} from './calculations/stock';

export interface ClosingStockRowData {
  product: Product;
  previousStock: string;
  addedToday: string;
  closingStock: string;
  soldQuantity: string;
}

export interface ClosingStockDraft {
  version: 1;
  date: string;
  clubId?: string;
  savedAt: string;
  rows: Array<{
    productId: string;
    previousStock: string;
    addedToday: string;
    closingStock: string;
    soldQuantity: string;
  }>;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ImportedClosingStockRow {
  rowNumber: number;
  product?: string;
  productId?: string;
  previousStock?: number;
  addedToday?: number;
  closingStock?: number;
  soldQuantity?: number;
  salePrice?: number;
  costPrice?: number;
}

export type ClosingStockImportMode = 'closingStock' | 'soldQuantity';

export interface ClosingStockImportResult {
  rows: ClosingStockRowData[];
  matchedCount: number;
  unmatchedImports: ImportedClosingStockRow[];
}

export interface ClosingStockImportSheet {
  name: string;
  rows: unknown[][];
}

export interface ClosingStockImportSelection {
  sheetName: string;
  rows: ImportedClosingStockRow[];
}

export interface ClosingStockUpsert {
  date: string;
  product_id: string;
  previous_stock: number;
  added_today: number;
  closing_stock: number;
  sold_quantity: number;
  sale_price: number;
  cost_price: number;
  bar_income: number;
  bar_cost: number;
  bar_profit: number;
  created_by: string | null;
  updated_at: string;
}

export interface ClosingStockExistingCount {
  product_id: string;
  previous_stock?: number | string | null;
  added_today?: number | string | null;
  closing_stock?: number | string | null;
  sold_quantity?: number | string | null;
}

export interface ClosingStockPurchaseQuantity {
  product_id: string;
  quantity: number | string | null;
}

export interface BuildEditableClosingStockRowsInput {
  products: Product[];
  counts: ClosingStockExistingCount[];
  purchases: ClosingStockPurchaseQuantity[];
  previousClosings: Record<string, number>;
  isCurrentDate: boolean;
}

const headerAliases = {
  productId: ['product id', 'product_id', 'id', 'sku', 'код', 'id товара', 'mahsulot id'],
  product: ['product', 'product name', 'product_name', 'name', 'item', 'column 1', 'товар', 'продукт', 'наименование', 'название', 'tovar', 'mahsulot', 'mahsulot nomi', 'nomi'],
  previousStock: ['previous stock', 'previous_stock', 'opening stock', 'start stock', 'начальный остаток', 'oldingi ostatka', 'avvalgi qoldiq'],
  addedToday: ['added today', 'added_today', 'purchased today', 'received', 'добавлено', 'приход', 'keldi', 'kelgan', 'bugun qoshildi', 'bugun qo‘shildi'],
  closingStock: ['closing stock', 'closing_stock', 'ending stock', 'end stock', 'stock left', 'остаток', 'остаток на конец', 'конечный остаток', 'закрытие', 'ostatka', 'qoldiq', 'yakuniy qoldiq'],
  soldQuantity: ['sold qty', 'sold quantity', 'sold_quantity', 'sold', 'qty sold', 'расход', 'продано', 'sotildi', 'sotilgan'],
  salePrice: ['sale price', 'sale_price', 'price', 'narxi', 'цена продажи'],
  costPrice: ['cost price', 'cost_price', 'cost', 'tan narxi', 'себестоимость'],
} as const;

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[’'`]/g, '')
    .replace(/\s+/g, ' ');
}

function normalizeHeader(value: string): string {
  return normalizeText(value)
    .replace(/[_-]+/g, ' ')
    .replace(/[()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeProductMatchText(value: unknown): string {
  return normalizeText(value)
    .replace(/[^a-zа-я0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveHeader(header: string): keyof typeof headerAliases | null {
  const normalized = normalizeHeader(header);

  for (const [field, aliases] of Object.entries(headerAliases) as Array<[keyof typeof headerAliases, readonly string[]]>) {
    if (aliases.some((alias) => normalized === normalizeHeader(alias))) {
      return field;
    }
  }

  return null;
}

function productPriceMatchKey(
  productName: string | undefined,
  salePrice: number | undefined,
  costPrice: number | undefined,
): string | null {
  if (!productName || salePrice === undefined || costPrice === undefined) return null;
  return `${normalizeProductMatchText(productName)}|${Number(salePrice).toFixed(2)}|${Number(costPrice).toFixed(2)}`;
}

function hasImportValue(row: ImportedClosingStockRow): boolean {
  return Boolean(row.product || row.productId) ||
    row.previousStock !== undefined ||
    row.addedToday !== undefined ||
    row.closingStock !== undefined ||
    row.soldQuantity !== undefined ||
    row.salePrice !== undefined ||
    row.costPrice !== undefined;
}

function hasEditableImportValue(row: ImportedClosingStockRow): boolean {
  return row.previousStock !== undefined ||
    row.addedToday !== undefined ||
    row.closingStock !== undefined ||
    row.soldQuantity !== undefined;
}

function parseImportRow(
  entries: Array<[string, unknown]>,
  rowNumber: number,
): ImportedClosingStockRow | null {
  const parsed: ImportedClosingStockRow = { rowNumber };

  for (const [header, value] of entries) {
    const field = resolveHeader(header);
    if (!field) continue;

    if (field === 'product' || field === 'productId') {
      const text = String(value ?? '').trim();
      if (text) parsed[field] = text;
      continue;
    }

    const numeric = parseClosingStockNumber(value);
    if (numeric !== null) parsed[field] = numeric;
  }

  return hasImportValue(parsed) ? parsed : null;
}

function getHeaderFields(row: unknown[]): Array<keyof typeof headerAliases> {
  return row.flatMap((cell) => {
    const field = resolveHeader(String(cell ?? ''));
    return field ? [field] : [];
  });
}

function isImportHeaderRow(row: unknown[]): boolean {
  const fields = new Set(getHeaderFields(row));
  const hasProduct = fields.has('product') || fields.has('productId');
  const editableCount = Number(fields.has('previousStock')) +
    Number(fields.has('addedToday')) +
    Number(fields.has('closingStock')) +
    Number(fields.has('soldQuantity'));

  return (hasProduct && editableCount > 0) || editableCount > 0;
}

function parseSheetDate(sheetName: string): string | null {
  const trimmed = sheetName.trim();
  const dotted = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dotted) {
    const [, day, month, year] = dotted;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const [, year, month, day] = iso;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  return null;
}

export function parseClosingStockNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const compact = raw.replace(/\s+/g, '').replace(/'/g, '');
  const hasComma = compact.includes(',');
  const hasDot = compact.includes('.');
  let normalized = compact;

  if (hasComma && hasDot) {
    normalized = normalized.replace(/,/g, '');
  } else if (hasComma) {
    const commaParts = normalized.split(',');
    const lastPart = commaParts[commaParts.length - 1];
    normalized = commaParts.length === 2 && lastPart.length === 3
      ? normalized.replace(/,/g, '')
      : normalized.replace(/,/g, '.');
  }

  normalized = normalized.replace(/[^\d.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeStockCount(value: unknown): number {
  const parsed = parseClosingStockNumber(value);
  return parsed === null ? 0 : Math.max(0, Math.trunc(parsed));
}

function formatStockValue(value: unknown): string {
  return String(normalizeStockCount(value));
}

function formatEditableStockValue(value: unknown): string {
  return String(value ?? '').trim() === '' ? '' : formatStockValue(value);
}

function refreshRowPurchasedToday(row: ClosingStockRowData, purchasedToday: number | undefined): ClosingStockRowData {
  if (purchasedToday === undefined) return row;

  const addedToday = normalizeStockCount(purchasedToday);
  const addedDelta = addedToday - normalizeStockCount(row.addedToday);
  const closingStock = Math.max(0, normalizeStockCount(row.closingStock) + addedDelta);
  const summary = calculateStockCountSummary({
    previousStock: normalizeStockCount(row.previousStock),
    addedToday,
    closingStock,
    salePrice: row.product.sale_price,
    costPrice: row.product.cost_price,
  });

  return {
    ...row,
    addedToday: formatStockValue(addedToday),
    closingStock: formatStockValue(closingStock),
    soldQuantity: formatStockValue(summary.soldQuantity),
  };
}

export function closingStockDraftKey(date: string, clubId?: string): string {
  return clubId ? `closing-stock-draft:${clubId}:${date}` : `closing-stock-draft:${date}`;
}

export function createClosingStockDraft(
  date: string,
  rows: ClosingStockRowData[],
  savedAt = new Date().toISOString(),
  clubId?: string,
): ClosingStockDraft {
  return {
    version: 1,
    date,
    clubId,
    savedAt,
    rows: rows.map((row) => ({
      productId: row.product.id,
      previousStock: row.previousStock,
      addedToday: row.addedToday,
      closingStock: row.closingStock,
      soldQuantity: row.soldQuantity,
    })),
  };
}

export function readClosingStockDraft(storage: StorageLike | null | undefined, date: string, clubId?: string): ClosingStockDraft | null {
  if (!storage) return null;

  try {
    const raw = storage.getItem(closingStockDraftKey(date, clubId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ClosingStockDraft;
    return parsed.version === 1 && parsed.date === date && parsed.clubId === clubId && Array.isArray(parsed.rows)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function saveClosingStockDraft(
  storage: StorageLike | null | undefined,
  date: string,
  rows: ClosingStockRowData[],
  savedAt = new Date().toISOString(),
  clubId?: string,
): boolean {
  if (!storage) return false;

  try {
    storage.setItem(closingStockDraftKey(date, clubId), JSON.stringify(createClosingStockDraft(date, rows, savedAt, clubId)));
    return true;
  } catch {
    return false;
  }
}

export function clearClosingStockDraft(storage: StorageLike | null | undefined, date: string, clubId?: string): void {
  if (!storage) return;

  try {
    storage.removeItem(closingStockDraftKey(date, clubId));
  } catch {
    // The submitted data is already persisted remotely.
  }
}

export function applyClosingStockDraft(
  rows: ClosingStockRowData[],
  draft: ClosingStockDraft | null,
): ClosingStockRowData[] {
  if (!draft) return rows;

  const draftByProduct = new Map(draft.rows.map((row) => [row.productId, row]));
  return rows.map((row) => {
    const draftRow = draftByProduct.get(row.product.id);
    if (!draftRow) return row;
    const draftedRow = {
      ...row,
      previousStock: formatEditableStockValue(draftRow.previousStock),
      addedToday: formatEditableStockValue(draftRow.addedToday),
      closingStock: formatEditableStockValue(draftRow.closingStock),
      soldQuantity: formatEditableStockValue(draftRow.soldQuantity),
    };

    const freshPurchasedToday = normalizeStockCount(row.addedToday);
    return freshPurchasedToday > 0
      ? refreshRowPurchasedToday(draftedRow, freshPurchasedToday)
      : draftedRow;
  });
}

export function parseClosingStockImportRecords(records: Array<Record<string, unknown>>): ImportedClosingStockRow[] {
  return records.flatMap((record, index) => {
    const parsed = parseImportRow(Object.entries(record), index + 2);
    return parsed ? [parsed] : [];
  });
}

export function parseClosingStockImportSheetRows(sheetRows: unknown[][]): ImportedClosingStockRow[] {
  const headerRowIndex = sheetRows.findIndex((row) => isImportHeaderRow(row));
  if (headerRowIndex === -1) return [];

  const headers = sheetRows[headerRowIndex].map((header) => String(header ?? ''));

  return sheetRows.slice(headerRowIndex + 1).flatMap((row, index) => {
    const entries = headers.map((header, cellIndex): [string, unknown] => [header, row[cellIndex]]);
    const parsed = parseImportRow(entries, headerRowIndex + index + 2);
    return parsed ? [parsed] : [];
  });
}

export function selectClosingStockImportRows(
  sheets: ClosingStockImportSheet[],
  selectedDate?: string,
): ClosingStockImportSelection | null {
  const candidates = sheets.flatMap((sheet, index) => {
    const rows = parseClosingStockImportSheetRows(sheet.rows);
    if (rows.length === 0 || rows.every((row) => !hasEditableImportValue(row))) return [];

    return [{
      index,
      sheetName: sheet.name,
      sheetDate: parseSheetDate(sheet.name),
      rows,
    }];
  });

  if (candidates.length === 0) return null;

  if (selectedDate) {
    const exactDate = candidates.find((candidate) => candidate.sheetDate === selectedDate);
    if (exactDate) {
      return { sheetName: exactDate.sheetName, rows: exactDate.rows };
    }

    const latestBeforeOrSame = candidates
      .filter((candidate) => candidate.sheetDate && candidate.sheetDate <= selectedDate)
      .sort((a, b) => b.sheetDate!.localeCompare(a.sheetDate!))[0];
    if (latestBeforeOrSame) {
      return { sheetName: latestBeforeOrSame.sheetName, rows: latestBeforeOrSame.rows };
    }
  }

  const latestDated = candidates
    .filter((candidate) => candidate.sheetDate)
    .sort((a, b) => b.sheetDate!.localeCompare(a.sheetDate!))[0];
  const selected = latestDated ?? candidates.sort((a, b) => a.index - b.index)[0];
  return { sheetName: selected.sheetName, rows: selected.rows };
}

function applyImportToRow(
  row: ClosingStockRowData,
  imported: ImportedClosingStockRow,
  mode: ClosingStockImportMode,
): ClosingStockRowData {
  const next = { ...row };

  if (imported.previousStock !== undefined) {
    next.previousStock = formatStockValue(imported.previousStock);
  }

  if (imported.addedToday !== undefined) {
    next.addedToday = formatStockValue(imported.addedToday);
  }

  const previousStock = normalizeStockCount(next.previousStock);
  const addedToday = normalizeStockCount(next.addedToday);

  if (mode === 'soldQuantity') {
    if (imported.soldQuantity !== undefined) {
      const soldQuantity = normalizeStockCount(imported.soldQuantity);
      next.soldQuantity = formatStockValue(soldQuantity);
      next.closingStock = formatStockValue(calculateClosingStockFromSold(previousStock, addedToday, soldQuantity));
      return next;
    }

    if (imported.closingStock !== undefined) {
      const closingStock = normalizeStockCount(imported.closingStock);
      next.closingStock = formatStockValue(closingStock);
      next.soldQuantity = formatStockValue(calculateStockCountSummary({
        previousStock,
        addedToday,
        closingStock,
        salePrice: row.product.sale_price,
        costPrice: row.product.cost_price,
      }).soldQuantity);
    }

    return next;
  }

  if (imported.closingStock !== undefined) {
    const closingStock = normalizeStockCount(imported.closingStock);
    next.closingStock = formatStockValue(closingStock);
    next.soldQuantity = formatStockValue(calculateStockCountSummary({
      previousStock,
      addedToday,
      closingStock,
      salePrice: row.product.sale_price,
      costPrice: row.product.cost_price,
    }).soldQuantity);
    return next;
  }

  if (imported.soldQuantity !== undefined) {
    const soldQuantity = normalizeStockCount(imported.soldQuantity);
    next.soldQuantity = formatStockValue(soldQuantity);
    next.closingStock = formatStockValue(calculateClosingStockFromSold(previousStock, addedToday, soldQuantity));
  }

  return next;
}

function importHasEditableValue(imported: ImportedClosingStockRow): boolean {
  return hasEditableImportValue(imported);
}

export function applyClosingStockImport(
  rows: ClosingStockRowData[],
  importedRows: ImportedClosingStockRow[],
  mode: ClosingStockImportMode,
): ClosingStockImportResult {
  const usedImports = new Set<number>();
  const byProductId = new Map<string, number[]>();
  const byProductNameAndPrices = new Map<string, number[]>();
  const byProductName = new Map<string, number[]>();

  function addImportIndex(map: Map<string, number[]>, key: string | null | undefined, index: number) {
    if (!key) return;
    const indexes = map.get(key);
    if (indexes) indexes.push(index);
    else map.set(key, [index]);
  }

  function findUnusedImportIndex(map: Map<string, number[]>, key: string | null | undefined) {
    if (!key) return undefined;
    return map.get(key)?.find((index) => !usedImports.has(index));
  }

  importedRows.forEach((imported, index) => {
    addImportIndex(byProductId, imported.productId ? normalizeText(imported.productId) : null, index);
    addImportIndex(
      byProductNameAndPrices,
      productPriceMatchKey(imported.product, imported.salePrice, imported.costPrice),
      index,
    );
    addImportIndex(byProductName, imported.product ? normalizeProductMatchText(imported.product) : null, index);
  });

  let matchedCount = 0;

  const nextRows = rows.map((row, rowIndex) => {
    const idMatch = findUnusedImportIndex(byProductId, normalizeText(row.product.id));
    const nameAndPricesMatch = findUnusedImportIndex(
      byProductNameAndPrices,
      productPriceMatchKey(row.product.name, Number(row.product.sale_price), Number(row.product.cost_price)),
    );
    const nameMatch = findUnusedImportIndex(byProductName, normalizeProductMatchText(row.product.name));
    const positionalMatch = importedRows[rowIndex] &&
      !importedRows[rowIndex].product &&
      !importedRows[rowIndex].productId
      ? rowIndex
      : undefined;
    const importIndex = [idMatch, nameAndPricesMatch, nameMatch, positionalMatch]
      .find((candidate) => candidate !== undefined && !usedImports.has(candidate));

    if (importIndex === undefined) return row;

    const imported = importedRows[importIndex];
    usedImports.add(importIndex);

    if (!importHasEditableValue(imported)) return row;

    matchedCount += 1;
    return applyImportToRow(row, imported, mode);
  });

  return {
    rows: nextRows,
    matchedCount,
    unmatchedImports: importedRows.filter((imported, index) =>
      !usedImports.has(index) && Boolean(imported.product || imported.productId),
    ),
  };
}

export function buildEditableClosingStockRows({
  products,
  counts,
  purchases,
  previousClosings,
  isCurrentDate,
}: BuildEditableClosingStockRowsInput): ClosingStockRowData[] {
  const purchasesByProduct = purchases.reduce<Record<string, number>>(
    (acc, purchase) => {
      acc[purchase.product_id] = (acc[purchase.product_id] ?? 0) + Number(purchase.quantity ?? 0);
      return acc;
    },
    {},
  );

  return products.map((product) => {
    const existing = counts.find((count) => count.product_id === product.id);
    const purchasedToday = purchasesByProduct[product.id];
    const addedToday = purchasedToday ?? 0;
    const defaults = calculateClosingStockDefaults({
      currentStock: product.current_stock,
      purchasedToday: addedToday,
    });
    const previousClosing = previousClosings[product.id];
    const previousStock = previousClosing ?? (isCurrentDate ? defaults.previousStock : 0);
    const closingStock = previousClosing === undefined && isCurrentDate
      ? defaults.closingStock
      : previousStock + addedToday;

    if (existing) {
      return refreshRowPurchasedToday({
        product,
        previousStock: formatStockValue(existing.previous_stock),
        addedToday: formatStockValue(existing.added_today),
        closingStock: formatStockValue(existing.closing_stock),
        soldQuantity: formatStockValue(existing.sold_quantity),
      }, purchasedToday);
    }

    return {
      product,
      previousStock: formatStockValue(previousStock),
      addedToday: formatStockValue(defaults.addedToday),
      closingStock: formatStockValue(closingStock),
      soldQuantity: '0',
    };
  });
}

export function buildClosingStockUpserts({
  date,
  rows,
  createdBy,
  updatedAt = new Date().toISOString(),
}: {
  date: string;
  rows: ClosingStockRowData[];
  createdBy: string | null;
  updatedAt?: string;
}): { upserts: ClosingStockUpsert[]; savedClosings: Record<string, number> } {
  const upserts = rows.map((row) => {
    const previousStock = normalizeStockCount(row.previousStock);
    const addedToday = normalizeStockCount(row.addedToday);
    const closingStock = normalizeStockCount(row.closingStock);
    const { soldQuantity, barIncome, barCost, barProfit } = calculateStockCountSummary({
      previousStock,
      addedToday,
      closingStock,
      salePrice: row.product.sale_price,
      costPrice: row.product.cost_price,
    });

    return {
      date,
      product_id: row.product.id,
      previous_stock: previousStock,
      added_today: addedToday,
      closing_stock: closingStock,
      sold_quantity: soldQuantity,
      sale_price: row.product.sale_price,
      cost_price: row.product.cost_price,
      bar_income: barIncome,
      bar_cost: barCost,
      bar_profit: barProfit,
      created_by: createdBy,
      updated_at: updatedAt,
    };
  });

  return {
    upserts,
    savedClosings: upserts.reduce<Record<string, number>>((acc, row) => {
      acc[row.product_id] = row.closing_stock;
      return acc;
    }, {}),
  };
}

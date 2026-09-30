import { parseCurrencyInput } from './formatters';
import { LOW_STOCK_DEFAULT } from './calculations/stock';

export interface ProductWriteForm {
  name: string;
  category: string;
  sale_price: string;
  cost_price: string;
  current_stock: string;
  low_stock_threshold: string;
  tracks_inventory: boolean;
  is_active: boolean;
}

export interface ProductWriteOptions {
  isOwner: boolean;
  updatedAt?: string;
}

/** Blank or invalid input uses the default; an explicit 0 disables low-stock alerts. */
export function parseLowStockThreshold(value: string): number {
  const trimmed = String(value ?? '').trim();
  if (trimmed === '') return LOW_STOCK_DEFAULT;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : LOW_STOCK_DEFAULT;
}

export type ProductFormValidationCode = 'name_required' | 'sale_price_required';

/**
 * Every catalog product is sold through Closing Stock, so an active product
 * needs a positive sale price; a blank price would silently record zero bar
 * income. Inactive products may keep a zero price.
 */
export function validateProductForm(form: ProductWriteForm): ProductFormValidationCode | null {
  if (!form.name.trim()) return 'name_required';
  if (form.is_active && parseCurrencyInput(form.sale_price) <= 0) return 'sale_price_required';
  return null;
}

export function buildProductUpdatePayload(form: ProductWriteForm, options: ProductWriteOptions) {
  return {
    name: form.name.trim(),
    category: form.category.trim() || null,
    sale_price: parseCurrencyInput(form.sale_price),
    ...(options.isOwner ? { cost_price: parseCurrencyInput(form.cost_price) } : {}),
    low_stock_threshold: parseLowStockThreshold(form.low_stock_threshold),
    is_active: form.is_active,
    updated_at: options.updatedAt ?? new Date().toISOString(),
  };
}

export function buildProductInsertPayload(form: ProductWriteForm, options: ProductWriteOptions) {
  return {
    ...buildProductUpdatePayload(form, options),
    ...(options.isOwner ? {
      tracks_inventory: form.tracks_inventory,
      current_stock: form.tracks_inventory
        ? Math.max(0, Math.trunc(parseFloat(form.current_stock) || 0))
        : 0,
    } : {}),
  };
}

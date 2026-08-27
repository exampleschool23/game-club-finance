import { parseCurrencyInput } from './formatters';

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

export function buildProductUpdatePayload(form: ProductWriteForm, options: ProductWriteOptions) {
  return {
    name: form.name.trim(),
    category: form.category.trim() || null,
    sale_price: parseCurrencyInput(form.sale_price),
    ...(options.isOwner ? { cost_price: parseCurrencyInput(form.cost_price) } : {}),
    low_stock_threshold: parseFloat(form.low_stock_threshold) || 5,
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

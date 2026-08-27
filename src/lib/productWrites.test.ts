import { describe, expect, it } from 'vitest';
import {
  buildProductInsertPayload,
  buildProductUpdatePayload,
  type ProductWriteForm,
} from './productWrites';

const form: ProductWriteForm = {
  name: ' Cola ',
  category: ' Drinks ',
  sale_price: '15 000',
  cost_price: '9 000',
  current_stock: '42',
  low_stock_threshold: '5',
  tracks_inventory: true,
  is_active: true,
};

describe('product write payloads', () => {
  it('never includes ledger-controlled fields in an existing product update', () => {
    const payload = buildProductUpdatePayload(form, {
      isOwner: true,
      updatedAt: '2026-08-27T00:00:00.000Z',
    });

    expect(payload).toEqual({
      name: 'Cola',
      category: 'Drinks',
      sale_price: 15_000,
      cost_price: 9_000,
      low_stock_threshold: 5,
      is_active: true,
      updated_at: '2026-08-27T00:00:00.000Z',
    });
    expect(payload).not.toHaveProperty('current_stock');
    expect(payload).not.toHaveProperty('tracks_inventory');
  });

  it('allows an owner to choose opening stock and tracking mode at creation', () => {
    expect(buildProductInsertPayload(form, {
      isOwner: true,
      updatedAt: '2026-08-27T00:00:00.000Z',
    })).toMatchObject({
      current_stock: 42,
      tracks_inventory: true,
    });
  });

  it('forces made-to-order opening stock to zero at creation', () => {
    expect(buildProductInsertPayload({ ...form, tracks_inventory: false }, {
      isOwner: true,
      updatedAt: '2026-08-27T00:00:00.000Z',
    })).toMatchObject({
      current_stock: 0,
      tracks_inventory: false,
    });
  });
});


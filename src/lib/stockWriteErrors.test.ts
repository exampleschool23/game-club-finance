import { describe, expect, it } from 'vitest';
import { classifyStockWriteError } from './stockWriteErrors';

describe('classifyStockWriteError', () => {
  it('maps the inventory RPC error codes to stable kinds', () => {
    expect(classifyStockWriteError({ code: '42501', message: 'Admins can only save the current business day.' })).toBe('adminPastDate');
    expect(classifyStockWriteError({ code: '42501', message: 'Only a club owner can create or change an inventory adjustment.' })).toBe('adjustmentOwnerOnly');
    expect(classifyStockWriteError({ code: '42501', message: 'Not authorized to save stock counts for this club.' })).toBe('permission');
    expect(classifyStockWriteError({ code: '22008' })).toBe('futureDate');
    expect(classifyStockWriteError({ code: '23503' })).toBe('productUnavailable');
    expect(classifyStockWriteError({ code: '23514', message: 'Archived products cannot receive new stock operations.' })).toBe('productUnavailable');
    expect(classifyStockWriteError({ code: '23514', message: 'Historical change makes the saved stock count on 2026-01-02 invalid' })).toBe('laterCountInvalid');
    expect(classifyStockWriteError({ code: '23514', message: 'Closing stock exceeds available stock.' })).toBe('invalid');
    expect(classifyStockWriteError({ code: '23514', message: 'Cannot delete purchase because current stock is lower than its quantity.' })).toBe('insufficientStock');
    expect(classifyStockWriteError({ code: '22023' })).toBe('invalid');
    expect(classifyStockWriteError({ code: '55000' })).toBe('closedDay');
    expect(classifyStockWriteError({ code: 'P0002' })).toBe('notFound');
  });

  it('falls back to unknown for network and unrecognised errors', () => {
    expect(classifyStockWriteError(null)).toBe('unknown');
    expect(classifyStockWriteError({ message: 'Failed to fetch' })).toBe('unknown');
  });
});

import { describe, expect, it, vi } from 'vitest';
import { fetchAllRows } from './pagination';

describe('fetchAllRows', () => {
  it('loads every page when a result exceeds the database row cap', async () => {
    const source = Array.from({ length: 1_779 }, (_, id) => ({ id }));
    const requestedRanges: Array<[number, number]> = [];

    const result = await fetchAllRows(
      () => ({
        range: vi.fn(async (from: number, to: number) => {
          requestedRanges.push([from, to]);
          return { data: source.slice(from, to + 1), error: null };
        }),
      }),
      1_000,
    );

    expect(result.error).toBeNull();
    expect(result.data).toEqual(source);
    expect(requestedRanges).toEqual([
      [0, 999],
      [1_000, 1_999],
    ]);
  });

  it('returns an error without presenting partial rows as complete data', async () => {
    let page = 0;
    const result = await fetchAllRows(
      () => ({
        range: vi.fn(async () => {
          page += 1;
          return page === 1
            ? { data: [{ id: 1 }], error: null }
            : { data: null, error: { message: 'query failed' } };
        }),
      }),
      1,
    );

    expect(result).toEqual({ data: null, error: { message: 'query failed' } });
  });
});

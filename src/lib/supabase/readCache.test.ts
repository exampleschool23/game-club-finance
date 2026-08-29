import { describe, expect, it, vi } from 'vitest';
import { createSupabaseReadFetch } from './readCache';

const SUPABASE_URL = 'https://project.supabase.co';

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('createSupabaseReadFetch', () => {
  it('coalesces concurrent reads and serves a fresh cached response', async () => {
    const nativeFetch = vi.fn(async () => jsonResponse([{ id: 1 }])) as unknown as typeof fetch;
    const cachedFetch = createSupabaseReadFetch(nativeFetch, SUPABASE_URL);
    const url = `${SUPABASE_URL}/rest/v1/products?select=id`;

    const [first, second] = await Promise.all([cachedFetch(url), cachedFetch(url)]);
    const third = await cachedFetch(url);

    expect(await first.json()).toEqual([{ id: 1 }]);
    expect(await second.json()).toEqual([{ id: 1 }]);
    expect(await third.json()).toEqual([{ id: 1 }]);
    expect(nativeFetch).toHaveBeenCalledTimes(1);
  });

  it('expires cached reads after the configured TTL', async () => {
    let now = 1_000;
    const nativeFetch = vi.fn(async () => jsonResponse({ ok: true })) as unknown as typeof fetch;
    const cachedFetch = createSupabaseReadFetch(nativeFetch, SUPABASE_URL, {
      now: () => now,
      ttlMs: 100,
    });
    const url = `${SUPABASE_URL}/rest/v1/products?select=id`;

    await cachedFetch(url);
    now = 1_099;
    await cachedFetch(url);
    now = 1_100;
    await cachedFetch(url);

    expect(nativeFetch).toHaveBeenCalledTimes(2);
  });

  it('keeps paginated ranges in separate cache entries', async () => {
    const nativeFetch = vi.fn(async () => jsonResponse([])) as unknown as typeof fetch;
    const cachedFetch = createSupabaseReadFetch(nativeFetch, SUPABASE_URL);
    const url = `${SUPABASE_URL}/rest/v1/daily_stock_counts?select=id`;

    await cachedFetch(url, { headers: { Range: '0-999' } });
    await cachedFetch(url, { headers: { Range: '1000-1999' } });
    await cachedFetch(url, { headers: { Range: '0-999' } });

    expect(nativeFetch).toHaveBeenCalledTimes(2);
  });

  it('caches only explicitly read-only RPCs', async () => {
    const nativeFetch = vi.fn(async () => jsonResponse({ ok: true })) as unknown as typeof fetch;
    const cachedFetch = createSupabaseReadFetch(nativeFetch, SUPABASE_URL);
    const readRpc = `${SUPABASE_URL}/rest/v1/rpc/get_dashboard_snapshot`;
    const writeRpc = `${SUPABASE_URL}/rest/v1/rpc/save_closing_stock_counts`;

    await cachedFetch(readRpc, { method: 'POST', body: '{"club":"one"}' });
    await cachedFetch(readRpc, { method: 'POST', body: '{"club":"one"}' });
    await cachedFetch(writeRpc, { method: 'POST', body: '{}' });
    await cachedFetch(readRpc, { method: 'POST', body: '{"club":"one"}' });

    expect(nativeFetch).toHaveBeenCalledTimes(3);
  });

  it('caches the owner-profit snapshot RPC', async () => {
    const nativeFetch = vi.fn(async () => jsonResponse({ monthlyBalances: [] })) as unknown as typeof fetch;
    const cachedFetch = createSupabaseReadFetch(nativeFetch, SUPABASE_URL);
    const readRpc = `${SUPABASE_URL}/rest/v1/rpc/get_owner_profit_snapshot`;

    await cachedFetch(readRpc, { method: 'POST', body: '{"club":"one"}' });
    await cachedFetch(readRpc, { method: 'POST', body: '{"club":"one"}' });

    expect(nativeFetch).toHaveBeenCalledTimes(1);
  });

  it('invalidates cached table reads before a mutation', async () => {
    const nativeFetch = vi.fn(async () => jsonResponse({ ok: true })) as unknown as typeof fetch;
    const cachedFetch = createSupabaseReadFetch(nativeFetch, SUPABASE_URL);
    const url = `${SUPABASE_URL}/rest/v1/expenses?select=id`;

    await cachedFetch(url);
    await cachedFetch(url);
    await cachedFetch(`${SUPABASE_URL}/rest/v1/expenses`, { method: 'POST', body: '{}' });
    await cachedFetch(url);

    expect(nativeFetch).toHaveBeenCalledTimes(3);
  });

  it('does not cache failed reads', async () => {
    const nativeFetch = vi.fn(async () => jsonResponse({ message: 'failed' }, 500)) as unknown as typeof fetch;
    const cachedFetch = createSupabaseReadFetch(nativeFetch, SUPABASE_URL);
    const url = `${SUPABASE_URL}/rest/v1/products?select=id`;

    const first = await cachedFetch(url);
    const second = await cachedFetch(url);

    expect(first.status).toBe(500);
    expect(second.status).toBe(500);
    expect(nativeFetch).toHaveBeenCalledTimes(2);
  });
});

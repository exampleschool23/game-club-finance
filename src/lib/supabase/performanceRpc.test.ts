import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  markPerformanceRpcAvailable,
  markPerformanceRpcMissing,
  PERFORMANCE_RPC_MISSING_TTL_MS,
  shouldTryPerformanceRpc,
} from './performanceRpc';

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

describe('performance RPC availability cache', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { sessionStorage: createMemoryStorage() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('temporarily avoids a known-missing RPC', () => {
    markPerformanceRpcMissing(10_000);

    expect(shouldTryPerformanceRpc(10_000 + PERFORMANCE_RPC_MISSING_TTL_MS - 1)).toBe(false);
  });

  it('retries after the short deployment window instead of pinning the fallback to the tab', () => {
    markPerformanceRpcMissing(10_000);

    expect(shouldTryPerformanceRpc(10_000 + PERFORMANCE_RPC_MISSING_TTL_MS)).toBe(true);
    expect(shouldTryPerformanceRpc(10_000 + PERFORMANCE_RPC_MISSING_TTL_MS + 1)).toBe(true);
  });

  it('ignores and removes the legacy permanent cache flag', () => {
    window.sessionStorage.setItem('game-club-finance:migration-030-rpcs-missing', 'true');

    expect(shouldTryPerformanceRpc(10_000)).toBe(true);
    expect(window.sessionStorage.getItem('game-club-finance:migration-030-rpcs-missing')).toBeNull();
  });

  it('clears a missing marker after a successful RPC', () => {
    markPerformanceRpcMissing(10_000);
    markPerformanceRpcAvailable();

    expect(shouldTryPerformanceRpc(10_001)).toBe(true);
  });
});

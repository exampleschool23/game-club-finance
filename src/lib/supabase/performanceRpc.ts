const PERFORMANCE_RPC_MISSING_SESSION_KEY = 'game-club-finance:performance-rpc-missing:v2';
const LEGACY_PERFORMANCE_RPC_MISSING_SESSION_KEY = 'game-club-finance:migration-030-rpcs-missing';

// A missing RPC is normally a short deployment-ordering problem: the browser
// can receive new application code before the database migration finishes.
// Do not pin the much larger table-query fallback to the lifetime of the tab.
export const PERFORMANCE_RPC_MISSING_TTL_MS = 60_000;

export function shouldTryPerformanceRpc(now = Date.now()): boolean {
  if (typeof window === 'undefined') return true;

  const missingAt = Number(window.sessionStorage.getItem(PERFORMANCE_RPC_MISSING_SESSION_KEY));
  if (!Number.isFinite(missingAt) || missingAt <= 0 || now - missingAt >= PERFORMANCE_RPC_MISSING_TTL_MS) {
    window.sessionStorage.removeItem(PERFORMANCE_RPC_MISSING_SESSION_KEY);
    window.sessionStorage.removeItem(LEGACY_PERFORMANCE_RPC_MISSING_SESSION_KEY);
    return true;
  }

  return false;
}

export function markPerformanceRpcAvailable(): void {
  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(PERFORMANCE_RPC_MISSING_SESSION_KEY);
    window.sessionStorage.removeItem(LEGACY_PERFORMANCE_RPC_MISSING_SESSION_KEY);
  }
}

export function markPerformanceRpcMissing(now = Date.now()): void {
  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(PERFORMANCE_RPC_MISSING_SESSION_KEY, String(now));
    window.sessionStorage.removeItem(LEGACY_PERFORMANCE_RPC_MISSING_SESSION_KEY);
  }
}

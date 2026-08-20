const PERFORMANCE_RPC_MISSING_SESSION_KEY = 'game-club-finance:migration-030-rpcs-missing';

export function shouldTryPerformanceRpc(): boolean {
  return typeof window === 'undefined'
    || window.sessionStorage.getItem(PERFORMANCE_RPC_MISSING_SESSION_KEY) !== 'true';
}

export function markPerformanceRpcAvailable(): void {
  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(PERFORMANCE_RPC_MISSING_SESSION_KEY);
  }
}

export function markPerformanceRpcMissing(): void {
  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(PERFORMANCE_RPC_MISSING_SESSION_KEY, 'true');
  }
}

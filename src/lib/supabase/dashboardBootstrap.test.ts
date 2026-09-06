import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  getCookie: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('react', () => ({ cache: (fn: unknown) => fn }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: mocks.getCookie }) }));
vi.mock('./server', () => ({ createClient: async () => ({
  auth: { getUser: mocks.getUser }, rpc: mocks.rpc, from: mocks.from,
}) }));

import { getDashboardBootstrap } from './dashboardBootstrap';

describe('getDashboardBootstrap', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'user@example.test' } } });
  });

  it('returns null only for an unauthenticated user without querying account data', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect(await getDashboardBootstrap()).toBeNull();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('loads memberships in one call and validates the selected club cookie', async () => {
    mocks.getCookie.mockReturnValue({ value: 'someone-elses-club' });
    mocks.rpc.mockResolvedValue({ data: {
      profile: { full_name: 'Test User', role: 'viewer' },
      memberships: [{ club_id: 'club-1', user_id: 'user-1', role: 'owner' }],
    }, error: null });
    expect(await getDashboardBootstrap()).toMatchObject({
      initialSelectedClubId: 'club-1', initialFullName: 'Test User', userId: 'user-1',
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each([
    { code: '57014', message: 'statement timeout' },
    { code: '42501', message: 'permission denied for function get_dashboard_bootstrap' },
  ])('does not convert a database failure into a login redirect: $code', async (error) => {
    mocks.rpc.mockResolvedValue({ data: null, error });
    await expect(getDashboardBootstrap()).rejects.toThrow('Could not load dashboard account data');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('uses the legacy queries when the bootstrap migration is not yet installed', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } });
    const profile = { data: { full_name: 'Legacy User', role: 'viewer' }, error: null };
    const memberships = { data: [{ club_id: 'club-legacy' }], error: null };
    mocks.from.mockImplementation((table) => ({ select: () => ({ eq: () => ({
      maybeSingle: async () => profile,
      order: async () => table === 'club_memberships' ? memberships : profile,
    }) }) }));
    expect(await getDashboardBootstrap()).toMatchObject({
      initialSelectedClubId: 'club-legacy', initialFullName: 'Legacy User',
    });
    expect(mocks.from).toHaveBeenCalledTimes(2);
  });
});

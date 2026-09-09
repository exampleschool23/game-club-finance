import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), createClient: vi.fn() }));
vi.mock('@supabase/ssr', () => ({ createServerClient: mocks.createClient }));

import { proxy } from './proxy';

function request(path: string, authenticated = false) {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: authenticated ? { cookie: 'sb-project-auth-token=session-placeholder' } : {},
  });
}

describe('auth routing latency', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createClient.mockReturnValue({ auth: { getUser: mocks.getUser } });
  });

  it('redirects an anonymous protected request without a network round trip', async () => {
    const response = await proxy(request('/daily-cash'));
    expect(response.headers.get('location')).toBe('http://localhost:3000/login');
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('renders anonymous login without calling Auth', async () => {
    const response = await proxy(request('/login'));
    expect(response.headers.get('location')).toBeNull();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('leaves cookie-bearing protected requests for authoritative layout validation', async () => {
    const response = await proxy(request('/daily-cash', true));
    expect(response.headers.get('location')).toBeNull();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('still validates a cookie on login before redirecting to the dashboard', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const response = await proxy(request('/login', true));
    expect(mocks.getUser).toHaveBeenCalledOnce();
    expect(response.headers.get('location')).toBe('http://localhost:3000/');
  });

  it('does not redirect auth callbacks away before exchanging their code', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const response = await proxy(request('/auth/callback?code=test'));
    expect(response.headers.get('location')).toBeNull();
  });
});

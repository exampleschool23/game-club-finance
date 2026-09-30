'use client';

import { useCallback, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Signs out and hard-navigates to /login. A full navigation (instead of
 * router.push) drops the client router cache, so Back cannot flash the
 * previous user's cached dashboard totals.
 */
export function useSignOut() {
  const [signingOut, setSigningOut] = useState(false);

  const signOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await createClient().auth.signOut();
    } catch {
      // Even if the network call fails, leave the app; the proxy re-checks the session.
    } finally {
      window.location.replace('/login');
    }
  }, [signingOut]);

  return { signOut, signingOut };
}

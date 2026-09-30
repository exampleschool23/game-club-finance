'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Number of signed-up people who have no club access yet. Owners see it as a
 * badge on the Team item so a new employee's request is noticed without
 * opening the page. Non-owners cannot read other profiles, so the hook stays
 * idle for them.
 */
export function usePendingTeamCount(enabled: boolean, refreshKey: string) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    let cancelled = false;
    const supabase = createClient();

    Promise.all([
      supabase.from('profiles').select('id'),
      supabase.from('club_memberships').select('user_id'),
    ])
      .then(([profileRes, membershipRes]) => {
        if (cancelled || profileRes.error || membershipRes.error) return;
        const profiles = (profileRes.data ?? []) as Array<{ id: string }>;
        const memberships = (membershipRes.data ?? []) as Array<{ user_id: string }>;
        const withAccess = new Set(memberships.map((row) => row.user_id));
        setCount(profiles.filter((row) => !withAccess.has(row.id)).length);
      })
      .catch(() => {
        // Badge only; a failed read leaves it hidden.
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, refreshKey]);

  return count;
}

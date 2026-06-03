import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { cache } from 'react';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component — handled by middleware
          }
        },
      },
    }
  );
}

/**
 * Authenticates and returns the current user.
 * Supabase warns against trusting getSession().user on the server because it
 * only reflects cookie storage. getUser() validates with Supabase Auth.
 */
export const getServerUser = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
});

/**
 * Returns the current user's profile (full_name, role) from the database.
 * Wrapped in React cache() so multiple server components in the same request
 * share one DB round-trip instead of each issuing their own query.
 */
export const getServerProfile = cache(async () => {
  const user = await getServerUser();
  if (!user) return null;

  const supabase = await createClient();

  const { data } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single();

  return data ?? null;
});

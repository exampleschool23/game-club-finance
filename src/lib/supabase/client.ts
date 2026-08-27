import { createBrowserClient } from '@supabase/ssr';
import { createSupabaseReadFetch } from './readCache';

type BrowserSupabaseClient = ReturnType<typeof createBrowserClient>;

let browserClient: BrowserSupabaseClient | undefined;
let cachedFetch: typeof fetch | undefined;

export function createClient() {
  if (!browserClient) {
    cachedFetch ??= createSupabaseReadFetch(
      window.fetch.bind(window),
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
    );
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { fetch: cachedFetch } },
    );
  }

  return browserClient;
}

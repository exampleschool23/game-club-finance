import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  // Google / Supabase returned an OAuth error (e.g. user denied, bad redirect URL)
  if (error) {
    const loginUrl = new URL('/login', origin);
    loginUrl.searchParams.set('error', errorDescription ?? error);
    return NextResponse.redirect(loginUrl);
  }

  if (!code) {
    return NextResponse.redirect(new URL('/login', origin));
  }

  const response = NextResponse.redirect(`${origin}/`);

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
            });
          },
        },
      }
    );
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      const loginUrl = new URL('/login', origin);
      loginUrl.searchParams.set('error', exchangeError.message);
      return NextResponse.redirect(loginUrl);
    }
  } catch {
    return NextResponse.redirect(new URL('/login', origin));
  }

  return response;
}

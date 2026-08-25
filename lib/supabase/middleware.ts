import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/lib/db/database.types';

/** Paths that do not require a session. */
const PUBLIC_PATHS = [
  '/login',
  '/auth',
  // The offline shell has to render without a session: the worker serves it
  // when there is no network to check one against.
  '/offline',
  // The visual preview used for design review and screenshots. The route
  // itself 404s outside development, so this never opens anything in a
  // deployed build.
  ...(process.env.NODE_ENV === 'production' ? [] : ['/dev']),
];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(toSet) {
          for (const { name, value } of toSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of toSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Refreshes the session cookie. Must run before any redirect decision.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // Cron routes carry their own bearer token instead of a session, so the
  // session gate must let them through to be judged on that.
  if (pathname.startsWith('/api/cron/')) return response;

  // Exactly the two OAuth routes the browser navigates to. A signed-out visit
  // should land on the login screen rather than show raw JSON, and both do
  // their own session check.
  //
  // Matched exactly, not by prefix: /disconnect sits under the same path but is
  // called with fetch, and fetch follows redirects — so a 307 there would come
  // back as a 200 login page and read as a successful disconnect.
  const OAUTH_NAVIGATIONS = [
    '/api/integrations/google',
    '/api/integrations/google/callback',
  ];
  const isOauthNavigation = OAUTH_NAVIGATIONS.includes(pathname);

  // Everything else under /api answers with a status, never a redirect. fetch
  // follows redirects transparently, so a 307 to /login would come back as a
  // 200 page and the offline queue would take it for a successful write and
  // drop the entry.
  if (!user && pathname.startsWith('/api/') && !isOauthNavigation) {
    return NextResponse.json(
      { ok: false, error: 'Je sessie is verlopen. Log opnieuw in.', retryable: false },
      { status: 401 },
    );
  }

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/vandaag';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

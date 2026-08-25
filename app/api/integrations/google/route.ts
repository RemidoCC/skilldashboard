import { NextResponse, type NextRequest } from 'next/server';
import { currentUser } from '@/lib/supabase/server';
import { consentUrl, googleConfig } from '@/lib/server/google';

/** Starts the consent flow. */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL('/login', request.nextUrl.origin));

  const config = googleConfig(request.nextUrl.origin);
  if (!config) {
    const url = new URL('/beheer', request.nextUrl.origin);
    url.searchParams.set('google', 'niet-ingesteld');
    return NextResponse.redirect(url);
  }

  // The state is checked on the way back, so a stray callback cannot connect
  // an account on its own.
  const state = crypto.randomUUID();
  const response = NextResponse.redirect(consentUrl(config, state));
  response.cookies.set('google_oauth_state', state, {
    httpOnly: true,
    secure: request.nextUrl.protocol === 'https:',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return response;
}

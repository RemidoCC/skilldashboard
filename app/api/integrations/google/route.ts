import { NextResponse, type NextRequest } from 'next/server';
import { currentUser } from '@/lib/supabase/server';
import { consentUrl, googleConfig } from '@/lib/server/google';
import { isEncryptionConfigured } from '@/lib/server/secrets';

/** Starts the consent flow. */
export const dynamic = 'force-dynamic';

function back(origin: string, status: string) {
  const url = new URL('/beheer', origin);
  url.searchParams.set('google', status);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL('/login', request.nextUrl.origin));

  const config = googleConfig(request.nextUrl.origin);
  if (!config) return back(request.nextUrl.origin, 'niet-ingesteld');

  // Turned away here rather than after consent: asking Google for a token we
  // have no key to protect would be worse than not asking.
  if (!isEncryptionConfigured()) return back(request.nextUrl.origin, 'geen-sleutel');

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

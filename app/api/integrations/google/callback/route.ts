import { NextResponse, type NextRequest } from 'next/server';
import { currentUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { exchangeCode, googleConfig } from '@/lib/server/google';
import { encryptSecret, isEncryptionConfigured } from '@/lib/server/secrets';

/**
 * Where Google sends the user back.
 *
 * The refresh token is encrypted before it is written, with the service role,
 * and never returned to the browser. RLS keeps a signed-in client from reading
 * the column at all; the encryption means a copy of the database is not enough
 * either.
 */
export const dynamic = 'force-dynamic';

function back(origin: string, status: string) {
  const url = new URL('/beheer', origin);
  url.searchParams.set('google', status);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;

  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL('/login', origin));

  if (searchParams.get('error')) return back(origin, 'geweigerd');

  const state = searchParams.get('state');
  const expected = request.cookies.get('google_oauth_state')?.value;
  if (!state || !expected || state !== expected) return back(origin, 'ongeldig');

  const code = searchParams.get('code');
  if (!code) return back(origin, 'ongeldig');

  const config = googleConfig(origin);
  if (!config) return back(origin, 'niet-ingesteld');

  // Checked before the exchange, not after: a token we cannot encrypt is a
  // token we should never have asked Google for.
  if (!isEncryptionConfigured()) return back(origin, 'geen-sleutel');

  const result = await exchangeCode(config, code);
  if ('error' in result) return back(origin, 'mislukt');

  const db = createAdminClient();
  const { error } = await db.from('integration_accounts').upsert(
    {
      user_id: user.id,
      provider: 'google',
      refresh_token: encryptSecret(result.refreshToken),
      scopes: result.scopes,
      connected_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,provider' },
  );

  const response = back(origin, error ? 'mislukt' : 'gekoppeld');
  response.cookies.delete('google_oauth_state');
  return response;
}

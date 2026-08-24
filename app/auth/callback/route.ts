import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** Where the magic link lands. Trades the one-time code for a session. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');

  if (!code) {
    const url = new URL('/login', origin);
    url.searchParams.set('fout', 'ontbrekende-code');
    return NextResponse.redirect(url);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const url = new URL('/login', origin);
    url.searchParams.set('fout', 'verlopen');
    return NextResponse.redirect(url);
  }

  return NextResponse.redirect(new URL('/vandaag', origin));
}

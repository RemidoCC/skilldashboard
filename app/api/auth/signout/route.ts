import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Ends the session.
 *
 * A POST, not a GET: a link prefetch or a stray image request must not be able
 * to sign you out. The client clears the worker's caches and the write queue
 * afterwards — this route only owns the session.
 */
export const dynamic = 'force-dynamic';

export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
}

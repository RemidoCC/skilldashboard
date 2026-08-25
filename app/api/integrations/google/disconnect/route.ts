import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revoke } from '@/lib/server/google';
import { decryptSecret } from '@/lib/server/secrets';

/** Withdraws the connection here and at Google. */
export const dynamic = 'force-dynamic';

export async function POST() {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Niet ingelogd.' }, { status: 401 });
  }

  const db = createAdminClient();
  const { data } = await db
    .from('integration_accounts')
    .select('refresh_token')
    .eq('user_id', user.id)
    .eq('provider', 'google')
    .maybeSingle();

  // Revoking at Google needs the token in the clear. If it will not open — a
  // rotated key, an altered row — the local record still goes, because leaving
  // a connection the app can no longer use would be the worse outcome.
  if (data?.refresh_token) {
    try {
      await revoke(decryptSecret(data.refresh_token));
    } catch {
      // Best effort, same as a revoke call that fails at Google's end.
    }
  }

  const { error } = await db
    .from('integration_accounts')
    .delete()
    .eq('user_id', user.id)
    .eq('provider', 'google');

  if (error) {
    return NextResponse.json(
      { ok: false, error: `Ontkoppelen mislukte: ${error.message}` },
      { status: 503 },
    );
  }

  // Suggestions that were never acted on go with it; keeping them would leave
  // the inbox pointing at a source that is no longer connected.
  await db.from('inbox_items').delete().eq('user_id', user.id).eq('status', 'pending');

  return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
}

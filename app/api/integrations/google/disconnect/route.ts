import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revoke } from '@/lib/server/google';

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

  if (data?.refresh_token) await revoke(data.refresh_token);

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

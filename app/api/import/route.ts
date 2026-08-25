import { NextResponse, type NextRequest } from 'next/server';
import { createClient, currentUser } from '@/lib/supabase/server';
import { checkRestore, MAX_ROWS } from '@/lib/domain/restore';

/**
 * Putting an export back.
 *
 * The one destructive endpoint in the app: it replaces the account rather than
 * adding to it. Three things stand between a file and the database — the
 * reader in lib/domain/restore.ts, which strips the payload to columns that
 * exist and refuses anything else; restore_account, which does the whole
 * replacement in one transaction so a failure leaves the old account intact;
 * and RLS, which checks the owner a second time.
 *
 * It runs on the caller's own session, not the service role. A restore has no
 * business reaching past the row policies that guard every other write.
 */
export const dynamic = 'force-dynamic';

/** Roughly MAX_ROWS of the widest rows, so a stray upload is refused early. */
const MAX_BYTES = 64 * 1024 * 1024;

function refuse(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status, headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return refuse('Je sessie is verlopen. Log opnieuw in.', 401);

  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_BYTES) {
    return refuse(`Het bestand is groter dan ${MAX_BYTES / 1024 / 1024} MB.`, 413);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return refuse('Dit bestand is geen leesbare JSON.');
  }

  const check = checkRestore(payload);
  if (!check.ok) return refuse(check.error);
  if (check.total > MAX_ROWS) return refuse(`Het bestand bevat meer dan ${MAX_ROWS} rijen.`, 413);

  // Keyed by table name, which is what the function reads. The rows carry no
  // user_id at all; restore_account fills it in from the session.
  const body = Object.fromEntries(check.tables.map((t) => [t.table, t.rows]));

  const supabase = await createClient();
  const { error } = await supabase.rpc('restore_account', { p_payload: body });

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        // Nothing landed: the function is one transaction.
        error: `Terugzetten mislukte, en er is niets veranderd. ${error.message}`,
      },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }

  return NextResponse.json(
    { ok: true, schema: check.schema, total: check.total },
    { headers: { 'cache-control': 'no-store' } },
  );
}

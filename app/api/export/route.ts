import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/supabase/server';
import { loadExport } from '@/lib/data/beheer';

/** The whole account as one JSON file, ledger included. */
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: 'Je sessie is verlopen. Log opnieuw in.' },
      { status: 401 },
    );
  }

  const data = await loadExport();
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="skill-unit-${stamp}.json"`,
      // A backup must never come from a cache.
      'cache-control': 'no-store',
    },
  });
}

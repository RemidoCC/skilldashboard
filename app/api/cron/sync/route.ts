import { NextResponse, type NextRequest } from 'next/server';
import { isAuthorisedCron } from '@/lib/supabase/admin';
import { runSyncJob } from '@/lib/server/sync';

/**
 * Pulls yesterday's and today's finished calendar events and sent mail, twice
 * a day, and files them as suggestions. Never awards anything.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  if (!isAuthorisedCron(request)) {
    return NextResponse.json({ ok: false, error: 'Niet toegestaan.' }, { status: 401 });
  }

  try {
    const report = await runSyncJob(request.nextUrl.origin);
    return NextResponse.json({ ok: true, ...report });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Onbekende fout.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

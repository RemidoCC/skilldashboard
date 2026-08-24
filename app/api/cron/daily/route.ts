import { NextResponse } from 'next/server';
import { isAuthorisedCron } from '@/lib/supabase/admin';
import { runDailyJob } from '@/lib/server/jobs';

/**
 * Rust and streak freezes, once a day before the user is likely awake.
 *
 * Both are safe to run twice: rust applies once per episode of inactivity,
 * and a freeze is granted once per week and spent once per day.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorisedCron(request)) {
    return NextResponse.json({ ok: false, error: 'Niet toegestaan.' }, { status: 401 });
  }

  try {
    const report = await runDailyJob();
    return NextResponse.json({ ok: true, ...report });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Onbekende fout.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

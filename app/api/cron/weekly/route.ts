import { NextResponse } from 'next/server';
import { isAuthorisedCron } from '@/lib/supabase/admin';
import { runWeeklyJob } from '@/lib/server/jobs';

/**
 * Monday morning: roll the season over if its twelve weeks are up, then put
 * three quests on the new week.
 *
 * Idempotent by week, so a retry or a Monday that fires after the user already
 * accepted a set from the Sunday report changes nothing.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorisedCron(request)) {
    return NextResponse.json({ ok: false, error: 'Niet toegestaan.' }, { status: 401 });
  }

  try {
    const report = await runWeeklyJob();
    return NextResponse.json({ ok: true, ...report });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Onbekende fout.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

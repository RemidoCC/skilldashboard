import { NextResponse, type NextRequest } from 'next/server';
import {
  recordQuickLog,
  recordTaskCompletion,
  type CompletionOutcome,
} from '@/lib/server/completions';

/**
 * The single write endpoint for completions.
 *
 * This is a route handler rather than a server action because the offline
 * queue has to be replayable by the service worker, and a service worker can
 * replay a fetch but not a server action. Every write in the app goes through
 * here, online or not.
 *
 * Idempotent: the client supplies entryId, and log_completion ignores a second
 * insert of the same id. Replaying a queued mutation is therefore always safe.
 */
export const dynamic = 'force-dynamic';

interface Body {
  kind?: unknown;
  entryId?: unknown;
  taskId?: unknown;
  skillId?: unknown;
  title?: unknown;
  xp?: unknown;
  minutes?: unknown;
  note?: unknown;
  occurredAt?: unknown;
}

function statusFor(outcome: CompletionOutcome): number {
  if (outcome.ok) return 200;
  // A retryable failure gets a 5xx so the queue keeps the mutation; anything
  // else is the client's problem and must not be retried forever.
  return outcome.retryable ? 503 : 400;
}

export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Onleesbare aanvraag.', retryable: false },
      { status: 400 },
    );
  }

  const entryId = typeof body.entryId === 'string' ? body.entryId : '';
  const note = typeof body.note === 'string' ? body.note : undefined;
  const occurredAt = typeof body.occurredAt === 'string' ? body.occurredAt : undefined;

  let outcome: CompletionOutcome;

  if (body.kind === 'task') {
    outcome = await recordTaskCompletion({
      entryId,
      taskId: typeof body.taskId === 'string' ? body.taskId : '',
      minutes: typeof body.minutes === 'number' ? body.minutes : undefined,
      note,
      occurredAt,
    });
  } else if (body.kind === 'quick') {
    outcome = await recordQuickLog({
      entryId,
      skillId: typeof body.skillId === 'string' ? body.skillId : '',
      title: typeof body.title === 'string' ? body.title : '',
      xp: typeof body.xp === 'number' ? body.xp : Number.NaN,
      note,
      occurredAt,
    });
  } else {
    return NextResponse.json(
      { ok: false, error: 'Onbekend soort registratie.', retryable: false },
      { status: 400 },
    );
  }

  return NextResponse.json(outcome, { status: statusFor(outcome) });
}

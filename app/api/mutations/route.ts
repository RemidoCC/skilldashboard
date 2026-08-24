import { NextResponse, type NextRequest } from 'next/server';
import { applyMutation } from '@/lib/server/mutations';
import type { Mutation } from '@/lib/offline/mutations';

/**
 * The single endpoint for edits made in Beheer.
 *
 * A route handler for the same reason completions use one: the offline queue
 * has to be replayable, and a service worker can replay a fetch but not a
 * server action.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let mutation: Mutation;
  try {
    mutation = (await request.json()) as Mutation;
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Onleesbare aanvraag.', retryable: false },
      { status: 400 },
    );
  }

  if (!mutation || typeof mutation !== 'object' || typeof mutation.kind !== 'string') {
    return NextResponse.json(
      { ok: false, error: 'Onbekende wijziging.', retryable: false },
      { status: 400 },
    );
  }

  const outcome = await applyMutation(mutation);
  // Retryable failures get a 5xx so the queue keeps them; the rest are final.
  const status = outcome.ok ? 200 : outcome.retryable ? 503 : 400;
  return NextResponse.json(outcome, { status });
}

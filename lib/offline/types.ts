/**
 * The shape of a queued write.
 *
 * Kept deliberately flat and simple because two very different pieces of code
 * read this store: the page (through idb) and the service worker (through raw
 * IndexedDB, which cannot bundle a helper library).
 */
export const DB_NAME = 'skillunit';
export const DB_VERSION = 3;
export const QUEUE_STORE = 'pending-completions';
/**
 * Edits made in Beheer. Kept apart from completions because the two replay
 * differently: a completion is additive and idempotent by entry id, an edit
 * overwrites and the last one simply wins.
 */
export const MUTATION_STORE = 'pending-mutations';
/**
 * Writes that can never succeed — a deleted task, a dead session. They are
 * parked here rather than reported over a channel, because the worker often
 * drains the queue with no page open to hear it. The next page load picks
 * them up and tells the user what was lost.
 */
export const FAILURE_STORE = 'failed-completions';

/** Broadcast channel the worker and the page use to stay in step. */
export const SYNC_CHANNEL = 'skillunit-sync';
/** Background Sync tag. */
export const SYNC_TAG = 'skillunit-completions';

export type PendingKind = 'task' | 'quick';

export interface PendingCompletion {
  /** Also the idempotency key handed to log_completion. */
  id: string;
  kind: PendingKind;
  /** Which skill it lands on, so the meters can move before the network answers. */
  skillId: string;
  /** What the row will say. Shown while pending. */
  title: string;
  /** Provisional XP, computed client-side from the streak the page rendered
   *  with. The server recomputes the authoritative figure on replay. */
  xp: number;
  taskId: string | null;
  minutes: number | null;
  note: string | null;
  /** When the user actually did it, not when it reached the server. */
  occurredAt: string;
  attempts: number;
}

export interface FailedCompletion {
  id: string;
  title: string;
  message: string;
  occurredAt: string;
}

/** The request body the endpoint expects. */
export function toRequestBody(pending: PendingCompletion): Record<string, unknown> {
  return pending.kind === 'task'
    ? {
        kind: 'task',
        entryId: pending.id,
        taskId: pending.taskId,
        minutes: pending.minutes ?? undefined,
        note: pending.note ?? undefined,
        occurredAt: pending.occurredAt,
      }
    : {
        kind: 'quick',
        entryId: pending.id,
        skillId: pending.skillId,
        title: pending.title,
        xp: pending.xp,
        note: pending.note ?? undefined,
        occurredAt: pending.occurredAt,
      };
}

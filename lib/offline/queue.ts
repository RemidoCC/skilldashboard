'use client';

import { openDB, type IDBPDatabase } from 'idb';
import {
  DB_NAME,
  DB_VERSION,
  FAILURE_STORE,
  MUTATION_STORE,
  QUEUE_STORE,
  SYNC_TAG,
  toRequestBody,
  type FailedCompletion,
  type PendingCompletion,
} from './types';
import type { Mutation, PendingMutation } from './mutations';

/**
 * The offline write queue.
 *
 * Every completion is written here first and sent second, so the UI never
 * waits on the network and a write made in a tunnel is not lost. Replay is
 * safe because the endpoint is idempotent on the entry id.
 */

let handle: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  handle ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(QUEUE_STORE)) {
        const store = database.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
        // Replay in the order the work actually happened.
        store.createIndex('occurredAt', 'occurredAt');
      }
      if (!database.objectStoreNames.contains(FAILURE_STORE)) {
        database.createObjectStore(FAILURE_STORE, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(MUTATION_STORE)) {
        // queueId sorts by time, so getAll replays in the order they were made.
        database.createObjectStore(MUTATION_STORE, { keyPath: 'queueId' });
      }
    },
  });
  return handle;
}

export async function enqueue(pending: PendingCompletion): Promise<void> {
  const database = await db();
  await database.put(QUEUE_STORE, pending);
}

export async function pending(): Promise<PendingCompletion[]> {
  const database = await db();
  const all = (await database.getAllFromIndex(
    QUEUE_STORE,
    'occurredAt',
  )) as PendingCompletion[];
  return all;
}

export async function forget(id: string): Promise<void> {
  const database = await db();
  await database.delete(QUEUE_STORE, id);
}

/**
 * How often a write may come back a server error before it is parked.
 *
 * `attempts` was counted and never read, so a write the server kept refusing
 * with a 5xx cycled for as long as the app was open: never sent, never parked,
 * never mentioned. A ceiling turns "this is not working" into something the
 * user can actually see.
 */
export const MAX_ATTEMPTS = 8;

async function bumpAttempts(item: PendingCompletion): Promise<void> {
  const database = await db();
  await database.put(QUEUE_STORE, { ...item, attempts: item.attempts + 1 });
}

/* ------------------------------------------------------------- mutations -- */

/**
 * A stamp that never repeats and never goes backwards.
 *
 * The queue id sorts the edits, and edits are order-dependent. A plain
 * `Date.now()` is not enough: a handler that queues several in a loop — the
 * goal proposals do exactly that — lands two or more in the same millisecond,
 * and the random tail that keeps them from colliding then decides their order
 * by coin flip. Measured on this machine, a four-edit burst came back out of
 * order about two runs in five. Nudging a repeated millisecond forward keeps
 * the ids strictly increasing, so sorting them is sorting by the order they
 * were made.
 */
let lastStamp = 0;

function nextStamp(): string {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return new Date(lastStamp).toISOString();
}

export async function enqueueMutation(mutation: Mutation): Promise<PendingMutation> {
  const stamp = nextStamp();
  const item: PendingMutation = {
    // Strictly increasing, so the store replays in the order the edits were
    // made. The random tail only guards against a clash across sessions.
    queueId: `${stamp}-${crypto.randomUUID().slice(0, 8)}`,
    mutation,
    createdAt: stamp,
    attempts: 0,
  };
  const database = await db();
  await database.put(MUTATION_STORE, item);
  return item;
}

export async function pendingMutations(): Promise<PendingMutation[]> {
  const database = await db();
  const all = (await database.getAll(MUTATION_STORE)) as PendingMutation[];
  return all.sort((a, b) => (a.queueId < b.queueId ? -1 : a.queueId > b.queueId ? 1 : 0));
}

async function forgetMutation(queueId: string): Promise<void> {
  const database = await db();
  await database.delete(MUTATION_STORE, queueId);
}

/**
 * Sends queued edits, oldest first, and stops at the first one that cannot go
 * through. Edits are order-dependent — renaming a skill then switching it off
 * must not arrive the other way round — so a blocked queue waits rather than
 * skipping ahead.
 */
export async function flushMutations(): Promise<{
  sent: number;
  remaining: number;
  blocked: Blocked;
}> {
  let sent = 0;
  let blocked: Blocked = null;
  for (const item of await pendingMutations()) {
    let response: Response;
    try {
      response = await fetch('/api/mutations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(item.mutation),
      });
    } catch {
      blocked = 'offline'; // Everything behind it waits too.
      break;
    }

    if (response.ok) {
      await forgetMutation(item.queueId);
      sent += 1;
      continue;
    }

    if (response.status >= 400 && response.status < 500) {
      let message = 'Deze wijziging kon niet worden opgeslagen.';
      try {
        const body: unknown = await response.json();
        if (body && typeof body === 'object' && 'error' in body) {
          message = String((body as { error: unknown }).error);
        }
      } catch {
        // Keep the default.
      }
      const database = await db();
      await database.put(FAILURE_STORE, {
        id: item.queueId,
        title: describeMutation(item.mutation),
        message,
        occurredAt: item.createdAt,
      } satisfies FailedCompletion);
      await forgetMutation(item.queueId);
      continue;
    }

    blocked = 'server'; // Keep it and stop, so order holds.
    break;
  }

  return { sent, remaining: (await pendingMutations()).length, blocked };
}

/** A short human name for a mutation, used when one has to be reported. */
export function describeMutation(mutation: Mutation): string {
  switch (mutation.kind) {
    case 'task.create':
      return `Nieuwe taak "${mutation.task.title}"`;
    case 'task.update':
      return 'Wijziging aan een taak';
    case 'skill.create':
      return `Nieuwe vaardigheid "${mutation.skill.name}"`;
    case 'skill.update':
      return 'Wijziging aan een vaardigheid';
    case 'goal.create':
      return `Nieuw doel "${mutation.goal.title}"`;
    case 'goal.update':
      return 'Wijziging aan een doel';
    case 'goal.delete':
      return 'Verwijderd doel';
    case 'week.capacity':
      return 'Weekinstelling';
    case 'quest.accept':
      return 'Opdrachten voor volgende week';
    case 'inbox.resolve':
      return mutation.accept ? 'Voorstel meegeteld' : 'Voorstel weggezet';
    case 'rule.create':
      return `Nieuwe koppelregel "${mutation.rule.pattern}"`;
    case 'rule.delete':
      return 'Verwijderde koppelregel';
    case 'entry.revert':
      return 'Teruggedraaide registratie';
  }
}

/* ----------------------------------------------------------- completions -- */

/**
 * Why a queue that still has work in it is not moving.
 *
 * `null` means it emptied. The distinction matters because the sync bar used
 * to report every stalled queue as "wacht op verbinding", including the case
 * where the connection is fine and the server is refusing — an instrument
 * naming a cause it had not measured.
 */
export type Blocked = 'offline' | 'server' | null;

export interface FlushReport {
  sent: number;
  dropped: number;
  remaining: number;
  blocked: Blocked;
}

/**
 * The parked failures, including whatever the worker left while no page was
 * open. Reading does not clear them: a failure stays until the user has
 * actually seen and dismissed it, so a remount or a second tab cannot make a
 * lost write disappear before it is read.
 */
export async function readFailures(): Promise<FailedCompletion[]> {
  const database = await db();
  return (await database.getAll(FAILURE_STORE)) as FailedCompletion[];
}

/** Acknowledges one failure. This is the only thing that removes it. */
export async function dismissFailure(id: string): Promise<void> {
  const database = await db();
  await database.delete(FAILURE_STORE, id);
}

async function park(
  item: PendingCompletion,
  message: string,
  signIn = false,
): Promise<void> {
  const database = await db();
  await database.put(FAILURE_STORE, {
    id: item.id,
    title: item.title,
    message,
    occurredAt: item.occurredAt,
    // Kept whole, so "Opnieuw proberen" has something to send.
    item: { ...item, attempts: 0 },
    signIn,
  } satisfies FailedCompletion);
}

/** Puts a parked failure back in the queue, so it can be tried again. */
export async function requeueFailure(id: string): Promise<boolean> {
  const database = await db();
  const failure = (await database.get(FAILURE_STORE, id)) as FailedCompletion | undefined;
  if (!failure?.item) return false;
  await database.put(QUEUE_STORE, { ...failure.item, attempts: 0 });
  await database.delete(FAILURE_STORE, id);
  return true;
}

/**
 * Sends everything queued, oldest first.
 *
 * A 4xx means the write can never succeed — a deleted task, an expired
 * session — so the item is dropped and reported rather than retried forever.
 * A 5xx or a dead network leaves it in place for the next attempt.
 */
export async function flush(): Promise<FlushReport> {
  const report: FlushReport = { sent: 0, dropped: 0, remaining: 0, blocked: null };
  const items = await pending();

  for (const item of items) {
    let response: Response;
    try {
      response = await fetch('/api/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(toRequestBody(item)),
      });
    } catch {
      // Offline or the request never landed. Keep it and stop trying for now;
      // the rest of the queue will not fare any better.
      report.remaining = items.length - report.sent - report.dropped;
      report.blocked = 'offline';
      return report;
    }

    if (response.ok) {
      await forget(item.id);
      report.sent += 1;
      continue;
    }

    if (response.status >= 400 && response.status < 500) {
      let message = 'Deze registratie kon niet worden opgeslagen.';
      try {
        const body: unknown = await response.json();
        if (body && typeof body === 'object' && 'error' in body) {
          message = String((body as { error: unknown }).error);
        }
      } catch {
        // Keep the default message.
      }
      await park(item, message, response.status === 401);
      await forget(item.id);
      report.dropped += 1;
      continue;
    }

    // A 5xx that keeps coming back is still a write that is not landing. Say so
    // rather than turning in circles.
    if (item.attempts + 1 >= MAX_ATTEMPTS) {
      await park(
        item,
        'De server bleef deze registratie weigeren. Hij is niet opgeslagen.',
      );
      await forget(item.id);
      report.dropped += 1;
      continue;
    }

    // The connection is fine; the server is refusing. Say which.
    report.blocked = 'server';
    await bumpAttempts(item);
  }

  report.remaining = (await pending()).length;
  return report;
}

/**
 * Asks the browser to finish the queue in the background, so a completion made
 * just before the app is closed still lands. Falls back silently where
 * Background Sync is not implemented — the queue is drained on next open.
 */
export async function requestBackgroundSync(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    // SyncManager is not in the DOM lib and is absent on Safari.
    const sync = (registration as ServiceWorkerRegistration & {
      sync?: { register: (tag: string) => Promise<void> };
    }).sync;
    await sync?.register(SYNC_TAG);
  } catch {
    // Not available, or blocked. The on-open flush covers it.
  }
}

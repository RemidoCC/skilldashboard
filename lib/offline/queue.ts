'use client';

import { openDB, type IDBPDatabase } from 'idb';
import {
  DB_NAME,
  DB_VERSION,
  FAILURE_STORE,
  QUEUE_STORE,
  SYNC_TAG,
  toRequestBody,
  type FailedCompletion,
  type PendingCompletion,
} from './types';

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

async function bumpAttempts(item: PendingCompletion): Promise<void> {
  const database = await db();
  await database.put(QUEUE_STORE, { ...item, attempts: item.attempts + 1 });
}

export interface FlushReport {
  sent: number;
  dropped: number;
  remaining: number;
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

async function park(item: PendingCompletion, message: string): Promise<void> {
  const database = await db();
  await database.put(FAILURE_STORE, {
    id: item.id,
    title: item.title,
    message,
    occurredAt: item.occurredAt,
  } satisfies FailedCompletion);
}

/**
 * Sends everything queued, oldest first.
 *
 * A 4xx means the write can never succeed — a deleted task, an expired
 * session — so the item is dropped and reported rather than retried forever.
 * A 5xx or a dead network leaves it in place for the next attempt.
 */
export async function flush(): Promise<FlushReport> {
  const report: FlushReport = { sent: 0, dropped: 0, remaining: 0 };
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
      await park(item, message);
      await forget(item.id);
      report.dropped += 1;
      continue;
    }

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

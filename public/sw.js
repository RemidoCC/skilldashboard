/*
 * Skill Unit service worker.
 *
 * Hand-rolled rather than generated: the app has exactly three caching needs
 * and one background job, and a build plugin would hide all four behind
 * configuration.
 *
 * Bump VERSION to retire every old cache at once.
 */
const VERSION = 'v3';
const SHELL_CACHE = `skillunit-shell-${VERSION}`;
const PAGE_CACHE = `skillunit-pages-${VERSION}`;
const ASSET_CACHE = `skillunit-assets-${VERSION}`;

const OFFLINE_URL = '/offline';
const SHELL = [OFFLINE_URL, '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

/* The queue, shared with the page. Kept in raw IndexedDB because a worker
 * cannot pull in a helper library. Must stay in step with lib/offline/types.ts. */
const DB_NAME = 'skillunit';
const DB_VERSION = 3;
const QUEUE_STORE = 'pending-completions';
const MUTATION_STORE = 'pending-mutations';
const FAILURE_STORE = 'failed-completions';
const SYNC_TAG = 'skillunit-completions';
const SYNC_CHANNEL = 'skillunit-sync';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  const keep = new Set([SHELL_CACHE, PAGE_CACHE, ASSET_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => !keep.has(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

/* Signing out has to take the cached personal pages with it. */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'clear-caches') {
    event.waitUntil(caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n)))));
  }
});

function isStaticAsset(url) {
  return url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/');
}

/* Immutable, content-hashed: serve from cache and never revalidate. */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;

  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

/* Pages are personal and change constantly, so the network wins when it can
 * and the last good copy stands in when it cannot. */
async function networkFirst(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const hit = await cache.match(request);
    if (hit) return hit;

    const shell = await caches.open(SHELL_CACHE);
    const offline = await shell.match(OFFLINE_URL);
    return offline ?? Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Writes go straight to the network. When they fail the queue already holds
  // them, so there is nothing here to retry or cache.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Auth callbacks and the write endpoint must never be served from a cache.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
  }
});

/* ------------------------------------------------------------ background -- */

function openQueue() {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const database = open.result;
      if (!database.objectStoreNames.contains(QUEUE_STORE)) {
        const store = database.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
        store.createIndex('occurredAt', 'occurredAt');
      }
      if (!database.objectStoreNames.contains(FAILURE_STORE)) {
        database.createObjectStore(FAILURE_STORE, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(MUTATION_STORE)) {
        database.createObjectStore(MUTATION_STORE, { keyPath: 'queueId' });
      }
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}

function readAll(database) {
  return new Promise((resolve, reject) => {
    const tx = database.transaction(QUEUE_STORE, 'readonly');
    const request = tx.objectStore(QUEUE_STORE).index('occurredAt').getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/* queueId is time-ordered, so getAll comes back in the order the edits
 * were made. Order matters here in a way it does not for completions. */
function readMutations(database) {
  return new Promise((resolve, reject) => {
    const tx = database.transaction(MUTATION_STORE, 'readonly');
    const request = tx.objectStore(MUTATION_STORE).getAll();
    request.onsuccess = () => {
      const all = request.result || [];
      all.sort((a, b) => (a.queueId < b.queueId ? -1 : a.queueId > b.queueId ? 1 : 0));
      resolve(all);
    };
    request.onerror = () => reject(request.error);
  });
}

/* A write that can never succeed is parked, not discarded. The worker usually
 * runs with no page open, so a message would go nowhere and the user would
 * never learn that something they logged was thrown away. */
function park(database, item, message, signIn) {
  return new Promise((resolve, reject) => {
    const tx = database.transaction(FAILURE_STORE, 'readwrite');
    tx.objectStore(FAILURE_STORE).put({
      id: item.id,
      title: item.title,
      message,
      occurredAt: item.occurredAt,
      // Kept whole and reset, so the page can offer to send it again. Without
      // it the only thing left to do with a parked write is throw it away.
      item: { ...item, attempts: 0 },
      signIn: signIn === true,
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function messageFrom(response) {
  try {
    const body = await response.json();
    if (body && typeof body.error === 'string') return body.error;
  } catch {
    // Fall through to the default.
  }
  return 'Deze registratie kon niet worden opgeslagen.';
}

function remove(database, id) {
  return new Promise((resolve, reject) => {
    const tx = database.transaction(QUEUE_STORE, 'readwrite');
    tx.objectStore(QUEUE_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* Must match MAX_ATTEMPTS in lib/offline/queue.ts. */
const MAX_ATTEMPTS = 8;

function bumpAttempts(database, item, attempts) {
  return new Promise((resolve, reject) => {
    const tx = database.transaction(QUEUE_STORE, 'readwrite');
    tx.objectStore(QUEUE_STORE).put({ ...item, attempts });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function removeMutation(database, queueId) {
  return new Promise((resolve, reject) => {
    const tx = database.transaction(MUTATION_STORE, 'readwrite');
    tx.objectStore(MUTATION_STORE).delete(queueId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* Must match describeMutation in lib/offline/queue.ts. */
function describeMutation(mutation) {
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
      return 'Nieuwe koppelregel "' + mutation.rule.pattern + '"';
    case 'rule.delete':
      return 'Verwijderde koppelregel';
    case 'entry.revert':
      return 'Teruggedraaide registratie';
    default:
      return 'Wijziging';
  }
}

/* Edits go first and in order: a completion can refer to a task that so far
 * only exists in this queue, and would fail on a missing row if it overtook.
 * A blocked edit stops the run rather than letting later ones jump it. */
async function drainMutations(database) {
  let sent = 0;
  let parked = 0;
  let blocked = false;

  for (const item of await readMutations(database)) {
    let response;
    try {
      response = await fetch('/api/mutations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(item.mutation),
        credentials: 'same-origin',
      });
    } catch {
      throw new Error('offline');
    }

    if (response.ok) {
      await removeMutation(database, item.queueId);
      sent += 1;
      continue;
    }

    if (response.status >= 400 && response.status < 500) {
      await park(database, {
        id: item.queueId,
        title: describeMutation(item.mutation),
        occurredAt: item.createdAt,
      }, await messageFrom(response));
      await removeMutation(database, item.queueId);
      parked += 1;
      continue;
    }

    // Server trouble. Stop so the order holds, and say so, because the
    // completions behind this edit have to wait too.
    blocked = true;
    break;
  }

  return { sent, parked, blocked };
}

/* Must produce the same body as lib/offline/types.ts toRequestBody. */
function toBody(item) {
  return item.kind === 'task'
    ? {
        kind: 'task',
        entryId: item.id,
        taskId: item.taskId,
        minutes: item.minutes === null ? undefined : item.minutes,
        note: item.note === null ? undefined : item.note,
        occurredAt: item.occurredAt,
      }
    : {
        kind: 'quick',
        entryId: item.id,
        skillId: item.skillId,
        title: item.title,
        xp: item.xp,
        note: item.note === null ? undefined : item.note,
        occurredAt: item.occurredAt,
      };
}

async function drainQueue() {
  const database = await openQueue();
  const edits = await drainMutations(database);
  let sent = edits.sent;
  let parked = edits.parked;

  // A blocked edit holds the completions back too. A completion can name a
  // task that so far only exists in the edit queue; sending it while that edit
  // is still stuck gets it refused as a missing row and parked for good, which
  // loses a write that was only early.
  if (edits.blocked) {
    if ((sent > 0 || parked > 0) && typeof BroadcastChannel !== 'undefined') {
      new BroadcastChannel(SYNC_CHANNEL).postMessage({ type: 'drained', sent, parked });
    }
    // Still work to do: throwing keeps the sync registration alive.
    throw new Error('edits pending');
  }

  const items = await readAll(database);

  for (const item of items) {
    let response;
    try {
      response = await fetch('/api/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(toBody(item)),
        credentials: 'same-origin',
      });
    } catch {
      // Still offline. Throwing keeps the sync registration alive so the
      // browser tries again later.
      throw new Error('offline');
    }

    if (response.ok) {
      await remove(database, item.id);
      sent += 1;
      continue;
    }

    // 4xx can never land: park it so the next page load can report it.
    if (response.status >= 400 && response.status < 500) {
      await park(database, item, await messageFrom(response), response.status === 401);
      await remove(database, item.id);
      parked += 1;
      continue;
    }

    // 5xx: leave it queued and try again later, but not forever — a write the
    // server keeps refusing has to become visible instead of cycling.
    const attempts = (item.attempts || 0) + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await park(database, item, 'De server bleef deze registratie weigeren. Hij is niet opgeslagen.');
      await remove(database, item.id);
      parked += 1;
      continue;
    }
    await bumpAttempts(database, item, attempts);
  }

  if ((sent > 0 || parked > 0) && typeof BroadcastChannel !== 'undefined') {
    new BroadcastChannel(SYNC_CHANNEL).postMessage({ type: 'drained', sent, parked });
  }
}

self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) event.waitUntil(drainQueue());
});

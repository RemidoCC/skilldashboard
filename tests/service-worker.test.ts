import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { describeMutation } from '@/lib/offline/queue';
import type { Mutation } from '@/lib/offline/mutations';
import {
  DB_NAME,
  DB_VERSION,
  FAILURE_STORE,
  MUTATION_STORE,
  QUEUE_STORE,
  SYNC_CHANNEL,
  SYNC_TAG,
  toRequestBody,
  type PendingCompletion,
} from '@/lib/offline/types';

/**
 * The worker cannot import from the app bundle, so it repeats the queue
 * constants and the request body by hand. That is a standing drift risk: if
 * the two ever disagree, writes queued offline replay as the wrong thing, or
 * against a store the worker cannot find. These tests read the real worker
 * source and hold it to the shared definitions.
 */
const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

function constantOf(name: string): string {
  const match = source.match(new RegExp(`const ${name} = ('|\`)([^'\`]*)\\1`));
  if (match) return match[2];
  const numeric = source.match(new RegExp(`const ${name} = (\\d+)`));
  if (numeric) return numeric[1];
  throw new Error(`${name} not found in sw.js`);
}

describe('service worker constants', () => {
  it.each([
    ['DB_NAME', DB_NAME],
    ['QUEUE_STORE', QUEUE_STORE],
    ['FAILURE_STORE', FAILURE_STORE],
    ['MUTATION_STORE', MUTATION_STORE],
    ['SYNC_TAG', SYNC_TAG],
    ['SYNC_CHANNEL', SYNC_CHANNEL],
  ])('%s matches the shared definition', (name, expected) => {
    expect(constantOf(name)).toBe(expected);
  });

  it('opens the same database version as the page', () => {
    expect(Number(constantOf('DB_VERSION'))).toBe(DB_VERSION);
  });

  it('posts to the endpoints the queue posts to', () => {
    expect(source).toContain("'/api/completions'");
    expect(source).toContain("'/api/mutations'");
  });

  it('sends edits before completions', () => {
    // A completion can name a task that so far only exists in the edit queue.
    // If it overtook, the write would fail on a missing row.
    const edits = source.indexOf('const edits = await drainMutations(database)');
    const items = source.indexOf('const items = await readAll(database)');
    expect(edits).toBeGreaterThan(-1);
    expect(edits).toBeLessThan(items);
  });

  it('stops the edit run at the first one it cannot send', () => {
    // Edits are order-dependent, so a blocked one must not be skipped past.
    const drain = source.slice(source.indexOf('async function drainMutations'));
    expect(drain.slice(0, drain.indexOf('return { sent, parked }'))).toContain('break;');
  });

  it('sends cookies, or the write would arrive unauthenticated', () => {
    expect(source).toContain("credentials: 'same-origin'");
  });

  it('leaves writes and auth callbacks uncached', () => {
    expect(source).toContain("url.pathname.startsWith('/api/')");
    expect(source).toContain("url.pathname.startsWith('/auth/')");
  });

  it('ignores anything that is not a GET', () => {
    expect(source).toContain("request.method !== 'GET'");
  });

  it('treats 4xx as final and anything else as worth retrying', () => {
    // A 401 from an expired session must not be retried forever; a 503 must
    // stay queued.
    expect(source).toContain('response.status >= 400 && response.status < 500');
  });

  it('parks a permanently failed write instead of discarding it', () => {
    // The worker normally runs with no page open, so a broadcast would reach
    // nobody. Anything it gives up on has to survive until a page can report it.
    expect(source).toContain('function park(database, item, message)');
    expect(source).toContain('await park(database, item,');
    expect(source).toContain(`createObjectStore(FAILURE_STORE`);
  });
});

/** Pulls the worker's own toBody out of the file and runs it. */
function workerToBody(item: PendingCompletion): unknown {
  const start = source.indexOf('function toBody(item)');
  expect(start, 'toBody not found in sw.js').toBeGreaterThan(-1);
  // Runs to the closing brace at column zero.
  const end = source.indexOf('\n}', start);
  const body = source.slice(start, end + 2);
  const factory = new Function(`${body}; return toBody;`) as () => (i: PendingCompletion) => unknown;
  return factory()(item);
}

function pending(overrides: Partial<PendingCompletion> = {}): PendingCompletion {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    kind: 'task',
    skillId: '22222222-2222-4222-8222-222222222222',
    title: 'Offerte afmaken',
    xp: 33,
    taskId: '33333333-3333-4333-8333-333333333333',
    minutes: null,
    note: null,
    occurredAt: '2026-08-24T10:00:00.000Z',
    attempts: 0,
    ...overrides,
  };
}

/** Pulls the worker's own describeMutation out of the file and runs it. */
function workerDescribe(mutation: Mutation): string {
  const start = source.indexOf('function describeMutation(mutation)');
  expect(start, 'describeMutation not found in sw.js').toBeGreaterThan(-1);
  const end = source.indexOf('\n}', start);
  const body = source.slice(start, end + 2);
  const factory = new Function(`${body}; return describeMutation;`) as () => (
    m: Mutation,
  ) => string;
  return factory()(mutation);
}

describe('service worker mutation labels', () => {
  const cases: [string, Mutation][] = [
    ['task.create', { kind: 'task.create', id: 'x', task: { skillId: 's', title: 'Offerte', taskKind: 'check', value: 20, onToday: false } }],
    ['task.update', { kind: 'task.update', id: 'x', patch: { value: 30 } }],
    ['skill.create', { kind: 'skill.create', id: 'x', skill: { name: 'Tuin', subtitle: null, color: '#6E8C5A', glyph: 'ring', sortOrder: 9 } }],
    ['skill.update', { kind: 'skill.update', id: 'x', patch: { active: false } }],
    ['goal.create', { kind: 'goal.create', id: 'x', goal: { skillId: 's', title: 'Certificaat', targetDate: null } }],
    ['goal.update', { kind: 'goal.update', id: 'x', patch: { progress: 50 } }],
    ['goal.delete', { kind: 'goal.delete', id: 'x' }],
    ['week.capacity', { kind: 'week.capacity', weekStart: '2026-08-24', capacity: 'gek' }],
  ];

  it.each(cases)('names %s the same as the page does', (_label, mutation) => {
    expect(workerDescribe(mutation)).toBe(describeMutation(mutation));
  });

  it('covers every mutation kind the app can queue', () => {
    // If a kind is added without a label, a failed edit is reported as
    // "Wijziging" and the user cannot tell which one was lost.
    expect(cases).toHaveLength(8);
    for (const [, mutation] of cases) {
      expect(workerDescribe(mutation)).not.toBe('Wijziging');
    }
  });
});

describe('service worker request body', () => {
  it.each([
    ['a check task', pending()],
    ['a timer task', pending({ minutes: 30 })],
    ['a task with a note', pending({ note: 'ging vlot' })],
    ['a quick log', pending({ kind: 'quick', taskId: null, title: 'Wandeling', xp: 20 })],
    ['a quick log with a note', pending({ kind: 'quick', taskId: null, note: 'rond het park' })],
    ['a timer of zero minutes', pending({ minutes: 0 })],
  ])('matches the page for %s', (_label, item) => {
    expect(workerToBody(item)).toEqual(toRequestBody(item));
  });

  it('drops a null note rather than sending null', () => {
    const body = workerToBody(pending({ note: null })) as Record<string, unknown>;
    expect(body.note).toBeUndefined();
  });

  it('keeps a zero-minute timer as 0, not undefined', () => {
    const body = workerToBody(pending({ minutes: 0 })) as Record<string, unknown>;
    expect(body.minutes).toBe(0);
  });
});

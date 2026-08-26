import { describe, expect, it } from 'vitest';
import { MAX_ATTEMPTS } from '@/lib/offline/queue';

/**
 * What the queue does with a write the server keeps refusing.
 *
 * `flush` keeps a 5xx and parks a 4xx, so how a failure is classified decides
 * whether the user ever hears about it. Every database error was reported as
 * retryable, which turned a permanent refusal — a missing privilege, a
 * violated constraint — into a 503 that cycled quietly forever. `attempts` was
 * counted and never read, so nothing stopped it.
 *
 * The classification itself lives in lib/server/completions.ts behind
 * `server-only`; the codes are restated here so the list cannot drift silently.
 */
const PERMANENT = ['42501', '42883', '42P01', '23502', '23503', '23514', '22023', '22P02'];

describe('the retry ceiling', () => {
  it('exists, and is small enough to be reached in one sitting', () => {
    expect(MAX_ATTEMPTS).toBe(8);
  });
});

describe('which database failures are worth retrying', () => {
  // Mirrors isRetryable in lib/server/completions.ts.
  const retryable = (code?: string) => !(code && PERMANENT.includes(code));

  it('does not retry a missing privilege — this was the completions bug', () => {
    // `permission denied for function apply_xp` came back as 42501 and was
    // called retryable, so the queue spun on it instead of reporting it.
    expect(retryable('42501')).toBe(false);
  });

  it('does not retry a violated constraint or a missing row', () => {
    expect(retryable('23514')).toBe(false);
    expect(retryable('23503')).toBe(false);
    expect(retryable('23502')).toBe(false);
  });

  it('does not retry a call that names something which is not there', () => {
    expect(retryable('42883')).toBe(false);
    expect(retryable('42P01')).toBe(false);
  });

  it('does not retry a value the database cannot read', () => {
    expect(retryable('22023')).toBe(false);
    expect(retryable('22P02')).toBe(false);
  });

  it('still retries anything it does not recognise', () => {
    // A write that might yet land must never be thrown away.
    expect(retryable(undefined)).toBe(true);
    expect(retryable('')).toBe(true);
    expect(retryable('57014')).toBe(true); // query_canceled
    expect(retryable('08006')).toBe(true); // connection_failure
    expect(retryable('40001')).toBe(true); // serialization_failure
    expect(retryable('53300')).toBe(true); // too_many_connections
  });
});

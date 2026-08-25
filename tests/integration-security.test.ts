import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type QueryResultRow } from 'pg';
import { randomBytes } from 'node:crypto';

import { decryptSecret, encryptSecret } from '@/lib/server/secrets';

// The key is only read when a secret is actually opened, so setting it here is
// in time for every test below.
process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64');

/**
 * The refresh token is a long-lived credential for someone's calendar and
 * mailbox. The brief's rule is that it never reaches the client, and the
 * database is where that has to be true — not the data layer, which is only
 * one careless `select *` away from leaking it.
 *
 * This nearly shipped wrong. `grant select on <table>` covers every column, so
 * a column-level `revoke select (refresh_token)` subtracts nothing and the
 * token stays readable. Only revoking the table grant and then granting the
 * safe columns actually holds, and that is what these tests pin.
 */
const url = process.env.TEST_DATABASE_URL;
const run = url ? describe : describe.skip;

run('integration_accounts is closed to the client', () => {
  let db: Client;
  const userId = '00000000-0000-0000-0000-00000000beef';

  beforeAll(async () => {
    db = new Client({ connectionString: url });
    await db.connect();
    await db.query(`delete from auth.users where id = $1`, [userId]);
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [
      userId,
      `security-${Date.now()}@test.local`,
    ]);
    await db.query(
      `insert into public.integration_accounts (user_id, provider, refresh_token, scopes)
       values ($1, 'google', $2, 'scope')`,
      [userId, encryptSecret('SECRET-TOKEN')],
    );
  });

  afterAll(async () => {
    if (db) {
      await db.query(`reset role`);
      await db.query(`delete from auth.users where id = $1`, [userId]);
      await db.end();
    }
  });

  /** Runs a statement as a signed-in client would. */
  async function asClient<T extends QueryResultRow>(
    sql: string,
  ): Promise<{ rows: T[] } | { error: string }> {
    await db.query(`set role authenticated`);
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId]);
    try {
      const result = await db.query<T>(sql);
      return { rows: result.rows };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    } finally {
      await db.query(`reset role`);
    }
  }

  it('lets the client see that an account is linked', async () => {
    const result = await asClient<{ provider: string }>(
      `select provider from public.integration_accounts`,
    );
    expect('rows' in result).toBe(true);
    if ('rows' in result) expect(result.rows[0].provider).toBe('google');
  });

  it('refuses the refresh token', async () => {
    const result = await asClient(`select refresh_token from public.integration_accounts`);
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error).toMatch(/permission denied/i);
  });

  it('refuses select *, which is how a leak would actually happen', async () => {
    const result = await asClient(`select * from public.integration_accounts`);
    expect('error' in result).toBe(true);
  });

  it.each([
    ['insert', `insert into public.integration_accounts (user_id, provider, refresh_token, scopes) values ('00000000-0000-0000-0000-00000000beef','x','y','z')`],
    ['update', `update public.integration_accounts set scopes = 'changed'`],
    ['delete', `delete from public.integration_accounts`],
  ])('refuses %s from the client', async (_label, sql) => {
    const result = await asClient(sql);
    expect('error' in result).toBe(true);
  });

  it('still lets the service role read it, or the sync job could not run', async () => {
    await db.query(`set role service_role`);
    const { rows } = await db.query<{ refresh_token: string }>(
      `select refresh_token from public.integration_accounts where user_id = $1`,
      [userId],
    );
    await db.query(`reset role`);
    // Ciphertext even to the role that is allowed to read it: RLS decides who
    // may look, encryption decides whether looking is worth anything.
    expect(rows[0].refresh_token).not.toContain('SECRET-TOKEN');
    expect(decryptSecret(rows[0].refresh_token)).toBe('SECRET-TOKEN');
  });

  it.each([
    ['plaintext', '1//0gPlainRefreshToken'],
    ['empty', ''],
    ['almost right', 'v1.only.three'],
    ['wrong version', 'v0.aa.bb.cc'],
  ])('refuses to store a %s token, even as the service role', async (_label, token) => {
    await db.query(`set role service_role`);
    const attempt = db.query(
      `insert into public.integration_accounts (user_id, provider, refresh_token, scopes)
         values ($1, 'other', $2, 'scope')`,
      [userId, token],
    );
    await expect(attempt).rejects.toThrow(/refresh_token_encrypted/);
    await db.query(`reset role`);
  });
});

run('every other table is scoped to its owner', () => {
  let db: Client;

  beforeAll(async () => {
    db = new Client({ connectionString: url });
    await db.connect();
  });

  afterAll(async () => {
    if (db) await db.end();
  });

  it.each([
    'skills',
    'tasks',
    'log_entries',
    'goals',
    'quests',
    'seasons',
    'week_settings',
    'inbox_items',
    'mapping_rules',
    'streak_freezes',
  ])('%s has row level security on, with a policy', async (table) => {
    const { rows } = await db.query<{ enabled: boolean; policies: string }>(
      `select c.relrowsecurity as enabled,
              (select count(*) from pg_policies p where p.tablename = c.relname) as policies
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = $1`,
      [table],
    );
    expect(rows[0].enabled, `${table} has RLS off`).toBe(true);
    expect(Number(rows[0].policies), `${table} has no policy`).toBeGreaterThan(0);
  });
});

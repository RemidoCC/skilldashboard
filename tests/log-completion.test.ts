import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { asUser } from './support/db';
import { randomUUID } from 'node:crypto';
import { xpNeeded } from '@/lib/domain/curve';

/**
 * log_completion writes the ledger entry and advances the skill in one call.
 * These tests pin the two properties the offline queue depends on: replaying a
 * mutation is a no-op, and the skill state after a replay is identical.
 */
const url = process.env.TEST_DATABASE_URL;
const run = url ? describe : describe.skip;

run('log_completion', () => {
  let db: Client;
  let userId: string;
  let skillId: string;

  beforeAll(async () => {
    db = new Client({ connectionString: url });
    await db.connect();
    const { rows } = await db.query<{ id: string }>(
      `insert into auth.users (email) values ($1) returning id`,
      [`completion-${Date.now()}@test.local`],
    );
    userId = rows[0].id;
    // Makes auth.uid() resolve to this user for the rest of the session.
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId]);
  });

  afterAll(async () => {
    if (db) {
      await db.query(`delete from auth.users where id = $1`, [userId]);
      await db.end();
    }
  });

  beforeEach(async () => {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.skills (user_id, name, glyph) values ($1, 'T', 'square') returning id`,
      [userId],
    );
    skillId = rows[0].id;
  });

  async function complete(entryId: string, xp: number) {
    // As the browser: PostgREST runs every RPC as `authenticated`, so the
    // function grants and RLS are both in play.
    const { rows } = await asUser(db, () =>
      db.query(
        `select * from public.log_completion($1, $2, null, 'test', $3, null, null, 'manual', now())`,
        [entryId, skillId, xp],
      ),
    );
    return rows[0];
  }

  it('writes the entry and advances the skill', async () => {
    const after = await complete(randomUUID(), 40);
    expect(after.level).toBe(1);
    expect(after.xp).toBe(40);

    const { rows } = await db.query(`select count(*)::int as n from public.log_entries where skill_id = $1`, [skillId]);
    expect(rows[0].n).toBe(1);
  });

  it('cascades levels from a single completion', async () => {
    const after = await complete(randomUUID(), 1000);
    expect(after.level).toBe(4);
    expect(after.xp).toBe(1000 - xpNeeded(1) - xpNeeded(2) - xpNeeded(3));
  });

  it('claims the floor on crossing level five', async () => {
    const after = await complete(randomUUID(), 1902);
    expect(after.level).toBe(5);
    expect(after.floor_level).toBe(5);
  });

  it('stamps last_active_at', async () => {
    await complete(randomUUID(), 10);
    const { rows } = await db.query(`select last_active_at from public.skills where id = $1`, [skillId]);
    expect(rows[0].last_active_at).not.toBeNull();
  });

  it('is idempotent: replaying the same entry id changes nothing', async () => {
    const entryId = randomUUID();
    const first = await complete(entryId, 250);
    const second = await complete(entryId, 250);

    expect(second.level).toBe(first.level);
    expect(second.xp).toBe(first.xp);

    const { rows } = await db.query(`select count(*)::int as n from public.log_entries where skill_id = $1`, [skillId]);
    expect(rows[0].n).toBe(1);
  });

  it('a replayed completion leaves the same state as a single one', async () => {
    const entryId = randomUUID();
    await complete(entryId, 700);
    await complete(entryId, 700);
    await complete(entryId, 700);

    const { rows } = await db.query(
      `select level, xp, floor_level from public.skills where id = $1`,
      [skillId],
    );
    // 700 clears level 1 (100) and level 2 (303), leaving 297 inside level 3.
    expect(rows[0]).toEqual({ level: 3, xp: 297, floor_level: 0 });
  });

  it('two distinct completions both count', async () => {
    await complete(randomUUID(), 60);
    const after = await complete(randomUUID(), 60);
    expect(after.xp).toBe(20); // 120 total, level 1 costs 100
    expect(after.level).toBe(2);
  });

  it('drops an empty note rather than storing whitespace', async () => {
    const entryId = randomUUID();
    await db.query(
      `select * from public.log_completion($1, $2, null, 'test', 10, null, '   ', 'manual', now())`,
      [entryId, skillId],
    );
    const { rows } = await db.query(`select note from public.log_entries where id = $1`, [entryId]);
    expect(rows[0].note).toBeNull();
  });

  it('matches a full rebuild of the ledger', async () => {
    for (const xp of [120, 340, 90, 1500, 45]) await complete(randomUUID(), xp);
    const before = await db.query(`select level, xp, floor_level from public.skills where id = $1`, [skillId]);

    await asUser(db, () => db.query(`select public.recalculate_levels($1)`, [userId]));
    const after = await db.query(`select level, xp, floor_level from public.skills where id = $1`, [skillId]);

    expect(after.rows[0]).toEqual(before.rows[0]);
  });
});

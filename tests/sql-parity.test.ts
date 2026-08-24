import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { rebuild, xpNeeded } from '@/lib/domain/curve';
import { applyRust, rustXpDelta } from '@/lib/domain/rust';

/**
 * The level curve exists twice: once in TypeScript and once in SQL. If they
 * ever disagree, a rebuild silently rewrites months of history — so this suite
 * holds public.recalculate_levels and lib/domain/curve to the same answers on
 * a real Postgres.
 *
 * Provision the database with `npm run db:setup`, which also exports the URL
 * these tests look for. Without it they skip rather than fail, so the pure
 * unit tests still run anywhere.
 */
const url = process.env.TEST_DATABASE_URL;
const run = url ? describe : describe.skip;

run('SQL and TypeScript agree on the level curve', () => {
  let db: Client;
  let userId: string;

  beforeAll(async () => {
    db = new Client({ connectionString: url });
    await db.connect();
    const { rows } = await db.query<{ id: string }>(
      `insert into auth.users (email) values ($1) returning id`,
      [`parity-${Date.now()}@test.local`],
    );
    userId = rows[0].id;
  });

  afterAll(async () => {
    if (db) {
      await db.query(`delete from auth.users where id = $1`, [userId]);
      await db.end();
    }
  });

  it('xp_needed matches for every level the app can reach', async () => {
    const { rows } = await db.query<{ lvl: number; needed: number }>(
      `select lvl, public.xp_needed(lvl) as needed from generate_series(1, 120) lvl`,
    );
    for (const row of rows) {
      expect(row.needed, `level ${row.lvl}`).toBe(xpNeeded(row.lvl));
    }
  });

  const scenarios: Record<string, number[]> = {
    'a single small gain': [40],
    'an exact level boundary': [100],
    'a cascade through three levels': [1000],
    'a cascade that claims the level-5 floor': [1902],
    'the level-by-level walk to 6': [100, 303, 580, 919, 1313],
    'a long tail of small gains': Array.from({ length: 60 }, () => 25),
    'mixed gains': [40, 60, 200, 15, 900, 5, 1200],
    'a cascade past two floors': [
      100, 303, 580, 919, 1313, 1758, 2250, 2786, 3363, 3981,
    ],
    'ramping gains': Array.from({ length: 30 }, (_, i) => 137 + i * 11),
    // Rust lives in the ledger as a negative entry, so the replay has to walk
    // levels downward as faithfully as it walks them up.
    'a rust entry after climbing': [100, 303, 580, 919, 1313, -(0 + 1313)],
    'rust taken mid-level': [2000, -500],
    'rust deeper than one level': [3000, -2500],
    'rust below level one is absorbed': [50, -400],
    'earning back after rust': [1902, -1313, 800, 900],
  };

  for (const [label, gains] of Object.entries(scenarios)) {
    it(`recalculate_levels reproduces ${label}`, async () => {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.skills (user_id, name, glyph) values ($1, $2, 'square') returning id`,
        [userId, label],
      );
      const skillId = rows[0].id;

      // created_at is spaced so the replay order in SQL is unambiguous.
      await db.query(
        `insert into public.log_entries (user_id, skill_id, title, xp, source, created_at)
         select $1, $2, 'g', g, 'manual',
                timestamptz '2026-01-01 00:00:00Z' + (ord * interval '1 minute')
           from unnest($3::int[]) with ordinality as t(g, ord)`,
        [userId, skillId, gains],
      );

      await db.query(`select public.recalculate_levels($1)`, [userId]);

      const { rows: after } = await db.query<{
        level: number;
        xp: number;
        floor_level: number;
      }>(`select level, xp, floor_level from public.skills where id = $1`, [skillId]);

      const expected = rebuild(gains);
      expect({
        level: after[0].level,
        xp: after[0].xp,
        floorLevel: after[0].floor_level,
      }).toEqual(expected);
    });
  }

  it('is idempotent — rebuilding twice changes nothing', async () => {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.skills (user_id, name, glyph) values ($1, 'idempotent', 'square') returning id`,
      [userId],
    );
    const skillId = rows[0].id;
    await db.query(
      `insert into public.log_entries (user_id, skill_id, title, xp, source, created_at)
       select $1, $2, 'g', g, 'manual',
              timestamptz '2026-01-01 00:00:00Z' + (ord * interval '1 minute')
         from unnest($3::int[]) with ordinality as t(g, ord)`,
      [userId, skillId, [500, 700, 900, 1100]],
    );

    await db.query(`select public.recalculate_levels($1)`, [userId]);
    const first = await db.query(`select level, xp, floor_level from public.skills where id = $1`, [skillId]);
    await db.query(`select public.recalculate_levels($1)`, [userId]);
    const second = await db.query(`select level, xp, floor_level from public.skills where id = $1`, [skillId]);

    expect(second.rows[0]).toEqual(first.rows[0]);
  });

  it('replays a rust entry to the same state the domain computes', async () => {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.skills (user_id, name, glyph) values ($1, 'ruster', 'square') returning id`,
      [userId],
    );
    const skillId = rows[0].id;

    // These are xp_needed(1..6) exactly, so the climb lands on level 7 with
    // nothing left over. Then take exactly one level of decay.
    const climb = [100, 303, 580, 919, 1313, 1758];
    const earned = rebuild(climb);
    const decay = rustXpDelta(earned);
    expect(decay).toBeLessThan(0);

    await db.query(
      `insert into public.log_entries (user_id, skill_id, title, xp, source, created_at)
       select $1, $2, 'g', g, case when g < 0 then 'rust' else 'manual' end,
              timestamptz '2026-01-01 00:00:00Z' + (ord * interval '1 minute')
         from unnest($3::int[]) with ordinality as t(g, ord)`,
      [userId, skillId, [...climb, decay]],
    );
    await db.query(`select public.recalculate_levels($1)`, [userId]);

    const after = await db.query(`select level, xp, floor_level from public.skills where id = $1`, [skillId]);
    const expected = applyRust(earned);
    expect({
      level: after.rows[0].level,
      xp: after.rows[0].xp,
      floorLevel: after.rows[0].floor_level,
    }).toEqual(expected);
    // Level 7 down to 6, and the floor earned at 5 holds.
    expect(after.rows[0].level).toBe(6);
    expect(after.rows[0].floor_level).toBe(5);
  });

  it('never lets a rust entry drive a skill below level one', async () => {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.skills (user_id, name, glyph) values ($1, 'bottom', 'square') returning id`,
      [userId],
    );
    const skillId = rows[0].id;
    await db.query(
      `insert into public.log_entries (user_id, skill_id, title, xp, source, created_at)
       values ($1, $2, 'a', 50, 'manual', now()), ($1, $2, 'r', -9999, 'rust', now() + interval '1 minute')`,
      [userId, skillId],
    );
    await db.query(`select public.recalculate_levels($1)`, [userId]);
    const after = await db.query(`select level, xp from public.skills where id = $1`, [skillId]);
    expect(after.rows[0]).toEqual({ level: 1, xp: 0 });
  });

  it('keeps an earned floor even after the ledger is emptied', async () => {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.skills (user_id, name, glyph) values ($1, 'floor keeper', 'square') returning id`,
      [userId],
    );
    const skillId = rows[0].id;
    await db.query(
      `insert into public.log_entries (user_id, skill_id, title, xp, source)
       values ($1, $2, 'big', 1902, 'manual')`,
      [userId, skillId],
    );
    await db.query(`select public.recalculate_levels($1)`, [userId]);
    expect((await db.query(`select floor_level from public.skills where id = $1`, [skillId])).rows[0].floor_level).toBe(5);

    await db.query(`delete from public.log_entries where skill_id = $1`, [skillId]);
    await db.query(`select public.recalculate_levels($1)`, [userId]);

    const after = await db.query(`select level, xp, floor_level from public.skills where id = $1`, [skillId]);
    expect(after.rows[0].level).toBe(1);
    expect(after.rows[0].floor_level).toBe(5);
  });
});

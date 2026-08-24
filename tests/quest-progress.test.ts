import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';

/**
 * Quest progress lives inside log_completion so it advances exactly once per
 * real ledger entry. These tests pin that: a replayed completion must not move
 * the quest twice, and finishing one must pay its bonus into the same skill.
 */
const url = process.env.TEST_DATABASE_URL;
const run = url ? describe : describe.skip;

run('quest progress', () => {
  let db: Client;
  let userId: string;
  let skillId: string;
  let otherSkillId: string;
  let questId: string;

  /** The Monday of the week the tests write into. */
  const WEEK = '2026-08-24';
  const DURING = '2026-08-26T10:00:00Z';

  beforeAll(async () => {
    db = new Client({ connectionString: url });
    await db.connect();
    const { rows } = await db.query<{ id: string }>(
      `insert into auth.users (email) values ($1) returning id`,
      [`quest-${Date.now()}@test.local`],
    );
    userId = rows[0].id;
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId]);
  });

  afterAll(async () => {
    if (db) {
      await db.query(`delete from auth.users where id = $1`, [userId]);
      await db.end();
    }
  });

  beforeEach(async () => {
    await db.query(`delete from public.quests where user_id = $1`, [userId]);
    await db.query(`delete from public.log_entries where user_id = $1`, [userId]);
    await db.query(`delete from public.skills where user_id = $1`, [userId]);

    const skills = await db.query<{ id: string }>(
      `insert into public.skills (user_id, name, glyph) values ($1,'T','square'), ($1,'U','square') returning id`,
      [userId],
    );
    skillId = skills.rows[0].id;
    otherSkillId = skills.rows[1].id;

    const quest = await db.query<{ id: string }>(
      `insert into public.quests (user_id, skill_id, title, target, bonus_xp, week_start)
       values ($1, $2, '3 keer T', 3, 60, $3) returning id`,
      [userId, skillId, WEEK],
    );
    questId = quest.rows[0].id;
  });

  async function complete(entryId: string, opts: { skill?: string; source?: string; at?: string } = {}) {
    await db.query(
      `select * from public.log_completion($1, $2, null, 'werk', 40, null, null, $3, $4)`,
      [entryId, opts.skill ?? skillId, opts.source ?? 'manual', opts.at ?? DURING],
    );
  }

  const quest = async () =>
    (await db.query(`select progress, completed_at from public.quests where id = $1`, [questId]))
      .rows[0];

  it('advances one step per completion', async () => {
    await complete(randomUUID());
    expect((await quest()).progress).toBe(1);
    await complete(randomUUID());
    expect((await quest()).progress).toBe(2);
  });

  it('does not advance twice for a replayed completion', async () => {
    const entryId = randomUUID();
    await complete(entryId);
    await complete(entryId);
    await complete(entryId);
    expect((await quest()).progress).toBe(1);
  });

  it('ignores completions on another skill', async () => {
    await complete(randomUUID(), { skill: otherSkillId });
    expect((await quest()).progress).toBe(0);
  });

  it('ignores rust, which is the system acting rather than the user', async () => {
    await complete(randomUUID(), { source: 'rust' });
    expect((await quest()).progress).toBe(0);
  });

  it('ignores work done in another week', async () => {
    await complete(randomUUID(), { at: '2026-08-17T10:00:00Z' });
    expect((await quest()).progress).toBe(0);
  });

  it('marks the quest complete at the target and pays the bonus', async () => {
    for (let i = 0; i < 3; i += 1) await complete(randomUUID());

    const after = await quest();
    expect(after.progress).toBe(3);
    expect(after.completed_at).not.toBeNull();

    const { rows } = await db.query(
      `select title, xp, source from public.log_entries
        where user_id = $1 and source = 'quest'`,
      [userId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ xp: 60, title: 'Opdracht af: 3 keer T' });
  });

  it('pays the bonus into the skill, on top of the completion', async () => {
    for (let i = 0; i < 3; i += 1) await complete(randomUUID());
    // Three completions of 40, plus a 60 bonus, is 180 against level 1's 100.
    const { rows } = await db.query(`select level, xp from public.skills where id = $1`, [skillId]);
    expect(rows[0]).toEqual({ level: 2, xp: 80 });
  });

  it('pays the bonus once, however many more completions follow', async () => {
    for (let i = 0; i < 5; i += 1) await complete(randomUUID());
    const { rows } = await db.query(
      `select count(*)::int as n from public.log_entries where user_id = $1 and source = 'quest'`,
      [userId],
    );
    expect(rows[0].n).toBe(1);
  });

  it('leaves progress alone once the quest is finished', async () => {
    for (let i = 0; i < 3; i += 1) await complete(randomUUID());
    await complete(randomUUID());
    expect((await quest()).progress).toBe(3);
  });

  it('still rebuilds to the same state from the ledger', async () => {
    for (let i = 0; i < 3; i += 1) await complete(randomUUID());
    const before = await db.query(`select level, xp from public.skills where id = $1`, [skillId]);

    await db.query(`select public.recalculate_levels($1)`, [userId]);
    const after = await db.query(`select level, xp from public.skills where id = $1`, [skillId]);

    expect(after.rows[0]).toEqual(before.rows[0]);
  });
});

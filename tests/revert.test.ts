import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { xpNeeded } from '@/lib/domain/curve';

/**
 * Undoing a completion.
 *
 * The row is the easy part. What matters is everything the completion set in
 * motion — a quest it advanced, a bonus it paid, a suggestion it accepted, a
 * floor it bought — coming back with it, in one transaction.
 */
const url = process.env.TEST_DATABASE_URL;
const run = url ? describe : describe.skip;

run('revert_completion', () => {
  let db: Client;
  let userId: string;
  let skillId: string;

  const WEEK = '2026-08-24';
  const DURING = '2026-08-26T10:00:00Z';

  beforeAll(async () => {
    db = new Client({ connectionString: url });
    await db.connect();
    const { rows } = await db.query<{ id: string }>(
      `insert into auth.users (email) values ($1) returning id`,
      [`revert-${Date.now()}@test.local`],
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
    for (const table of ['inbox_items', 'quests', 'log_entries', 'skills']) {
      await db.query(`delete from public.${table} where user_id = $1`, [userId]);
    }
    const { rows } = await db.query<{ id: string }>(
      `insert into public.skills (user_id, name, glyph) values ($1,'T','square') returning id`,
      [userId],
    );
    skillId = rows[0].id;
  });

  async function complete(id: string, xp = 40, source = 'manual', at = DURING) {
    await db.query(
      `select public.log_completion($1, $2, null, 'werk', $3, null, null, $4, $5)`,
      [id, skillId, xp, source, at],
    );
  }

  const revert = (id: string) => db.query(`select public.revert_completion($1)`, [id]);
  const skill = async () =>
    (await db.query(`select level, xp, floor_level, last_active_at from public.skills where id = $1`, [skillId])).rows[0];
  const entries = async () =>
    (await db.query(`select count(*)::int as n from public.log_entries where user_id = $1`, [userId])).rows[0].n;

  it('removes the entry and gives the XP back', async () => {
    const id = randomUUID();
    await complete(id, 40);
    expect(await entries()).toBe(1);

    await revert(id);
    expect(await entries()).toBe(0);
    expect(await skill()).toMatchObject({ level: 1, xp: 0 });
  });

  it('leaves other completions alone', async () => {
    const keep = randomUUID();
    const drop = randomUUID();
    await complete(keep, 30);
    await complete(drop, 40);

    await revert(drop);
    expect(await entries()).toBe(1);
    expect((await skill()).xp).toBe(30);
  });

  it('walks a level back down when the completion had bought one', async () => {
    const id = randomUUID();
    await complete(randomUUID(), 90);
    await complete(id, 40); // 130 total, so level 2 with 30 over
    expect(await skill()).toMatchObject({ level: 2, xp: 30 });

    await revert(id);
    expect(await skill()).toMatchObject({ level: 1, xp: 90 });
  });

  it('gives back a floor the completion bought, because it was never earned', async () => {
    const id = randomUUID();
    let toFive = 0;
    for (let l = 1; l < 5; l += 1) toFive += xpNeeded(l);
    await complete(randomUUID(), toFive - 10);
    await complete(id, 10);
    expect(await skill()).toMatchObject({ level: 5, floor_level: 5 });

    await revert(id);
    const after = await skill();
    expect(after.level).toBe(4);
    expect(after.floor_level).toBe(0);
  });

  it('pulls last_active_at back to the newest entry that is left', async () => {
    await complete(randomUUID(), 10, 'manual', '2026-08-25T10:00:00Z');
    const later = randomUUID();
    await complete(later, 10, 'manual', '2026-08-27T10:00:00Z');

    await revert(later);
    const after = await skill();
    expect(new Date(after.last_active_at).toISOString()).toBe('2026-08-25T10:00:00.000Z');
  });

  it('clears last_active_at when nothing is left', async () => {
    const id = randomUUID();
    await complete(id);
    await revert(id);
    expect((await skill()).last_active_at).toBeNull();
  });

  describe('with a quest', () => {
    let questId: string;

    beforeEach(async () => {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.quests (user_id, skill_id, title, target, bonus_xp, week_start)
         values ($1, $2, '3 keer T', 3, 60, $3) returning id`,
        [userId, skillId, WEEK],
      );
      questId = rows[0].id;
    });

    const quest = async () =>
      (await db.query(`select progress, completed_at from public.quests where id = $1`, [questId])).rows[0];

    it('steps the quest back one', async () => {
      const id = randomUUID();
      await complete(randomUUID());
      await complete(id);
      expect((await quest()).progress).toBe(2);

      await revert(id);
      expect((await quest()).progress).toBe(1);
    });

    it('takes the bonus back and reopens a quest the completion finished', async () => {
      const ids = [randomUUID(), randomUUID(), randomUUID()];
      for (const id of ids) await complete(id);

      const finished = await quest();
      expect(finished.progress).toBe(3);
      expect(finished.completed_at).not.toBeNull();

      await revert(ids[2]);

      const reopened = await quest();
      expect(reopened.progress).toBe(2);
      expect(reopened.completed_at).toBeNull();

      const { rows } = await db.query(
        `select count(*)::int as n from public.log_entries where user_id = $1 and source = 'quest'`,
        [userId],
      );
      expect(rows[0].n, 'the bonus entry should be gone').toBe(0);
    });

    it('leaves the skill exactly where it was before the finishing completion', async () => {
      const ids = [randomUUID(), randomUUID(), randomUUID()];
      await complete(ids[0]);
      await complete(ids[1]);
      const before = await skill();

      await complete(ids[2]);
      await revert(ids[2]);

      const after = await skill();
      expect({ level: after.level, xp: after.xp }).toEqual({
        level: before.level,
        xp: before.xp,
      });
    });

    it('does not touch a quest in another week', async () => {
      const id = randomUUID();
      await complete(id, 40, 'manual', '2026-08-19T10:00:00Z');
      await revert(id);
      expect((await quest()).progress).toBe(0);
    });

    it('refuses to revert the bonus entry itself', async () => {
      for (let i = 0; i < 3; i += 1) await complete(randomUUID());
      const { rows } = await db.query<{ id: string }>(
        `select id from public.log_entries where user_id = $1 and source = 'quest'`,
        [userId],
      );
      await expect(revert(rows[0].id)).rejects.toThrow(/opdrachtbonus/i);
    });
  });

  it('puts an accepted suggestion back to waiting', async () => {
    const itemId = randomUUID();
    await db.query(
      `insert into public.inbox_items (id, user_id, source, external_id, title, suggested_skill_id, suggested_xp, occurred_at, status)
       values ($1, $2, 'calendar', 'calendar:x', 'Standup', $3, 40, $4, 'accepted')`,
      [itemId, userId, skillId, DURING],
    );
    // Accepting reuses the item's id as the entry id.
    await complete(itemId, 40, 'calendar');

    await revert(itemId);

    const { rows } = await db.query(`select status from public.inbox_items where id = $1`, [itemId]);
    expect(rows[0].status).toBe('pending');
  });

  it('refuses to revert rust', async () => {
    const id = randomUUID();
    await complete(randomUUID(), 500);
    await complete(id, -100, 'rust');
    await expect(revert(id)).rejects.toThrow(/roest/i);
  });

  it('refuses an entry that is not there', async () => {
    await expect(revert(randomUUID())).rejects.toThrow(/bestaat niet meer/i);
  });

  it('leaves the ledger and the derived state in agreement', async () => {
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    for (const id of ids) await complete(id, 300);
    await revert(ids[1]);

    const before = await skill();
    await db.query(`select public.recalculate_levels($1)`, [userId]);
    const after = await skill();

    expect({ level: after.level, xp: after.xp }).toEqual({
      level: before.level,
      xp: before.xp,
    });
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import {
  checkRestore,
  restoreCounts,
  SCHEMA_VERSION,
  TABLES,
  type RestoreCheck,
} from '@/lib/domain/restore';

/**
 * A backup is only a backup if it goes back in.
 *
 * Two halves, tested separately: what the file is allowed to contain, and what
 * happens to the account when it lands.
 */

/* ----------------------------------------------------------- the reader -- */

const SKILL = '11111111-1111-4111-8111-111111111111';
const TASK = '22222222-2222-4222-8222-222222222222';

function file(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    exportedAt: '2026-08-25T12:00:00Z',
    schema: SCHEMA_VERSION,
    skills: [
      {
        id: SKILL,
        name: 'Gitaar',
        subtitle: null,
        color: '#A32E00',
        glyph: 'square',
        level: 3,
        xp: 40,
        floor_level: 0,
        last_active_at: null,
        active: true,
        sort_order: 0,
        created_at: '2026-01-01T00:00:00Z',
      },
    ],
    tasks: [
      {
        id: TASK,
        skill_id: SKILL,
        title: 'Oefenen',
        kind: 'check',
        value: 20,
        on_today: true,
        archived: false,
        created_at: '2026-01-01T00:00:00Z',
      },
    ],
    ...over,
  };
}

function ok(check: RestoreCheck): Extract<RestoreCheck, { ok: true }> {
  if (!check.ok) throw new Error(`verwacht geldig, kreeg: ${check.error}`);
  return check;
}

function why(check: RestoreCheck): string {
  if (check.ok) throw new Error('verwacht een weigering, kreeg een geldig bestand');
  return check.error;
}

describe('checkRestore', () => {
  it('accepts an export of the current version', () => {
    const check = ok(checkRestore(file()));
    expect(check.total).toBe(2);
    expect(check.tables.find((t) => t.table === 'skills')?.rows).toHaveLength(1);
  });

  it('accepts a version 1 file, with the tables it never had left empty', () => {
    const check = ok(checkRestore(file({ schema: 'skill-unit/1' })));
    expect(check.tables.find((t) => t.table === 'mapping_rules')?.rows).toEqual([]);
    expect(check.tables.find((t) => t.table === 'inbox_items')?.rows).toEqual([]);
  });

  it('refuses a file from a version it cannot read', () => {
    expect(why(checkRestore(file({ schema: 'skill-unit/99' })))).toMatch(/versie/);
  });

  it('refuses anything that is not an export at all', () => {
    expect(why(checkRestore({ hello: 'world' }))).toMatch(/geen export/);
    expect(why(checkRestore('tekst'))).toMatch(/JSON-object/);
    expect(why(checkRestore(null))).toMatch(/JSON-object/);
    expect(why(checkRestore([]))).toMatch(/JSON-object/);
  });

  it('refuses an empty account, which is never what a restore is for', () => {
    expect(why(checkRestore({ schema: SCHEMA_VERSION }))).toMatch(/leeg/);
  });

  /**
   * The one that matters. A file claiming to belong to someone else must not
   * be able to say so — the route sets the owner from the session.
   */
  it('drops user_id, so a file cannot say whose account it is', () => {
    const smuggled = file();
    (smuggled.skills as Record<string, unknown>[])[0].user_id = 'someone-else';
    const check = ok(checkRestore(smuggled));
    expect(check.tables[0].rows[0]).not.toHaveProperty('user_id');
  });

  it('drops columns it does not know, rather than passing them on', () => {
    const extra = file();
    (extra.skills as Record<string, unknown>[])[0].secret_column = 'drop tables';
    const check = ok(checkRestore(extra));
    expect(Object.keys(check.tables[0].rows[0])).toEqual(Object.keys(TABLES[0].columns));
  });

  it('fills a missing nullable column with null', () => {
    const sparse = file();
    delete (sparse.skills as Record<string, unknown>[])[0].subtitle;
    expect(ok(checkRestore(sparse)).tables[0].rows[0].subtitle).toBeNull();
  });

  it.each([
    ['name', 42, /moet tekst zijn/],
    ['level', 'drie', /geheel getal/],
    ['level', 3.5, /geheel getal/],
    ['active', 'ja', /waar of onwaar/],
    ['id', 'not-a-uuid', /geldige id/],
    ['created_at', 'ooit', /tijdstip/],
    ['name', null, /ontbreekt/],
  ])('refuses skills.%s = %s', (column, value, message) => {
    const broken = file();
    (broken.skills as Record<string, unknown>[])[0][column] = value;
    expect(why(checkRestore(broken))).toMatch(message);
  });

  it('names the table and the row, so a bad file can be found', () => {
    const broken = file();
    (broken.tasks as Record<string, unknown>[])[0].value = 'twintig';
    expect(why(checkRestore(broken))).toBe('tasks, rij 1: value moet een geheel getal zijn.');
  });

  it('refuses a value the database has a constraint about', () => {
    const broken = file();
    (broken.tasks as Record<string, unknown>[])[0].kind = 'stopwatch';
    expect(why(checkRestore(broken))).toMatch(/kent het systeem niet/);
  });

  it('refuses a date where a date is expected', () => {
    const broken = file({
      weekSettings: [{ week_start: '24 augustus', capacity: 'normaal' }],
    });
    expect(why(checkRestore(broken))).toMatch(/datum/);
  });

  it('refuses a row that points at a skill the file does not contain', () => {
    const orphan = file();
    (orphan.tasks as Record<string, unknown>[])[0].skill_id = randomUUID();
    expect(why(checkRestore(orphan))).toMatch(/vaardigheid die niet in het bestand staat/);
  });

  it('refuses a log entry that points at a task the file does not contain', () => {
    const orphan = file({
      logEntries: [
        {
          id: randomUUID(),
          skill_id: SKILL,
          task_id: randomUUID(),
          title: 'x',
          xp: 10,
          minutes: null,
          note: null,
          source: 'manual',
          created_at: '2026-02-01T10:00:00Z',
        },
      ],
    });
    expect(why(checkRestore(orphan))).toMatch(/taak die niet in het bestand staat/);
  });

  it('allows a null reference, which is what a deleted task leaves behind', () => {
    const check = ok(
      checkRestore(
        file({
          logEntries: [
            {
              id: randomUUID(),
              skill_id: SKILL,
              task_id: null,
              title: 'x',
              xp: 10,
              minutes: null,
              note: null,
              source: 'manual',
              created_at: '2026-02-01T10:00:00Z',
            },
          ],
        }),
      ),
    );
    expect(check.total).toBe(3);
  });

  it('refuses the same id twice, which the primary key would reject anyway', () => {
    const twice = file();
    (twice.skills as Record<string, unknown>[]).push({
      ...(twice.skills as Record<string, unknown>[])[0],
    });
    expect(why(checkRestore(twice))).toMatch(/twee keer/);
  });

  it('refuses a table that is not a list', () => {
    expect(why(checkRestore(file({ goals: { id: 'x' } })))).toMatch(/geen lijst/);
  });

  it('keeps a season summary as it was, whatever shape it has', () => {
    const summary = { theme: 'hersteld', totalXp: 900, perSkill: [] };
    const check = ok(
      checkRestore(
        file({
          seasons: [
            {
              id: randomUUID(),
              name: 'S01',
              starts_on: '2026-01-05',
              ends_on: '2026-03-29',
              badge_slug: 's01-hersteld',
              summary,
            },
          ],
        }),
      ),
    );
    expect(check.tables.find((t) => t.table === 'seasons')?.rows[0].summary).toEqual(summary);
  });

  it('counts what is in the file, in words', () => {
    expect(restoreCounts(ok(checkRestore(file())))).toEqual([
      ['vaardigheid', 1],
      ['taak', 1],
    ]);
  });

  it('says one taak and two taken', () => {
    const two = file();
    (two.tasks as Record<string, unknown>[]).push({
      ...(two.tasks as Record<string, unknown>[])[0],
      id: '33333333-3333-4333-8333-333333333333',
    });
    expect(restoreCounts(ok(checkRestore(two)))).toContainEqual(['taken', 2]);
  });

  it('names every table it can restore', () => {
    for (const spec of TABLES) {
      const counts = restoreCounts({
        ok: true,
        schema: SCHEMA_VERSION,
        total: 1,
        tables: [{ table: spec.table, rows: [{}] }],
      });
      expect(counts[0][0], spec.table).not.toBe(spec.table);
    }
  });

  it('orders the tables so that parents come before children', () => {
    const order = TABLES.map((t) => t.table);
    expect(order.indexOf('skills')).toBeLessThan(order.indexOf('tasks'));
    expect(order.indexOf('tasks')).toBeLessThan(order.indexOf('log_entries'));
    expect(order.indexOf('skills')).toBeLessThan(order.indexOf('mapping_rules'));
    expect(order.indexOf('skills')).toBeLessThan(order.indexOf('inbox_items'));
  });

  it('never names user_id as a column, in any table', () => {
    for (const spec of TABLES) {
      expect(Object.keys(spec.columns), spec.table).not.toContain('user_id');
    }
  });
});

/* ---------------------------------------------------------- the writing -- */

const url = process.env.TEST_DATABASE_URL;
const run = url ? describe : describe.skip;

run('restore_account', () => {
  let db: Client;
  let userId: string;
  let otherId: string;

  beforeAll(async () => {
    db = new Client({ connectionString: url });
    await db.connect();
    const mine = await db.query<{ id: string }>(
      `insert into auth.users (email) values ($1) returning id`,
      [`restore-${Date.now()}@test.local`],
    );
    userId = mine.rows[0].id;
    const theirs = await db.query<{ id: string }>(
      `insert into auth.users (email) values ($1) returning id`,
      [`restore-other-${Date.now()}@test.local`],
    );
    otherId = theirs.rows[0].id;
  });

  afterAll(async () => {
    if (db) {
      await db.query(`reset role`);
      await db.query(`delete from auth.users where id = any($1)`, [[userId, otherId]]);
      await db.end();
    }
  });

  beforeEach(async () => {
    await db.query(`reset role`);
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId]);
    await db.query(`delete from public.skills where user_id = any($1)`, [[userId, otherId]]);
    for (const table of ['seasons', 'week_settings', 'streak_freezes']) {
      await db.query(`delete from public.${table} where user_id = any($1)`, [[userId, otherId]]);
    }
  });

  /** Calls the function the way a signed-in client would: as authenticated. */
  async function restore(payload: unknown) {
    await db.query(`set role authenticated`);
    try {
      await db.query(`select public.restore_account($1::jsonb)`, [JSON.stringify(payload)]);
    } finally {
      await db.query(`reset role`);
    }
  }

  /** The domain reader and the function together, exactly as the route runs them. */
  function payloadFor(source: Record<string, unknown>): Record<string, unknown> {
    const check = ok(checkRestore(source));
    return Object.fromEntries(check.tables.map((t) => [t.table, t.rows]));
  }

  const count = async (table: string, owner = userId) =>
    (
      await db.query<{ n: number }>(
        `select count(*)::int as n from public.${table} where user_id = $1`,
        [owner],
      )
    ).rows[0].n;

  it('writes an account that was not there', async () => {
    await restore(payloadFor(file()));
    expect(await count('skills')).toBe(1);
    expect(await count('tasks')).toBe(1);
  });

  it('takes the owner from the session, not from the file', async () => {
    const claimed = file();
    (claimed.skills as Record<string, unknown>[])[0].user_id = otherId;
    await restore(payloadFor(claimed));
    expect(await count('skills')).toBe(1);
    expect(await count('skills', otherId)).toBe(0);
  });

  it('replaces what was there rather than adding to it', async () => {
    await db.query(
      `insert into public.skills (user_id, name, glyph) values ($1,'Oud','square')`,
      [userId],
    );
    await restore(payloadFor(file()));
    const { rows } = await db.query<{ name: string }>(
      `select name from public.skills where user_id = $1`,
      [userId],
    );
    expect(rows.map((r) => r.name)).toEqual(['Gitaar']);
  });

  it('leaves another account alone', async () => {
    await db.query(
      `insert into public.skills (user_id, name, glyph) values ($1,'Hunne','square')`,
      [otherId],
    );
    await restore(payloadFor(file()));
    expect(await count('skills', otherId)).toBe(1);
  });

  it('rebuilds the levels from the ledger, not from the file', async () => {
    // The file claims level 9 with an empty ledger. Only the ledger counts.
    const lying = file({ logEntries: [] });
    (lying.skills as Record<string, unknown>[])[0].level = 9;
    (lying.skills as Record<string, unknown>[])[0].xp = 500;
    await restore(payloadFor(lying));

    const { rows } = await db.query<{ level: number; xp: number }>(
      `select level, xp from public.skills where user_id = $1`,
      [userId],
    );
    expect(rows[0]).toEqual({ level: 1, xp: 0 });
  });

  it('reaches the level the restored ledger supports', async () => {
    const entries = Array.from({ length: 4 }, (_, i) => ({
      id: randomUUID(),
      skill_id: SKILL,
      task_id: TASK,
      title: 'Oefenen',
      xp: 40,
      minutes: null,
      note: null,
      source: 'manual',
      created_at: `2026-02-0${i + 1}T10:00:00Z`,
    }));
    await restore(payloadFor(file({ logEntries: entries })));

    const { rows } = await db.query<{ level: number; xp: number }>(
      `select level, xp from public.skills where user_id = $1`,
      [userId],
    );
    // 160 XP with 100 needed for level 1: level 2 with 60 to spare.
    expect(rows[0]).toEqual({ level: 2, xp: 60 });
    expect(await count('log_entries')).toBe(4);
  });

  it('puts every table back, children included', async () => {
    const full = file({
      logEntries: [
        {
          id: randomUUID(),
          skill_id: SKILL,
          task_id: TASK,
          title: 'Oefenen',
          xp: 40,
          minutes: null,
          note: null,
          source: 'manual',
          created_at: '2026-02-01T10:00:00Z',
        },
      ],
      goals: [
        {
          id: randomUUID(),
          skill_id: SKILL,
          title: 'Doel',
          target_date: null,
          progress: 0,
          done: false,
          created_at: '2026-02-01T10:00:00Z',
        },
      ],
      quests: [
        {
          id: randomUUID(),
          skill_id: SKILL,
          title: 'Drie keer',
          target: 3,
          progress: 1,
          bonus_xp: 30,
          week_start: '2026-02-02',
          completed_at: null,
        },
      ],
      seasons: [
        {
          id: randomUUID(),
          name: 'S01',
          starts_on: '2026-01-05',
          ends_on: '2026-03-29',
          badge_slug: 's01-gestaag',
          summary: { theme: 'gestaag', totalXp: 400 },
        },
      ],
      weekSettings: [{ week_start: '2026-02-02', capacity: 'gek' }],
      streakFreezes: [
        {
          id: randomUUID(),
          earned_week: '2026-02-02',
          spent_on: null,
          created_at: '2026-02-09T10:00:00Z',
        },
      ],
      mappingRules: [
        { id: randomUUID(), source: 'calendar', pattern: 'standup', skill_id: SKILL, xp: 20 },
      ],
      inboxItems: [
        {
          id: randomUUID(),
          source: 'mail',
          external_id: 'abc',
          title: 'Verstuurd',
          suggested_skill_id: SKILL,
          suggested_xp: 15,
          occurred_at: '2026-02-01T10:00:00Z',
          status: 'pending',
        },
      ],
    });

    await restore(payloadFor(full));

    for (const table of [
      'skills',
      'tasks',
      'log_entries',
      'goals',
      'quests',
      'seasons',
      'week_settings',
      'streak_freezes',
      'mapping_rules',
      'inbox_items',
    ]) {
      expect(await count(table), table).toBe(1);
    }

    const { rows } = await db.query<{ summary: unknown; capacity: string }>(
      `select (select summary from public.seasons where user_id = $1) as summary,
              (select capacity from public.week_settings where user_id = $1) as capacity`,
      [userId],
    );
    expect(rows[0].summary).toEqual({ theme: 'gestaag', totalXp: 400 });
    expect(rows[0].capacity).toBe('gek');
  });

  it('lands whole or not at all', async () => {
    await db.query(
      `insert into public.skills (user_id, name, glyph) values ($1,'Oud','square')`,
      [userId],
    );

    // A task pointing at a skill that is not in the payload: the reader would
    // have caught it, so this is the function's own last line of defence.
    const broken = payloadFor(file());
    (broken.tasks as Record<string, unknown>[])[0].skill_id = randomUUID();

    await expect(restore(broken)).rejects.toThrow();

    // The account it started with is still there, untouched.
    const { rows } = await db.query<{ name: string }>(
      `select name from public.skills where user_id = $1`,
      [userId],
    );
    expect(rows.map((r) => r.name)).toEqual(['Oud']);
  });

  it('refuses to run without a session', async () => {
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
    await expect(restore(payloadFor(file()))).rejects.toThrow(/Niet ingelogd/);
  });

  it('rebuilds a fabricated floor from the ledger, like every other level', async () => {
    // floor_level is what switches rust off: rustXpDelta returns 0 at or below
    // it. Taking it from the file let a hand-edited export disable decay for a
    // skill permanently, while level and xp were being rebuilt honestly.
    const source = file();
    const skills = source.skills as Record<string, unknown>[];
    skills[0].level = 87;
    skills[0].xp = 99999;
    skills[0].floor_level = 95;

    await restore(payloadFor(source));

    const { rows } = await db.query(
      `select level, xp, floor_level from public.skills where user_id = $1`,
      [userId],
    );
    expect(rows[0].level).not.toBe(87);
    expect(rows[0].xp).not.toBe(99999);
    expect(rows[0].floor_level, 'a floor the history never earned').not.toBe(95);
  });

  it('keeps a floor the restored ledger does support', async () => {
    // 1902 XP is enough to cross level five, which is where a floor is claimed.
    const source = file({
      logEntries: [
        {
          id: randomUUID(),
          skill_id: SKILL,
          task_id: TASK,
          title: 'Oefenen',
          xp: 1902,
          minutes: null,
          note: null,
          source: 'manual',
          created_at: '2026-02-01T10:00:00Z',
        },
      ],
    });
    (source.skills as Record<string, unknown>[])[0].floor_level = 0;

    await restore(payloadFor(source));

    const { rows } = await db.query(
      `select level, floor_level from public.skills where user_id = $1`,
      [userId],
    );
    expect(rows[0].level).toBeGreaterThanOrEqual(5);
    expect(rows[0].floor_level).toBe(5);
  });

});

describe('checkRestore and the ranges the database also enforces', () => {
  const skill = {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Werk',
    color: '#5C7A99',
    glyph: 'square',
    level: 3,
    xp: 40,
    floor_level: 0,
    active: true,
    sort_order: 1,
    created_at: '2026-01-01T00:00:00Z',
  };
  const file = (over: Record<string, unknown>) => ({
    schema: 'skill-unit/2',
    skills: [skill],
    ...over,
  });
  const refusal = (payload: unknown) => {
    const out = checkRestore(payload);
    return out.ok ? null : out.error;
  };

  it('names the row for a task value the column would refuse', () => {
    const error = refusal(
      file({
        tasks: [{
          id: '22222222-2222-2222-2222-222222222222',
          skill_id: skill.id, title: 'Mail', kind: 'check', value: 9999,
          on_today: false, archived: false, created_at: '2026-01-01T00:00:00Z',
        }],
      }),
    );
    expect(error).toBe('tasks, rij 1: value moet tussen 5 en 150 liggen, en is 9999.');
    // Not the constraint name the database would have given.
    expect(error).not.toMatch(/check constraint|tasks_value_check/);
  });

  it('refuses a task value below the floor as well', () => {
    const error = refusal(
      file({
        tasks: [{
          id: '22222222-2222-2222-2222-222222222222',
          skill_id: skill.id, title: 'Mail', kind: 'check', value: 1,
          on_today: false, archived: false, created_at: '2026-01-01T00:00:00Z',
        }],
      }),
    );
    expect(error).toMatch(/tasks, rij 1: value moet tussen 5 en 150 liggen/);
  });

  it('refuses a level below one', () => {
    expect(refusal(file({ skills: [{ ...skill, level: 0 }] }))).toBe(
      'skills, rij 1: level mag niet lager zijn dan 1, en is 0.',
    );
  });

  it('refuses negative xp and a negative floor', () => {
    expect(refusal(file({ skills: [{ ...skill, xp: -5 }] }))).toMatch(/xp mag niet lager zijn dan 0/);
    expect(refusal(file({ skills: [{ ...skill, floor_level: -1 }] }))).toMatch(
      /floor_level mag niet lager zijn dan 0/,
    );
  });

  it('refuses a quest target of zero', () => {
    expect(
      refusal(
        file({
          quests: [{
            id: '33333333-3333-3333-3333-333333333333',
            skill_id: skill.id, title: 'niets', target: 0, progress: 0,
            bonus_xp: 40, week_start: '2026-01-05', completed_at: null,
          }],
        }),
      ),
    ).toMatch(/target mag niet lager zijn dan 1/);
  });

  it('refuses a season that ends before it starts', () => {
    expect(
      refusal(
        file({
          seasons: [{
            id: '44444444-4444-4444-4444-444444444444',
            name: 'S01', starts_on: '2026-03-29', ends_on: '2026-01-05',
            badge_slug: '', summary: null,
          }],
        }),
      ),
    ).toBe('seasons, rij 1: het seizoen eindigt op 2026-01-05, en dat is niet na 2026-03-29.');
  });

  it('still accepts the values the database is happy with', () => {
    const out = checkRestore(
      file({
        tasks: [{
          id: '22222222-2222-2222-2222-222222222222',
          skill_id: skill.id, title: 'Mail', kind: 'check', value: 150,
          on_today: false, archived: false, created_at: '2026-01-01T00:00:00Z',
        }],
        seasons: [{
          id: '44444444-4444-4444-4444-444444444444',
          name: 'S01', starts_on: '2026-01-05', ends_on: '2026-03-29',
          badge_slug: '', summary: null,
        }],
      }),
    );
    expect(out.ok).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { runFreezes, runQuests, runRust, runSeasons } from '@/lib/server/jobs';
import { fakeSupabase, type Row } from './support/fake-supabase';
import type { Capacity, LogEntry, Skill } from '@/lib/domain/types';

/**
 * The scheduled jobs.
 *
 * lib/server/jobs.ts had no tests. The pure decisions it leans on were covered
 * — shouldRust, rustXpDelta, freezeToGrant, generateQuests, badgeTheme — and
 * all of them were right. The glue between them was not, and four findings
 * lived in the gap:
 *
 *  - rust wrote through log_completion without naming the account, so a cron
 *    run (service role, no session) was refused every time;
 *  - a freeze earned in the same run could never be spent, because the insert
 *    did not ask for the row back;
 *  - the season badge called any skill that had climbed "recovered";
 *  - the longest streak was passed to the summary as a literal zero.
 *
 * None of them throws. They report the wrong thing, calmly.
 */

const USER = '11111111-1111-1111-1111-111111111111';

function skill(over: Partial<Skill> & { id: string; name: string }): Skill {
  return {
    subtitle: null,
    color: '#5C7A99',
    glyph: 'square',
    level: 1,
    xp: 0,
    floorLevel: 0,
    lastActiveAt: null,
    active: true,
    sortOrder: 1,
    ...over,
  } as Skill;
}

function entry(skillId: string, day: string, xp = 40, source = 'manual'): LogEntry {
  return {
    id: `${skillId}-${day}-${source}`,
    skillId,
    taskId: null,
    title: 'werk',
    xp,
    minutes: null,
    note: null,
    source,
    createdAt: `${day}T10:00:00Z`,
  } as LogEntry;
}

function account(over: {
  skills?: Skill[];
  entries?: LogEntry[];
  capacity?: Capacity;
  today: string;
}) {
  return {
    userId: USER,
    skills: over.skills ?? [],
    entries: over.entries ?? [],
    capacity: over.capacity ?? ('normaal' as Capacity),
    today: over.today,
  };
}

/* -------------------------------------------------------------------- rust */

describe('runRust', () => {
  it('writes a rust entry even though the cron has no session', async () => {
    // The job holds the service role. auth.uid() inside log_completion is null,
    // so the account has to be named or the write is refused as 'Niet ingelogd.'
    const rusty = skill({
      id: 'a',
      name: 'Werk',
      level: 6,
      xp: 120,
      lastActiveAt: '2026-08-01T10:00:00Z',
    });
    const fake = fakeSupabase({ log_entries: [], skills: [] });

    const changes = await runRust(
      fake.client as never,
      account({ skills: [rusty], entries: [entry('a', '2026-08-01')], today: '2026-08-25' }) as never,
    );

    expect(fake.rpcCalls).toHaveLength(1);
    expect(fake.rpcCalls[0].args.p_user, 'the account has to be named').toBe(USER);
    expect(fake.rpcCalls[0].args.p_source).toBe('rust');
    expect(fake.tables.log_entries).toHaveLength(1);
    expect(changes).toEqual(['Werk roestte naar niveau 5']);
  });

  it('leaves a skill inside its grace period alone', async () => {
    const fresh = skill({ id: 'a', name: 'Werk', level: 6, lastActiveAt: '2026-08-24T10:00:00Z' });
    const fake = fakeSupabase();
    const changes = await runRust(
      fake.client as never,
      account({ skills: [fresh], entries: [entry('a', '2026-08-24')], today: '2026-08-25' }) as never,
    );
    expect(fake.rpcCalls).toHaveLength(0);
    expect(changes).toEqual([]);
  });

  it('costs one level per episode, not one per day', async () => {
    // Already rusted since it was last used, so it waits until it is used again.
    const rusty = skill({
      id: 'a',
      name: 'Werk',
      level: 6,
      lastActiveAt: '2026-08-01T10:00:00Z',
    });
    const fake = fakeSupabase();
    const changes = await runRust(
      fake.client as never,
      account({
        skills: [rusty],
        entries: [entry('a', '2026-08-01'), entry('a', '2026-08-15', -900, 'rust')],
        today: '2026-08-25',
      }) as never,
    );
    expect(fake.rpcCalls).toHaveLength(0);
    expect(changes).toEqual([]);
  });

  it('reports a refusal instead of swallowing it', async () => {
    const rusty = skill({
      id: 'a',
      name: 'Werk',
      level: 6,
      lastActiveAt: '2026-08-01T10:00:00Z',
    });
    const fake = fakeSupabase();
    fake.failRpc = () => 'Niet ingelogd.';
    const changes = await runRust(
      fake.client as never,
      account({ skills: [rusty], entries: [entry('a', '2026-08-01')], today: '2026-08-25' }) as never,
    );
    expect(changes).toEqual(['Werk: roest mislukte (Niet ingelogd.)']);
  });
});

/* ----------------------------------------------------------------- freezes */

describe('runFreezes', () => {
  // Worked Monday to Saturday of the week just gone, missed Sunday. The daily
  // job fires on Monday morning.
  const workedLastWeek = [
    '2026-08-17', '2026-08-18', '2026-08-19',
    '2026-08-20', '2026-08-21', '2026-08-22',
  ].map((day) => entry('a', day));

  it('spends the freeze it earns in the same run', async () => {
    const fake = fakeSupabase({ streak_freezes: [] });
    const changes = await runFreezes(
      fake.client as never,
      account({ entries: workedLastWeek, today: '2026-08-24' }) as never,
    );

    expect(changes).toContain('Freeze verdiend voor de week van 2026-08-17');
    expect(changes).toContain('Freeze ingezet voor 2026-08-23');
    expect(fake.tables.streak_freezes).toHaveLength(1);
    expect(fake.tables.streak_freezes[0].spent_on).toBe('2026-08-23');
  });

  it('spends one that was already held', async () => {
    const fake = fakeSupabase({
      streak_freezes: [{ id: 'old', user_id: USER, earned_week: '2026-08-10', spent_on: null }],
    });
    await runFreezes(
      fake.client as never,
      account({ entries: workedLastWeek, today: '2026-08-24' }) as never,
    );
    const spent = fake.tables.streak_freezes.filter((f: Row) => Boolean(f.spent_on));
    expect(spent).toHaveLength(1);
    // The one held longest goes first, not the one just earned.
    expect(spent[0].id).toBe('old');
    expect(spent[0].spent_on).toBe('2026-08-23');
  });

  it('grants at most one freeze per week', async () => {
    const fake = fakeSupabase({
      streak_freezes: [{ id: 'a', user_id: USER, earned_week: '2026-08-17', spent_on: null }],
    });
    const changes = await runFreezes(
      fake.client as never,
      account({ entries: workedLastWeek, today: '2026-08-24' }) as never,
    );
    expect(changes.filter((c) => c.startsWith('Freeze verdiend'))).toHaveLength(0);
  });

  it('holds at most three', async () => {
    const fake = fakeSupabase({
      streak_freezes: [
        { id: 'a', user_id: USER, earned_week: '2026-07-27', spent_on: null },
        { id: 'b', user_id: USER, earned_week: '2026-08-03', spent_on: null },
        { id: 'c', user_id: USER, earned_week: '2026-08-10', spent_on: null },
      ],
    });
    const changes = await runFreezes(
      fake.client as never,
      account({ entries: workedLastWeek, today: '2026-08-24' }) as never,
    );
    expect(changes.filter((c) => c.startsWith('Freeze verdiend'))).toHaveLength(0);
    expect(fake.tables.streak_freezes).toHaveLength(3);
  });

  it('earns nothing for a week in which nothing happened', async () => {
    const fake = fakeSupabase({ streak_freezes: [] });
    const changes = await runFreezes(
      fake.client as never,
      account({ entries: [entry('a', '2026-06-01')], today: '2026-08-24' }) as never,
    );
    expect(changes).toEqual([]);
    expect(fake.tables.streak_freezes).toHaveLength(0);
  });

  it('does not spend one on a gap that is already two days old', async () => {
    // Worked through Monday, then nothing Tuesday or Wednesday, and the job did
    // not run on Wednesday. The streak is already gone; burning a freeze on
    // Wednesday buys nothing.
    const fake = fakeSupabase({
      streak_freezes: [{ id: 'a', user_id: USER, earned_week: '2026-08-10', spent_on: null }],
    });
    const worked = ['2026-08-15', '2026-08-16', '2026-08-17'].map((d) => entry('a', d));
    await runFreezes(
      fake.client as never,
      account({ entries: worked, today: '2026-08-20' }) as never,
    );
    expect(fake.tables.streak_freezes[0].spent_on).toBeNull();
  });
});

/* ------------------------------------------------------------------ quests */

describe('runQuests', () => {
  const skills = [
    skill({ id: 'a', name: 'Werk', sortOrder: 1 }),
    skill({ id: 'b', name: 'Gezin', sortOrder: 2 }),
    skill({ id: 'c', name: 'Leren', sortOrder: 3 }),
    skill({ id: 'd', name: 'Rust', sortOrder: 4 }),
  ];

  it('puts exactly three on the board', async () => {
    const fake = fakeSupabase({ quests: [], goals: [] });
    const changes = await runQuests(
      fake.client as never,
      account({ skills, entries: [entry('a', '2026-08-18')], today: '2026-08-24' }) as never,
    );
    expect(fake.tables.quests).toHaveLength(3);
    expect(changes).toEqual(['3 opdrachten gezet voor 2026-08-24']);
  });

  it('never puts two on the same skill in one week', async () => {
    const fake = fakeSupabase({ quests: [], goals: [] });
    await runQuests(
      fake.client as never,
      account({ skills, entries: [entry('a', '2026-08-18')], today: '2026-08-24' }) as never,
    );
    const ids = fake.tables.quests.map((q: Row) => q.skill_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('changes nothing when the week already has quests', async () => {
    const fake = fakeSupabase({
      quests: [{ id: 'q', user_id: USER, skill_id: 'a', week_start: '2026-08-24' }],
      goals: [],
    });
    const changes = await runQuests(
      fake.client as never,
      account({ skills, entries: [], today: '2026-08-24' }) as never,
    );
    expect(changes).toEqual([]);
    expect(fake.tables.quests).toHaveLength(1);
  });

  it('is deterministic: running it twice on a clean week gives the same three', async () => {
    const build = async () => {
      const fake = fakeSupabase({ quests: [], goals: [] });
      await runQuests(
        fake.client as never,
        account({ skills, entries: [entry('a', '2026-08-18')], today: '2026-08-24' }) as never,
      );
      return fake.tables.quests.map((q: Row) => `${q.skill_id}:${q.target}:${q.bonus_xp}`);
    };
    expect(await build()).toEqual(await build());
  });

  it('scales the targets down for a quiet week', async () => {
    const fake = fakeSupabase({ quests: [], goals: [] });
    await runQuests(
      fake.client as never,
      account({ skills, entries: [], capacity: 'rustig', today: '2026-08-24' }) as never,
    );
    for (const quest of fake.tables.quests) {
      expect(Number(quest.target)).toBeGreaterThanOrEqual(2);
      expect(Number(quest.target)).toBeLessThanOrEqual(3);
    }
  });
});

/* ----------------------------------------------------------------- seasons */

describe('runSeasons', () => {
  it('opens the first season on the Monday of the current week', async () => {
    const fake = fakeSupabase({ seasons: [] });
    const changes = await runSeasons(
      fake.client as never,
      account({ today: '2026-08-26' }) as never,
    );
    expect(changes).toEqual(['Seizoen S01 geopend']);
    expect(fake.tables.seasons[0]).toMatchObject({
      starts_on: '2026-08-24',
      ends_on: '2026-11-15', // twelve whole weeks, ending on a Sunday
    });
  });

  it('leaves a running season alone', async () => {
    const fake = fakeSupabase({
      seasons: [
        { id: 's1', user_id: USER, name: 'S01', starts_on: '2026-08-24', ends_on: '2026-11-15', badge_slug: '' },
      ],
    });
    const changes = await runSeasons(fake.client as never, account({ today: '2026-09-07' }) as never);
    expect(changes).toEqual([]);
  });

  describe('closing one', () => {
    const season = {
      id: 's1',
      user_id: USER,
      name: 'S01',
      starts_on: '2026-01-05',
      ends_on: '2026-03-29',
      badge_slug: '',
    };
    const today = '2026-03-30';

    it('does not call a season that only ever climbed a recovery', async () => {
      // No rust anywhere in the ledger, so nothing was recovered from.
      const fake = fakeSupabase({ seasons: [{ ...season }], quests: [], streak_freezes: [] });
      const entries = [
        entry('a', '2026-01-06', 500),
        entry('a', '2026-01-20', 700),
        entry('a', '2026-02-10', 900),
        entry('a', '2026-03-02', 1200),
      ];
      await runSeasons(
        fake.client as never,
        account({ skills: [skill({ id: 'a', name: 'Werk' })], entries, today }) as never,
      );
      const summary = fake.tables.seasons[0].summary as { theme: string };
      expect(summary.theme).not.toBe('hersteld');
    });

    it('calls a lopsided season toegespitst', async () => {
      const fake = fakeSupabase({ seasons: [{ ...season }], quests: [], streak_freezes: [] });
      const entries = [
        entry('a', '2026-01-06', 4000),
        entry('a', '2026-02-02', 4000),
        entry('b', '2026-01-07', 120),
      ];
      await runSeasons(
        fake.client as never,
        account({
          skills: [skill({ id: 'a', name: 'Werk' }), skill({ id: 'b', name: 'Gezin', sortOrder: 2 })],
          entries,
          today,
        }) as never,
      );
      const summary = fake.tables.seasons[0].summary as { theme: string };
      expect(summary.theme).toBe('toegespitst');
      expect(fake.tables.seasons[0].badge_slug).toBe('s01-toegespitst');
    });

    it('calls a season with a real comeback hersteld', async () => {
      // Climbs, rusts back a level, then climbs past where it fell from.
      const fake = fakeSupabase({ seasons: [{ ...season }], quests: [], streak_freezes: [] });
      const entries = [
        entry('a', '2026-01-06', 100),
        entry('a', '2026-01-07', 303),
        entry('a', '2026-01-08', 580),
        entry('a', '2026-02-01', -919, 'rust'),
        entry('a', '2026-03-01', 919),
        entry('a', '2026-03-02', 919),
      ];
      await runSeasons(
        fake.client as never,
        account({ skills: [skill({ id: 'a', name: 'Werk' })], entries, today }) as never,
      );
      const summary = fake.tables.seasons[0].summary as { theme: string };
      expect(summary.theme).toBe('hersteld');
    });

    it('records the longest streak the season actually held', async () => {
      const fake = fakeSupabase({ seasons: [{ ...season }], quests: [], streak_freezes: [] });
      // Five days in a row, a gap, then three.
      const entries = [
        '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-10',
        '2026-01-20', '2026-01-21', '2026-01-22',
      ].map((d) => entry('a', d, 50));

      await runSeasons(
        fake.client as never,
        account({ skills: [skill({ id: 'a', name: 'Werk' })], entries, today }) as never,
      );
      const summary = fake.tables.seasons[0].summary as { longestStreak: number };
      expect(summary.longestStreak, 'was hard-coded to 0 before').toBe(5);
    });

    it('counts a day a freeze carried as part of the run', async () => {
      const fake = fakeSupabase({
        seasons: [{ ...season }],
        quests: [],
        streak_freezes: [
          { id: 'f1', user_id: USER, earned_week: '2026-01-05', spent_on: '2026-01-09' },
        ],
      });
      const entries = ['2026-01-06', '2026-01-07', '2026-01-08', '2026-01-10', '2026-01-11']
        .map((d) => entry('a', d, 50));

      await runSeasons(
        fake.client as never,
        account({ skills: [skill({ id: 'a', name: 'Werk' })], entries, today }) as never,
      );
      const summary = fake.tables.seasons[0].summary as { longestStreak: number };
      expect(summary.longestStreak).toBe(6);
    });

    it('writes the summary Historie reads back', async () => {
      const fake = fakeSupabase({ seasons: [{ ...season }], quests: [], streak_freezes: [] });
      await runSeasons(
        fake.client as never,
        account({
          skills: [skill({ id: 'a', name: 'Werk' })],
          entries: [entry('a', '2026-01-06', 500)],
          today,
        }) as never,
      );
      const summary = fake.tables.seasons[0].summary as Record<string, unknown>;
      expect(Object.keys(summary).sort()).toEqual(
        ['levelsGained', 'longestStreak', 'perSkill', 'questsCompleted', 'theme', 'totalXp'].sort(),
      );
    });
  });
});

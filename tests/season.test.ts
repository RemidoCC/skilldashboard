import { describe, expect, it } from 'vitest';
import {
  badgeSlug,
  badgeTheme,
  hasEnded,
  nextSeason,
  parseSeasonSummary,
  THEME_NOTES,
  seasonEnd,
  seasonLabel,
  seasonName,
  seasonStartFor,
  seasonSummary,
  seasonWeek,
  SEASON_WEEKS,
  type SeasonTally,
} from '@/lib/domain/season';

function tally(over: Partial<SeasonTally> & { skillId: string }): SeasonTally {
  return { name: over.skillId, xp: 0, levelsGained: 0, recovered: false, ...over };
}

describe('season boundaries', () => {
  it('always starts on a Monday', () => {
    // 26 August 2026 is a Wednesday.
    expect(seasonStartFor('2026-08-26')).toBe('2026-08-24');
  });

  it('runs twelve whole weeks', () => {
    const start = '2026-08-24';
    const end = seasonEnd(start);
    expect(end).toBe('2026-11-15');
    // Monday to the Sunday of week twelve is 83 days later.
    expect(SEASON_WEEKS * 7 - 1).toBe(83);
  });

  it('numbers weeks from one to twelve', () => {
    const start = '2026-08-24';
    expect(seasonWeek(start, '2026-08-24')).toBe(1);
    expect(seasonWeek(start, '2026-08-30')).toBe(1);
    expect(seasonWeek(start, '2026-08-31')).toBe(2);
    expect(seasonWeek(start, seasonEnd(start))).toBe(12);
  });

  it('clamps a day past the end rather than reporting week thirteen', () => {
    const start = '2026-08-24';
    expect(seasonWeek(start, '2027-01-01')).toBe(12);
  });

  it('clamps a day before the start to week one', () => {
    expect(seasonWeek('2026-08-24', '2026-08-01')).toBe(1);
  });

  it('knows when it is over', () => {
    const start = '2026-08-24';
    const end = seasonEnd(start);
    expect(hasEnded({ endsOn: end }, end)).toBe(false);
    expect(hasEnded({ endsOn: end }, '2026-11-16')).toBe(true);
  });
});

describe('naming', () => {
  it('pads the number', () => {
    expect(seasonName(1)).toBe('S01');
    expect(seasonName(12)).toBe('S12');
  });

  it('reads as S02 · W07 in the header', () => {
    expect(seasonLabel('S02', '2026-08-24', '2026-10-05')).toBe('S02 · W07');
  });
});

describe('nextSeason', () => {
  it('starts the day after the last one ended', () => {
    const next = nextSeason({ name: 'S01', endsOn: '2026-11-15' });
    expect(next).toEqual({ name: 'S02', startsOn: '2026-11-16', endsOn: '2027-02-07' });
  });

  it('keeps counting past ten', () => {
    expect(nextSeason({ name: 'S09', endsOn: '2026-11-15' }).name).toBe('S10');
  });

  it('lands on a Monday again', () => {
    // The previous season ended on a Sunday, so the next starts on a Monday.
    const next = nextSeason({ name: 'S01', endsOn: '2026-11-15' });
    expect(seasonStartFor(next.startsOn)).toBe(next.startsOn);
  });
});

describe('badgeTheme', () => {
  it('is gestaag when nothing happened', () => {
    expect(badgeTheme([])).toBe('gestaag');
    expect(badgeTheme([tally({ skillId: 'a' })])).toBe('gestaag');
  });

  it('names a recovery above everything else', () => {
    const tallies = [
      tally({ skillId: 'a', xp: 900 }),
      tally({ skillId: 'b', xp: 100, recovered: true }),
    ];
    expect(badgeTheme(tallies)).toBe('hersteld');
  });

  it('is toegespitst when one skill took most of it', () => {
    const tallies = [tally({ skillId: 'a', xp: 700 }), tally({ skillId: 'b', xp: 300 })];
    expect(badgeTheme(tallies)).toBe('toegespitst');
  });

  it('is evenwichtig when nothing dominated', () => {
    const tallies = [
      tally({ skillId: 'a', xp: 300 }),
      tally({ skillId: 'b', xp: 350 }),
      tally({ skillId: 'c', xp: 350 }),
    ];
    expect(badgeTheme(tallies)).toBe('evenwichtig');
  });

  it('is gestaag in between', () => {
    const tallies = [
      tally({ skillId: 'a', xp: 500 }),
      tally({ skillId: 'b', xp: 300 }),
      tally({ skillId: 'c', xp: 200 }),
    ];
    expect(badgeTheme(tallies)).toBe('gestaag');
  });

  it('ignores negative XP from rust when weighing shares', () => {
    const tallies = [tally({ skillId: 'a', xp: 500 }), tally({ skillId: 'b', xp: -200 })];
    expect(badgeTheme(tallies)).toBe('toegespitst');
  });
});

describe('badgeSlug', () => {
  it('reads as the season plus what it was', () => {
    expect(badgeSlug('S02', 'evenwichtig')).toBe('s02-evenwichtig');
  });
});

describe('seasonSummary', () => {
  it('records the totals and the per-skill breakdown', () => {
    const tallies = [
      tally({ skillId: 'a', name: 'Werk', xp: 500, levelsGained: 2 }),
      tally({ skillId: 'b', name: 'Gezin', xp: 300, levelsGained: 1 }),
    ];
    const summary = seasonSummary(tallies, 8, 14);

    expect(summary).toMatchObject({
      totalXp: 800,
      levelsGained: 3,
      questsCompleted: 8,
      longestStreak: 14,
    });
    expect(summary.perSkill).toHaveLength(2);
    expect(summary.perSkill[0]).toEqual({ skillId: 'a', name: 'Werk', xp: 500, levelsGained: 2 });
  });

  it('counts rust against the total, because it happened', () => {
    const tallies = [tally({ skillId: 'a', xp: 500 }), tally({ skillId: 'b', xp: -200 })];
    expect(seasonSummary(tallies, 0, 0).totalXp).toBe(300);
  });
});

/* ------------------------------------------------------- de samenvatting -- */

describe('parseSeasonSummary', () => {
  const stored = {
    theme: 'hersteld',
    totalXp: 8420,
    levelsGained: 11,
    questsCompleted: 9,
    longestStreak: 23,
    perSkill: [{ skillId: 'a', name: 'Werk', xp: 3120, levelsGained: 4 }],
  };

  it('reads back exactly what seasonSummary writes', () => {
    const written = seasonSummary(
      [
        { skillId: 'a', name: 'Werk', xp: 3120, levelsGained: 4, recovered: true },
        { skillId: 'b', name: 'Rust', xp: 580, levelsGained: 1, recovered: false },
      ],
      9,
      23,
    );
    // Through jsonb and back, which is the trip it actually makes.
    expect(parseSeasonSummary(JSON.parse(JSON.stringify(written)))).toEqual(written);
  });

  it('reads a stored summary', () => {
    expect(parseSeasonSummary(stored)).toEqual(stored);
  });

  it('gives up on anything that is not a summary', () => {
    for (const value of [null, undefined, 'gestaag', 42, [], {}, { theme: 'briljant' }]) {
      expect(parseSeasonSummary(value)).toBeNull();
    }
  });

  it('treats a missing number as zero rather than falling over', () => {
    const summary = parseSeasonSummary({ theme: 'gestaag' });
    expect(summary).toEqual({
      theme: 'gestaag',
      totalXp: 0,
      levelsGained: 0,
      perSkill: [],
      questsCompleted: 0,
      longestStreak: 0,
    });
  });

  it('skips per-skill entries that are not objects', () => {
    const summary = parseSeasonSummary({ ...stored, perSkill: ['werk', null, stored.perSkill[0]] });
    expect(summary?.perSkill).toHaveLength(1);
  });

  it('names a skill that lost its name', () => {
    const summary = parseSeasonSummary({ ...stored, perSkill: [{ skillId: 'a', xp: 10 }] });
    expect(summary?.perSkill[0]).toEqual({
      skillId: 'a',
      name: 'Onbekend',
      xp: 10,
      levelsGained: 0,
    });
  });

  it('has a plain sentence for every theme', () => {
    for (const theme of ['evenwichtig', 'toegespitst', 'hersteld', 'gestaag'] as const) {
      expect(THEME_NOTES[theme].length, theme).toBeGreaterThan(10);
    }
  });
});

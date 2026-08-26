import { describe, expect, it } from 'vitest';
import { levelTrajectory, recoveredWithin } from '@/lib/domain/trajectory';
import { longestRun } from '@/lib/domain/streak';
import { badgeTheme, type SeasonTally } from '@/lib/domain/season';
import type { LogEntry, Skill } from '@/lib/domain/types';

/**
 * The two facts the season summary reports about a stretch of time.
 *
 * Both were wrong in a way that never threw. `recovered` was true for any skill
 * that had gained a level, so every season carried the badge `hersteld` and the
 * honest words for a lopsided or a balanced season were unreachable. The
 * longest streak was passed to the summary as a literal zero.
 */

const skill = (id: string, name: string): Skill =>
  ({
    id, name, subtitle: null, color: '#5C7A99', glyph: 'square',
    level: 1, xp: 0, floorLevel: 0, lastActiveAt: null, active: true, sortOrder: 1,
  }) as Skill;

const entry = (id: string, day: string, xp: number, source = 'manual'): LogEntry =>
  ({
    id: `${id}-${day}-${xp}`, skillId: id, taskId: null, title: 'w', xp,
    minutes: null, note: null, source, createdAt: `${day}T10:00:00Z`,
  }) as LogEntry;

const FROM = '2026-01-05';
const TO = '2026-03-29';

const lineFor = (entries: LogEntry[]) =>
  levelTrajectory([skill('a', 'Werk')], entries, FROM, TO)[0];

describe('recoveredWithin', () => {
  it('is false for a skill that only ever climbed', () => {
    const line = lineFor([
      entry('a', '2026-01-06', 500),
      entry('a', '2026-01-20', 700),
      entry('a', '2026-02-10', 900),
      entry('a', '2026-03-02', 1200),
    ]);
    expect(line.from).toBe(1);
    expect(line.peak).toBeGreaterThan(line.from);
    expect(line.to).toBe(line.peak);
    // The old test was `peak > from && to >= peak`, which this satisfies.
    expect(recoveredWithin(line)).toBe(false);
  });

  it('is false for a skill that did nothing at all', () => {
    expect(recoveredWithin(lineFor([]))).toBe(false);
  });

  it('is false while a skill is still down after rusting', () => {
    const line = lineFor([
      entry('a', '2026-01-06', 100),
      entry('a', '2026-01-07', 303),
      entry('a', '2026-01-08', 580),
      entry('a', '2026-02-01', -919, 'rust'),
    ]);
    expect(recoveredWithin(line)).toBe(false);
  });

  it('is true once it climbs back to where it fell from', () => {
    const line = lineFor([
      entry('a', '2026-01-06', 100),
      entry('a', '2026-01-07', 303),
      entry('a', '2026-01-08', 580),
      entry('a', '2026-02-01', -919, 'rust'),
      entry('a', '2026-03-01', 919),
    ]);
    expect(recoveredWithin(line)).toBe(true);
  });

  it('is true when it climbs past where it fell from', () => {
    const line = lineFor([
      entry('a', '2026-01-06', 100),
      entry('a', '2026-01-07', 303),
      entry('a', '2026-01-08', 580),
      entry('a', '2026-02-01', -919, 'rust'),
      entry('a', '2026-03-01', 919),
      entry('a', '2026-03-02', 919),
    ]);
    expect(recoveredWithin(line)).toBe(true);
  });

  it('sees a dip that started above the window, too', () => {
    // Earned before the window opened, rusted inside it, climbed back.
    const line = lineFor([
      entry('a', '2025-11-01', 2000),
      entry('a', '2026-02-01', -1313, 'rust'),
      entry('a', '2026-03-01', 1313),
    ]);
    expect(line.from).toBeGreaterThan(1);
    expect(recoveredWithin(line)).toBe(true);
  });
});

describe('the badge that comes out of it', () => {
  const tally = (over: Partial<SeasonTally> & { skillId: string }): SeasonTally =>
    ({ name: over.skillId, xp: 0, levelsGained: 0, recovered: false, ...over });

  it('calls a season where one skill took almost everything toegespitst', () => {
    expect(
      badgeTheme([
        tally({ skillId: 'a', xp: 8000 }),
        tally({ skillId: 'b', xp: 120 }),
      ]),
    ).toBe('toegespitst');
  });

  it('calls a spread season evenwichtig', () => {
    expect(
      badgeTheme([
        tally({ skillId: 'a', xp: 300 }),
        tally({ skillId: 'b', xp: 300 }),
        tally({ skillId: 'c', xp: 300 }),
      ]),
    ).toBe('evenwichtig');
  });

  it('does not let a real recovery cover a season that went one way', () => {
    // 8000 against 120 is the season. The comeback is real and it is small,
    // and the badge naming it would be the report choosing the nicer of two
    // true things.
    expect(
      badgeTheme([
        tally({ skillId: 'a', xp: 8000 }),
        tally({ skillId: 'b', xp: 120, recovered: true }),
      ]),
    ).toBe('toegespitst');
  });

  it('names a recovery in a season that was not dominated', () => {
    expect(
      badgeTheme([
        tally({ skillId: 'a', xp: 900 }),
        tally({ skillId: 'b', xp: 800, recovered: true }),
      ]),
    ).toBe('hersteld');
  });
});

describe('longestRun', () => {
  it('is zero for nothing at all', () => {
    expect(longestRun([])).toBe(0);
  });

  it('is one for a single day', () => {
    expect(longestRun(['2026-01-06'])).toBe(1);
  });

  it('counts the longest stretch, not the last one', () => {
    expect(
      longestRun([
        '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-10',
        '2026-01-20', '2026-01-21',
      ]),
    ).toBe(5);
  });

  it('does not care what order the days arrive in', () => {
    expect(longestRun(['2026-01-08', '2026-01-06', '2026-01-07'])).toBe(3);
  });

  it('counts a duplicated day once', () => {
    expect(longestRun(['2026-01-06', '2026-01-06', '2026-01-07'])).toBe(2);
  });

  it('lets a frozen day hold the run together', () => {
    const worked = ['2026-01-06', '2026-01-07', '2026-01-09', '2026-01-10'];
    expect(longestRun(worked)).toBe(2);
    expect(longestRun(worked, ['2026-01-08'])).toBe(5);
  });

  it('stays inside the window it is given', () => {
    const days = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05'];
    expect(longestRun(days)).toBe(5);
    expect(longestRun(days, [], '2026-01-03', '2026-01-04')).toBe(2);
  });

  it('crosses a month boundary', () => {
    expect(longestRun(['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02'])).toBe(4);
  });
});

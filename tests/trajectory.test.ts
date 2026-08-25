import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RANGE,
  groupByDay,
  HISTORY_RANGES,
  levelTrajectory,
  rangeLabelFor,
  toHistoryRange,
  windowStart,
  type HistoryRange,
} from '@/lib/domain/trajectory';
import { xpNeeded } from '@/lib/domain/curve';
import { daysBetween } from '@/lib/domain/dates';
import type { LogEntry, Skill } from '@/lib/domain/types';

function skill(id: string, name = id): Skill {
  return {
    id,
    name,
    subtitle: null,
    color: '#5C7A99',
    glyph: 'square',
    level: 1,
    xp: 0,
    floorLevel: 0,
    lastActiveAt: null,
    active: true,
    sortOrder: 1,
  };
}

let seq = 0;
function entry(skillId: string, xp: number, day: string, source: LogEntry['source'] = 'manual'): LogEntry {
  seq += 1;
  return {
    id: `e${seq}`,
    skillId,
    taskId: null,
    title: 'test',
    xp,
    minutes: null,
    note: null,
    source,
    // Midday Amsterdam time, so the day key is unambiguous.
    createdAt: `${day}T10:00:0${seq % 10}.000Z`,
  };
}

describe('levelTrajectory', () => {
  it('gives one point per day in the window', () => {
    const [line] = levelTrajectory([skill('a')], [], '2026-08-20', '2026-08-24');
    expect(line.points).toHaveLength(5);
    expect(line.points[0].day).toBe('2026-08-20');
    expect(line.points[4].day).toBe('2026-08-24');
  });

  it('stays at level one with no history', () => {
    const [line] = levelTrajectory([skill('a')], [], '2026-08-20', '2026-08-24');
    expect(line.points.every((p) => p.level === 1)).toBe(true);
    expect(line).toMatchObject({ from: 1, to: 1 });
  });

  it('steps up on the day the level was crossed', () => {
    const entries = [entry('a', 100, '2026-08-22')];
    const [line] = levelTrajectory([skill('a')], entries, '2026-08-20', '2026-08-24');
    expect(line.points.map((p) => p.level)).toEqual([1, 1, 2, 2, 2]);
  });

  it('counts history before the window towards the starting level', () => {
    // Everything needed for level 3 happened well before the window opens.
    const entries = [entry('a', xpNeeded(1) + xpNeeded(2), '2026-07-01')];
    const [line] = levelTrajectory([skill('a')], entries, '2026-08-20', '2026-08-24');
    expect(line.from).toBe(3);
    expect(line.points[0].level).toBe(3);
  });

  it('carries several entries on one day', () => {
    const entries = [entry('a', 60, '2026-08-22'), entry('a', 60, '2026-08-22')];
    const [line] = levelTrajectory([skill('a')], entries, '2026-08-20', '2026-08-24');
    expect(line.points[2]).toMatchObject({ level: 2, xpInLevel: 20 });
  });

  it('keeps each skill to its own entries', () => {
    const entries = [entry('a', 500, '2026-08-21'), entry('b', 100, '2026-08-22')];
    const [a, b] = levelTrajectory([skill('a'), skill('b')], entries, '2026-08-20', '2026-08-24');
    expect(a.to).toBe(3);
    expect(b.to).toBe(2);
  });

  it('walks back down through a rust entry', () => {
    const entries = [
      entry('a', xpNeeded(1) + xpNeeded(2), '2026-08-21'),
      entry('a', -xpNeeded(2), '2026-08-23', 'rust'),
    ];
    const [line] = levelTrajectory([skill('a')], entries, '2026-08-20', '2026-08-24');
    expect(line.points.map((p) => p.level)).toEqual([1, 3, 3, 2, 2]);
  });

  it('reports the peak, so a climb that rusted away is not hidden', () => {
    const entries = [
      entry('a', xpNeeded(1) + xpNeeded(2), '2026-08-21'),
      entry('a', -(xpNeeded(1) + xpNeeded(2)), '2026-08-23', 'rust'),
    ];
    const [line] = levelTrajectory([skill('a')], entries, '2026-08-20', '2026-08-24');
    expect(line).toMatchObject({ from: 1, to: 1, peak: 3 });
  });

  it('has a peak equal to the level when nothing moved', () => {
    const [line] = levelTrajectory([skill('a')], [], '2026-08-20', '2026-08-24');
    expect(line.peak).toBe(1);
  });

  it('returns nothing for a window that runs backwards', () => {
    expect(levelTrajectory([skill('a')], [], '2026-08-24', '2026-08-20')).toEqual([]);
  });

  it('handles a single-day window', () => {
    const [line] = levelTrajectory([skill('a')], [], '2026-08-24', '2026-08-24');
    expect(line.points).toHaveLength(1);
  });
});

describe('groupByDay', () => {
  it('groups and sums, newest day first', () => {
    const entries = [
      entry('a', 30, '2026-08-22'),
      entry('a', 20, '2026-08-24'),
      entry('b', 10, '2026-08-24'),
    ];
    const days = groupByDay(entries);
    expect(days.map((d) => d.day)).toEqual(['2026-08-24', '2026-08-22']);
    expect(days[0].xp).toBe(30);
    expect(days[1].entries).toHaveLength(1);
  });

  it('is empty for an empty ledger', () => {
    expect(groupByDay([])).toEqual([]);
  });

  it('lets a rust entry pull a day total negative', () => {
    const days = groupByDay([entry('a', 20, '2026-08-24'), entry('a', -300, '2026-08-24', 'rust')]);
    expect(days[0].xp).toBe(-280);
  });

  it('puts the newest entry first within a day', () => {
    const early = entry('a', 10, '2026-08-24');
    const late = { ...entry('a', 20, '2026-08-24'), createdAt: '2026-08-24T18:00:00.000Z' };
    expect(groupByDay([early, late]).at(0)?.entries[0].id).toBe(late.id);
  });
});

/* ------------------------------------------------------------- het raam -- */

describe('the history window', () => {
  const TODAY = '2026-08-25';

  it('reads a known range from the query string', () => {
    for (const value of ['30', '90', '365', 'alles']) {
      expect(toHistoryRange(value)).toBe(value);
    }
  });

  it('falls back to ninety days for anything else', () => {
    for (const value of ['', '45', 'alle', null, undefined, 7, {}]) {
      expect(toHistoryRange(value)).toBe(DEFAULT_RANGE);
    }
    expect(DEFAULT_RANGE).toBe('90');
  });

  it.each([
    ['30', '2026-07-27'],
    ['90', '2026-05-28'],
    ['365', '2025-08-26'],
  ])('counts %s days back to and including today', (range, expected) => {
    expect(windowStart(range as HistoryRange, TODAY, '2020-01-01')).toBe(expected);
  });

  it('gives a fixed range the number of days it says', () => {
    for (const option of HISTORY_RANGES) {
      if (option.days === null) continue;
      const from = windowStart(option.value, TODAY, '2020-01-01');
      expect(daysBetween(from, TODAY) + 1, option.value).toBe(option.days);
    }
  });

  it('reaches back to the first entry for "alles"', () => {
    expect(windowStart('alles', TODAY, '2024-02-29')).toBe('2024-02-29');
  });

  it('still shows a month when the whole account is four days old', () => {
    // A line across four days is not a line. The empty run-up is honest.
    expect(windowStart('alles', TODAY, '2026-08-22')).toBe('2026-07-27');
  });

  it('shows a month when there is nothing at all', () => {
    expect(windowStart('alles', TODAY, null)).toBe('2026-07-27');
  });

  it('names every range', () => {
    for (const option of HISTORY_RANGES) {
      expect(rangeLabelFor(option.value)).toBe(option.label);
    }
  });
});

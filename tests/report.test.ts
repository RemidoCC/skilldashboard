import { describe, expect, it } from 'vitest';
import { buildWeekReport, weekComparison, type ReportInput } from '@/lib/domain/report';
import type { LogEntry, Skill } from '@/lib/domain/types';

function skill(id: string, name = id, lastActiveAt: string | null = null): Skill {
  return {
    id,
    name,
    subtitle: null,
    color: '#5C7A99',
    glyph: 'square',
    level: 3,
    xp: 0,
    floorLevel: 0,
    lastActiveAt,
    active: true,
    sortOrder: 1,
  };
}

let n = 0;
function entry(skillId: string, xp: number, day: string, source: LogEntry['source'] = 'manual'): LogEntry {
  n += 1;
  return {
    id: `e${n}`,
    skillId,
    taskId: null,
    title: 'test',
    xp,
    minutes: null,
    note: null,
    source,
    createdAt: `${day}T10:00:00.000Z`,
  };
}

/* The week of Monday 24 August 2026; the one before starts on 17 August. */
const TODAY = '2026-08-30'; // Sunday

function report(over: Partial<ReportInput> = {}) {
  const base: ReportInput = {
    skills: [skill('a', 'Werk'), skill('b', 'Gezin')],
    entries: [],
    levelAt: () => 3,
    capacity: 'normaal',
    balanceSentence: null,
    proposedQuests: [],
    today: TODAY,
    ...over,
  };
  return buildWeekReport(base);
}

describe('buildWeekReport', () => {
  it('covers the Monday to Sunday the day falls in', () => {
    const r = report();
    expect(r.weekStart).toBe('2026-08-24');
    expect(r.weekEnd).toBe('2026-08-30');
  });

  it('sums this week per skill', () => {
    const r = report({
      entries: [entry('a', 100, '2026-08-25'), entry('a', 50, '2026-08-27'), entry('b', 30, '2026-08-26')],
    });
    expect(r.skills.find((s) => s.skillId === 'a')?.xp).toBe(150);
    expect(r.skills.find((s) => s.skillId === 'b')?.xp).toBe(30);
    expect(r.totalXp).toBe(180);
  });

  it('sums the week before separately', () => {
    const r = report({
      entries: [entry('a', 100, '2026-08-25'), entry('a', 40, '2026-08-18')],
    });
    const werk = r.skills.find((s) => s.skillId === 'a');
    expect(werk).toMatchObject({ xp: 100, previousXp: 40 });
    expect(r.previousTotalXp).toBe(40);
  });

  it('leaves out what fell outside both weeks', () => {
    const r = report({ entries: [entry('a', 900, '2026-07-01')] });
    expect(r.totalXp).toBe(0);
    expect(r.previousTotalXp).toBe(0);
  });

  it('reports what levelled', () => {
    const levels: Record<string, Record<string, number>> = {
      a: { '2026-08-23': 3, '2026-08-30': 5 },
      b: { '2026-08-23': 2, '2026-08-30': 2 },
    };
    const r = report({ levelAt: (id, day) => levels[id][day] ?? 0 });
    expect(r.levelled).toEqual([{ name: 'Werk', from: 3, to: 5 }]);
  });

  it('counts levels gained even when the skill later rusted', () => {
    const levels: Record<string, Record<string, number>> = {
      a: { '2026-08-23': 3, '2026-08-30': 4 },
      b: { '2026-08-23': 2, '2026-08-30': 2 },
    };
    const r = report({ levelAt: (id, day) => levels[id][day] ?? 0 });
    expect(r.skills.find((s) => s.skillId === 'a')?.levelsGained).toBe(1);
  });

  it('never reports a negative gain', () => {
    const levels: Record<string, Record<string, number>> = {
      a: { '2026-08-23': 5, '2026-08-30': 4 },
      b: { '2026-08-23': 2, '2026-08-30': 2 },
    };
    const r = report({ levelAt: (id, day) => levels[id][day] ?? 0 });
    expect(r.skills.find((s) => s.skillId === 'a')?.levelsGained).toBe(0);
  });

  it('says nothing about rust when everything is fresh', () => {
    const r = report({ skills: [skill('a', 'Werk', '2026-08-29T10:00:00.000Z')] });
    expect(r.rust).toEqual([]);
  });

  it('names a skill that is nearly rusting', () => {
    // Eight days quiet on a normal week leaves two days.
    const r = report({ skills: [skill('a', 'Werk', '2026-08-22T10:00:00.000Z')] });
    expect(r.rust).toHaveLength(1);
    expect(r.rust[0]).toMatchObject({ name: 'Werk', status: 'warning', daysUntilRust: 2 });
  });

  it('names a skill that actually rusted this week', () => {
    const r = report({
      skills: [skill('a', 'Werk', '2026-08-29T10:00:00.000Z')],
      entries: [entry('a', -300, '2026-08-26', 'rust')],
    });
    expect(r.rust[0]).toMatchObject({ name: 'Werk', rusted: true });
  });

  it('puts the most urgent rust first', () => {
    const r = report({
      skills: [
        skill('a', 'Werk', '2026-08-22T10:00:00.000Z'),
        skill('b', 'Gezin', '2026-08-19T10:00:00.000Z'),
      ],
    });
    expect(r.rust.map((x) => x.name)).toEqual(['Gezin', 'Werk']);
  });

  it('ignores skills that are switched off', () => {
    const off = { ...skill('c', 'Podium'), active: false };
    const r = report({ skills: [skill('a', 'Werk'), off], entries: [entry('c', 500, '2026-08-25')] });
    expect(r.skills).toHaveLength(1);
    expect(r.totalXp).toBe(0);
  });

  it('carries the balance sentence and the proposals through untouched', () => {
    const quests = [{ skillId: 'a', title: '3 keer Werk', target: 3, bonusXp: 60, weekStart: '2026-08-31' }];
    const r = report({ balanceSentence: 'Werk nam 71 procent.', proposedQuests: quests });
    expect(r.balanceSentence).toBe('Werk nam 71 procent.');
    expect(r.proposedQuests).toEqual(quests);
  });
});

describe('weekComparison', () => {
  const shell = report();

  it('states a rise as a percentage', () => {
    expect(weekComparison({ ...shell, totalXp: 150, previousTotalXp: 100 })).toBe(
      '150 XP deze week, 50 procent meer dan vorige week.',
    );
  });

  it('states a fall the same way', () => {
    expect(weekComparison({ ...shell, totalXp: 50, previousTotalXp: 100 })).toBe(
      '50 XP deze week, 50 procent minder dan vorige week.',
    );
  });

  it('says so plainly when nothing changed', () => {
    expect(weekComparison({ ...shell, totalXp: 100, previousTotalXp: 100 })).toBe(
      '100 XP, precies evenveel als vorige week.',
    );
  });

  it('does not divide by a week that had nothing', () => {
    expect(weekComparison({ ...shell, totalXp: 80, previousTotalXp: 0 })).toBe(
      '80 XP deze week, vorige week niets.',
    );
  });

  it('handles two empty weeks without inventing a number', () => {
    expect(weekComparison({ ...shell, totalXp: 0, previousTotalXp: 0 })).toBe(
      'Deze week en vorige week beide niets.',
    );
  });

  it('never uses an exclamation mark', () => {
    for (const [now, before] of [[150, 100], [50, 100], [0, 0], [80, 0]]) {
      expect(weekComparison({ ...shell, totalXp: now, previousTotalXp: before })).not.toContain('!');
    }
  });
});

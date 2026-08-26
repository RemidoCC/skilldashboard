import { describe, expect, it } from 'vitest';
import {
  buildCandidates,
  CAPACITY_FACTOR,
  generateQuests,
  isQuestComplete,
  MAX_TARGET,
  MIN_TARGET,
  questBonus,
  questScore,
  questTarget,
  QUESTS_PER_WEEK,
  type QuestCandidate,
} from '@/lib/domain/quests';
import type { Skill } from '@/lib/domain/types';

function skill(id: string, name = id, sortOrder = 1, active = true): Skill {
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
    active,
    sortOrder,
  };
}

function candidate(over: Partial<QuestCandidate> & { skill: Skill }): QuestCandidate {
  return { weeklyAverage: 2, daysQuiet: 0, hasActiveGoal: false, ...over };
}

describe('CAPACITY_FACTOR', () => {
  it('matches the scaling in the brief', () => {
    expect(CAPACITY_FACTOR).toEqual({ rustig: 0.5, normaal: 1, gek: 0.75 });
  });
});

describe('questTarget', () => {
  it('asks for one more than the habit on a normal week', () => {
    expect(questTarget(3, 'normaal')).toBe(4);
  });

  it('halves the target on a quiet week, rounding up', () => {
    // base 4, x0.5 = 2
    expect(questTarget(3, 'rustig')).toBe(2);
    // base 5, x0.5 = 2.5 -> 3
    expect(questTarget(4, 'rustig')).toBe(3);
  });

  it('takes three quarters on a busy week, rounding up', () => {
    // base 5, x0.75 = 3.75 -> 4
    expect(questTarget(4, 'gek')).toBe(4);
    // base 4, x0.75 = 3
    expect(questTarget(3, 'gek')).toBe(3);
  });

  it('never asks for less than two', () => {
    expect(questTarget(0, 'rustig')).toBe(MIN_TARGET);
    expect(questTarget(0, 'normaal')).toBe(MIN_TARGET);
  });

  it('never asks for more than six', () => {
    expect(questTarget(50, 'normaal')).toBe(MAX_TARGET);
  });

  it('treats a negative average as no history', () => {
    expect(questTarget(-5, 'normaal')).toBe(MIN_TARGET);
  });
});

describe('questBonus', () => {
  it('scales with the target inside a sane range', () => {
    expect(questBonus(2)).toBe(40);
    expect(questBonus(4)).toBe(80);
    expect(questBonus(6)).toBe(120);
  });

  it('never pays less than forty or more than a hundred and twenty', () => {
    expect(questBonus(1)).toBe(40);
    expect(questBonus(99)).toBe(120);
  });
});

describe('questScore', () => {
  it('puts a skill with an active goal above a quiet one', () => {
    const withGoal = candidate({ skill: skill('a'), hasActiveGoal: true, daysQuiet: 0 });
    const quiet = candidate({ skill: skill('b'), daysQuiet: 30 });
    expect(questScore(withGoal)).toBeGreaterThan(questScore(quiet));
  });

  it('orders the rest by how long they have been quiet', () => {
    expect(questScore(candidate({ skill: skill('a'), daysQuiet: 12 }))).toBeGreaterThan(
      questScore(candidate({ skill: skill('b'), daysQuiet: 3 })),
    );
  });

  it('caps quietness so an abandoned skill cannot outrank a merely quiet one forever', () => {
    const ancient = candidate({ skill: skill('a'), daysQuiet: 400 });
    const month = candidate({ skill: skill('b'), daysQuiet: 30 });
    expect(questScore(ancient)).toBe(questScore(month));
  });
});

describe('generateQuests', () => {
  const week = '2026-08-24';

  it('makes exactly three', () => {
    const candidates = ['a', 'b', 'c', 'd', 'e'].map((id, i) =>
      candidate({ skill: skill(id, id, i + 1) }),
    );
    expect(generateQuests(candidates, 'normaal', week)).toHaveLength(QUESTS_PER_WEEK);
  });

  it('makes fewer when there are fewer skills', () => {
    expect(generateQuests([candidate({ skill: skill('a') })], 'normaal', week)).toHaveLength(1);
  });

  it('ignores skills that are switched off', () => {
    const candidates = [
      candidate({ skill: skill('off', 'Off', 1, false), daysQuiet: 90 }),
      candidate({ skill: skill('on', 'On', 2) }),
    ];
    const quests = generateQuests(candidates, 'normaal', week);
    expect(quests.map((q) => q.skillId)).toEqual(['on']);
  });

  it('prefers skills tied to an active goal', () => {
    const candidates = [
      candidate({ skill: skill('a', 'A', 1), daysQuiet: 20 }),
      candidate({ skill: skill('b', 'B', 2), daysQuiet: 25 }),
      candidate({ skill: skill('c', 'C', 3), daysQuiet: 0, hasActiveGoal: true }),
      candidate({ skill: skill('d', 'D', 4), daysQuiet: 1 }),
    ];
    expect(generateQuests(candidates, 'normaal', week).map((q) => q.skillId)).toContain('c');
  });

  it('then takes the quietest', () => {
    const candidates = [
      candidate({ skill: skill('busy', 'Busy', 1), daysQuiet: 0 }),
      candidate({ skill: skill('quiet', 'Quiet', 2), daysQuiet: 20 }),
    ];
    expect(generateQuests(candidates, 'normaal', week)[0].skillId).toBe('quiet');
  });

  it('breaks ties on sort order, so the same week is always the same week', () => {
    const candidates = [
      candidate({ skill: skill('second', 'Second', 2) }),
      candidate({ skill: skill('first', 'First', 1) }),
    ];
    const once = generateQuests(candidates, 'normaal', week);
    const twice = generateQuests(candidates, 'normaal', week);
    expect(once).toEqual(twice);
    expect(once[0].skillId).toBe('first');
  });

  it('names the quest after what it asks', () => {
    const quests = generateQuests(
      [candidate({ skill: skill('a', 'Werk'), weeklyAverage: 3 })],
      'normaal',
      week,
    );
    expect(quests[0].title).toBe('4 keer Werk');
  });

  it('carries the week it belongs to', () => {
    const quests = generateQuests([candidate({ skill: skill('a') })], 'normaal', week);
    expect(quests[0].weekStart).toBe(week);
  });

  it('is empty with nothing to pick from', () => {
    expect(generateQuests([], 'normaal', week)).toEqual([]);
  });
});

describe('buildCandidates', () => {
  const today = '2026-08-26';

  it('averages completions over the window', () => {
    const days = new Map([['a', ['2026-08-24', '2026-08-25', '2026-08-26']]]);
    const [c] = buildCandidates([skill('a')], days, new Set(), today);
    expect(c.weeklyAverage).toBeCloseTo(3 / 4);
  });

  it('measures quiet from the last day used', () => {
    const days = new Map([['a', ['2026-08-20']]]);
    const [c] = buildCandidates([skill('a')], days, new Set(), today);
    expect(c.daysQuiet).toBe(6);
  });

  it('treats a never-used skill as maximally quiet', () => {
    const [c] = buildCandidates([skill('a')], new Map(), new Set(), today);
    expect(c.daysQuiet).toBe(999);
    expect(c.weeklyAverage).toBe(0);
  });

  it('marks the skills that carry an active goal', () => {
    const [c] = buildCandidates([skill('a')], new Map(), new Set(['a']), today);
    expect(c.hasActiveGoal).toBe(true);
  });
});

describe('isQuestComplete', () => {
  it('is done at the target and beyond', () => {
    expect(isQuestComplete({ target: 3, progress: 2 })).toBe(false);
    expect(isQuestComplete({ target: 3, progress: 3 })).toBe(true);
    expect(isQuestComplete({ target: 3, progress: 5 })).toBe(true);
  });
});

describe('the shape of a week', () => {
  it('is three quests', () => {
    // The literal, not the constant. `toHaveLength(QUESTS_PER_WEEK)` moves both
    // sides at once and cannot fail — changing 3 to 4 left all 510 tests green.
    expect(QUESTS_PER_WEEK).toBe(3);
  });
});

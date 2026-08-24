import { describe, expect, it } from 'vitest';
import { applyRust, GRACE_DAYS, rustState, rustXpDelta, shouldRust } from '@/lib/domain/rust';
import type { LogEntry, Skill } from '@/lib/domain/types';
import { applyXp, rebuild, xpNeeded } from '@/lib/domain/curve';

describe('GRACE_DAYS', () => {
  it('follows the week capacity', () => {
    expect(GRACE_DAYS).toEqual({ rustig: 14, normaal: 10, gek: 21 });
  });
});

describe('rustState', () => {
  it('is calm well inside the grace period', () => {
    const state = rustState('2026-08-20', '2026-08-24', 'normaal');
    expect(state).toEqual({ daysInactive: 4, daysUntilRust: 6, status: 'ok' });
  });

  it('warns from three days out', () => {
    // normaal grace is 10 days; day 7 leaves 3 days, which is the warning edge.
    expect(rustState('2026-08-17', '2026-08-24', 'normaal').status).toBe('warning');
    expect(rustState('2026-08-16', '2026-08-24', 'normaal').status).toBe('warning');
    // Four days out is still calm.
    expect(rustState('2026-08-18', '2026-08-24', 'normaal').status).toBe('ok');
  });

  it('rusts once the grace period is spent', () => {
    const state = rustState('2026-08-14', '2026-08-24', 'normaal');
    expect(state).toEqual({ daysInactive: 10, daysUntilRust: 0, status: 'rusting' });
  });

  it('gives a quiet week longer before rusting', () => {
    expect(rustState('2026-08-14', '2026-08-24', 'rustig').status).toBe('ok');
    expect(rustState('2026-08-14', '2026-08-24', 'gek').status).toBe('ok');
  });

  it('leaves a never-used skill alone', () => {
    expect(rustState(null, '2026-08-24', 'normaal')).toEqual({
      daysInactive: 0,
      daysUntilRust: 10,
      status: 'ok',
    });
  });

  it('does not report negative inactivity for a future timestamp', () => {
    expect(rustState('2026-08-30', '2026-08-24', 'normaal').daysInactive).toBe(0);
  });
});

describe('applyRust', () => {
  it('costs exactly one level', () => {
    expect(applyRust({ level: 8, xp: 120, floorLevel: 5 })).toEqual({
      level: 7,
      xp: 0,
      floorLevel: 5,
    });
  });

  it('never drops below an earned floor', () => {
    expect(applyRust({ level: 5, xp: 40, floorLevel: 5 })).toEqual({
      level: 5,
      xp: 40,
      floorLevel: 5,
    });
  });

  it('never drops below level 1 when no floor was earned', () => {
    expect(applyRust({ level: 1, xp: 10, floorLevel: 0 }).level).toBe(1);
  });

  it('stops at the floor rather than stepping past it', () => {
    expect(applyRust({ level: 6, xp: 0, floorLevel: 5 }).level).toBe(5);
    expect(applyRust({ level: 5, xp: 0, floorLevel: 5 }).level).toBe(5);
  });
});

describe('rustXpDelta', () => {
  it('is the XP standing in the level plus the whole level below', () => {
    // Level 8 with 120 XP: give back the 120, plus all of level 7 (2250).
    expect(rustXpDelta({ level: 8, xp: 120, floorLevel: 5 })).toBe(-(120 + xpNeeded(7)));
  });

  it('is zero on an earned floor, so floors stay permanent', () => {
    expect(rustXpDelta({ level: 5, xp: 40, floorLevel: 5 })).toBe(0);
    expect(rustXpDelta({ level: 4, xp: 0, floorLevel: 5 })).toBe(0);
  });

  it('is zero at level one', () => {
    expect(rustXpDelta({ level: 1, xp: 90, floorLevel: 0 })).toBe(0);
  });

  it('replays through the ledger to exactly one level down at zero XP', () => {
    for (const state of [
      { level: 3, xp: 0, floorLevel: 0 },
      { level: 7, xp: 400, floorLevel: 5 },
      { level: 12, xp: 5000, floorLevel: 10 },
      { level: 2, xp: 1, floorLevel: 0 },
    ]) {
      const replayed = applyXp(state, rustXpDelta(state));
      expect(replayed.level, `from level ${state.level}`).toBe(state.level - 1);
      expect(replayed.xp).toBe(0);
    }
  });

  it('a rusted skill rebuilt from its ledger lands on the same state', () => {
    // Earn up to level 6, then rust once.
    const gains = [100, 303, 580, 919, 1313, 1758];
    const earned = rebuild(gains);
    const decay = rustXpDelta(earned);
    expect(rebuild([...gains, decay])).toEqual(applyRust(earned));
  });
});

describe('shouldRust', () => {
  function skill(over: Partial<Skill> = {}): Skill {
    return {
      id: 'a',
      name: 'Werk',
      subtitle: null,
      color: '#000',
      glyph: 'square',
      level: 6,
      xp: 0,
      floorLevel: 0,
      lastActiveAt: '2026-08-14T10:00:00.000Z',
      active: true,
      sortOrder: 1,
      ...over,
    };
  }

  function rustEntry(at: string): LogEntry {
    return {
      id: 'r1',
      skillId: 'a',
      taskId: null,
      title: 'roest',
      xp: -100,
      minutes: null,
      note: null,
      source: 'rust',
      createdAt: at,
    };
  }

  it('is due once the grace period is spent', () => {
    expect(shouldRust(skill(), [], '2026-08-24', 'normaal')).toBe(true);
  });

  it('is not due inside the grace period', () => {
    expect(shouldRust(skill(), [], '2026-08-20', 'normaal')).toBe(false);
  });

  it('is not due for a skill that is switched off', () => {
    expect(shouldRust(skill({ active: false }), [], '2026-08-24', 'normaal')).toBe(false);
  });

  it('is not due for a skill that was never used', () => {
    expect(shouldRust(skill({ lastActiveAt: null }), [], '2026-08-24', 'normaal')).toBe(false);
  });

  it('costs one level per episode, not one a day', () => {
    // Already rusted after the last time it was used, so it waits.
    const entries = [rustEntry('2026-08-24T02:00:00.000Z')];
    expect(shouldRust(skill(), entries, '2026-08-25', 'normaal')).toBe(false);
    expect(shouldRust(skill(), entries, '2026-09-30', 'normaal')).toBe(false);
  });

  it('is due again once the skill has been used since it last rusted', () => {
    const entries = [rustEntry('2026-08-10T02:00:00.000Z')];
    // Used on the 14th, which is after that rust, so a new episode can start.
    expect(shouldRust(skill(), entries, '2026-08-24', 'normaal')).toBe(true);
  });

  it('is not due for a skill sitting on an earned floor', () => {
    expect(shouldRust(skill({ level: 5, floorLevel: 5 }), [], '2026-08-24', 'normaal')).toBe(false);
  });

  it('is not due at level one', () => {
    expect(shouldRust(skill({ level: 1 }), [], '2026-08-24', 'normaal')).toBe(false);
  });

  it('follows the week capacity', () => {
    // Ten days quiet: past a normal grace, inside a quiet one.
    expect(shouldRust(skill(), [], '2026-08-24', 'normaal')).toBe(true);
    expect(shouldRust(skill(), [], '2026-08-24', 'rustig')).toBe(false);
    expect(shouldRust(skill(), [], '2026-08-24', 'gek')).toBe(false);
  });
});

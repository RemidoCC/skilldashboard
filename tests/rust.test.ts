import { describe, expect, it } from 'vitest';
import { applyRust, GRACE_DAYS, rustState, rustXpDelta } from '@/lib/domain/rust';
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

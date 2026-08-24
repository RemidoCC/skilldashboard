import { describe, expect, it } from 'vitest';
import { applyRust, GRACE_DAYS, rustState } from '@/lib/domain/rust';

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

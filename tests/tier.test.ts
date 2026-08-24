import { describe, expect, it } from 'vitest';
import { romanNumeral, tierFor, totalLevel } from '@/lib/domain/tier';
import type { Skill } from '@/lib/domain/types';

function skill(level: number, active = true): Skill {
  return {
    id: String(Math.random()),
    name: 'x',
    subtitle: null,
    color: '#000',
    glyph: 'square',
    level,
    xp: 0,
    floorLevel: 0,
    lastActiveAt: null,
    active,
    sortOrder: 0,
  };
}

describe('totalLevel', () => {
  it('sums the active skills', () => {
    expect(totalLevel([skill(3), skill(5), skill(1)])).toBe(9);
  });

  it('ignores skills that are switched off', () => {
    expect(totalLevel([skill(3), skill(40, false)])).toBe(3);
  });

  it('is zero with no skills', () => {
    expect(totalLevel([])).toBe(0);
  });
});

describe('tierFor', () => {
  it('starts at Klasse I', () => {
    expect(tierFor(4)).toMatchObject({ tier: 1, label: 'Klasse I', levelsToNext: 6 });
    expect(tierFor(4).progress).toBeCloseTo(0.4);
  });

  it('steps every ten levels', () => {
    expect(tierFor(10).label).toBe('Klasse II');
    expect(tierFor(19).label).toBe('Klasse II');
    expect(tierFor(20).label).toBe('Klasse III');
  });

  it('resets progress on a tier boundary', () => {
    expect(tierFor(10).progress).toBe(0);
    expect(tierFor(10).levelsToNext).toBe(10);
  });

  it('handles zero and negatives without breaking', () => {
    expect(tierFor(0)).toMatchObject({ tier: 1, progress: 0 });
    expect(tierFor(-5).totalLevel).toBe(0);
  });
});

describe('romanNumeral', () => {
  it('covers the range the app can reach', () => {
    expect(romanNumeral(1)).toBe('I');
    expect(romanNumeral(4)).toBe('IV');
    expect(romanNumeral(20)).toBe('XX');
  });

  it('falls back to digits beyond the table', () => {
    expect(romanNumeral(21)).toBe('21');
  });
});

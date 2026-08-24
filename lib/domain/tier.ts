import type { Skill } from './types';

/**
 * The display reports one number: the sum of the levels of every active skill.
 * Tiers band that number into equal steps of ten so the scale is obviously a
 * scale — no hidden curve, no surprise thresholds.
 *
 * Note: the brief does not define tier size. Ten is a choice, kept in one place
 * so it is cheap to change.
 */
export const LEVELS_PER_TIER = 10;

const NUMERALS = [
  'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
  'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX',
];

export interface Tier {
  totalLevel: number;
  tier: number;
  label: string;
  /** 0..1 through the current tier. */
  progress: number;
  levelsToNext: number;
}

export function romanNumeral(n: number): string {
  return NUMERALS[n - 1] ?? String(n);
}

export function totalLevel(skills: readonly Skill[]): number {
  return skills.filter((s) => s.active).reduce((sum, s) => sum + s.level, 0);
}

export function tierFor(total: number): Tier {
  const safe = Math.max(total, 0);
  const tier = Math.floor(safe / LEVELS_PER_TIER) + 1;
  const within = safe % LEVELS_PER_TIER;
  return {
    totalLevel: safe,
    tier,
    label: `Klasse ${romanNumeral(tier)}`,
    progress: within / LEVELS_PER_TIER,
    levelsToNext: LEVELS_PER_TIER - within,
  };
}

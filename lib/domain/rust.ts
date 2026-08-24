import { daysBetween } from './dates';
import type { Capacity, Progress } from './types';

/**
 * Rust is a decay, not a punishment. A skill left alone starts rusting after a
 * grace period that depends on how heavy the week was allowed to be, it costs
 * at most one level, and it can never take a skill below a floor it has earned.
 */
export const GRACE_DAYS: Record<Capacity, number> = {
  rustig: 14,
  normaal: 10,
  gek: 21,
};

/** The UI shows a warning this many days before rust lands. */
export const WARNING_DAYS = 3;

export type RustStatus = 'ok' | 'warning' | 'rusting';

export interface RustState {
  daysInactive: number;
  /** Days left before rust hits. 0 once it has. */
  daysUntilRust: number;
  status: RustStatus;
}

export function rustState(
  lastActiveDay: string | null,
  today: string,
  capacity: Capacity,
): RustState {
  const grace = GRACE_DAYS[capacity];

  // A skill that has never been used has nothing to lose yet.
  if (lastActiveDay === null) {
    return { daysInactive: 0, daysUntilRust: grace, status: 'ok' };
  }

  const daysInactive = Math.max(daysBetween(lastActiveDay, today), 0);
  const daysUntilRust = Math.max(grace - daysInactive, 0);

  const status: RustStatus =
    daysInactive >= grace ? 'rusting' : daysUntilRust <= WARNING_DAYS ? 'warning' : 'ok';

  return { daysInactive, daysUntilRust, status };
}

/**
 * Applies one level of decay. Never drops below floor_level, and never below
 * level 1. XP within the level resets to 0 rather than going negative.
 */
export function applyRust(progress: Progress): Progress {
  const lowest = Math.max(progress.floorLevel, 1);
  if (progress.level <= lowest) {
    return { ...progress, level: lowest };
  }
  return { level: progress.level - 1, xp: 0, floorLevel: progress.floorLevel };
}

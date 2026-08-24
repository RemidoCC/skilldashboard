import { applyXp, xpNeeded } from './curve';
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
 * The ledger amount that one level of decay is worth.
 *
 * Rust is written as a log entry like anything else, so it has to be expressed
 * in XP: enough to give back the XP standing in the current level, plus the
 * whole of the level below. Replaying that lands on exactly level - 1 with
 * zero XP.
 *
 * Returns 0 when the skill is already sitting on an earned floor, or at level
 * 1 — which is what keeps floors permanent. Because the guard lives here,
 * no entry that would breach a floor is ever written, and the ledger stays
 * safe to replay blindly.
 */
export function rustXpDelta(progress: Progress): number {
  const lowest = Math.max(progress.floorLevel, 1);
  if (progress.level <= lowest) return 0;
  return -(progress.xp + xpNeeded(progress.level - 1));
}

/**
 * Applies one level of decay. Never drops below floor_level, and never below
 * level 1. XP within the level resets to 0 rather than going negative.
 */
export function applyRust(progress: Progress): Progress {
  const delta = rustXpDelta(progress);
  if (delta === 0) return { ...progress, level: Math.max(progress.floorLevel, 1, progress.level) };
  const next = applyXp(progress, delta);
  return { level: next.level, xp: next.xp, floorLevel: next.floorLevel };
}

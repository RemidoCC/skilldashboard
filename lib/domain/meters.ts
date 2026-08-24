import { levelFraction } from './curve';
import { dayKey } from './dates';
import { rustState, type RustState } from './rust';
import type { Capacity, Skill } from './types';

export interface MeterReading {
  skill: Skill;
  /** How far into the current level, 0..1. */
  fraction: number;
  rust: RustState;
}

/**
 * Turns skills into gauge readings. Shared by the server render and the
 * optimistic client overlay, so a queued write moves the needles by exactly
 * the same maths that will move them once it lands.
 */
export function readMeters(
  skills: readonly Skill[],
  today: string,
  capacity: Capacity,
): MeterReading[] {
  return skills
    .filter((s) => s.active)
    .map((skill) => ({
      skill,
      fraction: levelFraction(skill),
      rust: rustState(skill.lastActiveAt ? dayKey(skill.lastActiveAt) : null, today, capacity),
    }));
}

/**
 * The skill the status line should report on: the one closest to rusting,
 * preferring one that has already started over one that is merely near.
 * A skill that has never been used has nothing to report.
 */
export function nearestToRust(meters: readonly MeterReading[]): MeterReading | null {
  const candidates = meters.filter((m) => m.skill.lastActiveAt !== null);
  if (candidates.length === 0) return null;

  return [...candidates].sort(
    (a, b) =>
      a.rust.daysUntilRust - b.rust.daysUntilRust ||
      b.rust.daysInactive - a.rust.daysInactive,
  )[0];
}

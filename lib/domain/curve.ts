import type { Progress } from './types';

/**
 * XP required to advance from `level` to `level + 1`.
 *
 *   xp_needed(level) = round(100 * level^1.6)
 *
 * The same function exists in SQL (public.xp_needed). Both round half away
 * from zero so a rebuild in the database can never disagree with the client.
 */
export function xpNeeded(level: number): number {
  if (!Number.isInteger(level) || level < 1) {
    throw new RangeError(`level must be a positive integer, got ${level}`);
  }
  return Math.round(100 * Math.pow(level, 1.6));
}

/** floor_level is claimed every time a skill crosses a multiple of 5. */
function floorFor(level: number, current: number): number {
  return level % 5 === 0 ? Math.max(current, level) : current;
}

export interface AppliedXp extends Progress {
  /** How many levels this single gain produced. Can be more than one. */
  levelsGained: number;
  /** Floors claimed on the way up, in order. Used to decide what to announce. */
  floorsClaimed: number[];
}

/**
 * Applies a gain to a skill. Leftover XP carries into the next level and one
 * completion may cascade through several.
 *
 * A negative gain walks the other way, borrowing from the level below rather
 * than being clamped at zero — that is what lets a rust entry live in the
 * ledger and be replayed exactly. Level 1 is the bottom of the walk; the
 * floor_level promise is enforced by rustXpDelta when the amount is computed,
 * so no entry that breaches a floor is ever written.
 */
export function applyXp(from: Progress, gain: number): AppliedXp {
  if (!Number.isInteger(gain)) {
    throw new RangeError(`gain must be an integer, got ${gain}`);
  }

  let level = from.level;
  let xp = from.xp + gain;
  let floorLevel = from.floorLevel;
  const floorsClaimed: number[] = [];

  for (let need = xpNeeded(level); xp >= need; need = xpNeeded(level)) {
    xp -= need;
    level += 1;
    const next = floorFor(level, floorLevel);
    if (next !== floorLevel) {
      floorLevel = next;
      floorsClaimed.push(level);
    }
  }

  while (xp < 0 && level > 1) {
    level -= 1;
    xp += xpNeeded(level);
  }
  if (xp < 0) xp = 0;

  return { level, xp, floorLevel, levelsGained: level - from.level, floorsClaimed };
}

/** A fresh skill: level 1, no XP, no floor earned yet. */
export const START: Progress = { level: 1, xp: 0, floorLevel: 0 };

/**
 * Replays a skill's ledger from scratch. This is the client-side twin of
 * public.recalculate_levels — log_entries must always be able to rebuild the
 * derived level and XP, and the tests hold both to the same answers.
 */
export function rebuild(gains: readonly number[]): Progress {
  let state: Progress = START;
  for (const gain of gains) {
    const next = applyXp(state, gain);
    state = { level: next.level, xp: next.xp, floorLevel: next.floorLevel };
  }
  return state;
}

/** How far into the current level a skill sits, as 0..1. Drives the meters. */
export function levelFraction(progress: Progress): number {
  const need = xpNeeded(progress.level);
  return need === 0 ? 0 : Math.min(progress.xp / need, 1);
}

/** Total XP ever earned, used for the tier on the main display. */
export function cumulativeXp(progress: Progress): number {
  let total = progress.xp;
  for (let l = 1; l < progress.level; l += 1) total += xpNeeded(l);
  return total;
}

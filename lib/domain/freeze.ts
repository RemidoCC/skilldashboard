import { addDays } from './dates';

/**
 * Streak freezes. One is earned per completed week, at most three are held,
 * and a missed day spends one automatically so the streak survives. Only when
 * none remain does the streak reset.
 *
 * Spending is an event, not a recomputation. A freeze is spent once, on the
 * day it covers, and that is recorded — otherwise a walk back through history
 * would happily burn three freezes on old gaps and manufacture a streak that
 * was never earned. So resolveStreak only ever honours freezes already
 * recorded, and freezeToSpend decides, once a day, whether one is due.
 */
export const MAX_HELD_FREEZES = 3;

export interface Freeze {
  id: string;
  /** Monday of the completed week that earned it. */
  earnedWeek: string;
  /** The day it covered, or null while it is still held. */
  spentOn: string | null;
}

export function heldFreezes(freezes: readonly Freeze[]): Freeze[] {
  return freezes.filter((f) => f.spentOn === null);
}

/** A week earns a freeze once, and only while fewer than three are held. */
export function canGrantFreeze(freezes: readonly Freeze[], week: string): boolean {
  if (freezes.some((f) => f.earnedWeek === week)) return false;
  return heldFreezes(freezes).length < MAX_HELD_FREEZES;
}

export interface StreakOutcome {
  /** Length of the unbroken run, counting days a recorded freeze carried. */
  days: number;
  /** Days in this run that a freeze carried, most recent first. */
  frozenDays: string[];
}

function asSet(days: Iterable<string>): Set<string> {
  return days instanceof Set ? days : new Set(days);
}

/**
 * The unbroken run ending at today.
 *
 * A day still in progress does not break anything, so the walk starts at today
 * when today has an entry and at yesterday when it does not. A gap counts as
 * part of the run only if a freeze was actually spent on it — a frozen day
 * keeps the chain intact, which is the whole point of a freeze.
 */
export function resolveStreak(
  entryDays: Iterable<string>,
  freezes: readonly Freeze[],
  today: string,
): StreakOutcome {
  const days = asSet(entryDays);
  const frozen = new Set(
    freezes.map((f) => f.spentOn).filter((d): d is string => d !== null),
  );

  const frozenDays: string[] = [];
  let count = 0;
  let cursor = days.has(today) ? today : addDays(today, -1);

  while (days.has(cursor) || frozen.has(cursor)) {
    if (!days.has(cursor)) frozenDays.push(cursor);
    count += 1;
    cursor = addDays(cursor, -1);
  }

  return { days: count, frozenDays };
}

/**
 * The day a freeze is due for, or null.
 *
 * Called once per day, after the day it judges is over. A freeze is due when
 * yesterday was missed, nothing already covers it, one is held, and there was
 * a live streak going into it — a freeze protects a streak, it does not start
 * one.
 */
export function freezeToSpend(
  entryDays: Iterable<string>,
  freezes: readonly Freeze[],
  today: string,
): string | null {
  const days = asSet(entryDays);
  const yesterday = addDays(today, -1);

  if (days.has(yesterday)) return null;
  if (freezes.some((f) => f.spentOn === yesterday)) return null;
  if (heldFreezes(freezes).length === 0) return null;

  // Was anything actually running before the gap?
  const before = resolveStreak(days, freezes, addDays(yesterday, -1));
  return before.days > 0 ? yesterday : null;
}

/**
 * The completed week that has earned a freeze but not been given one, or null.
 *
 * A week only earns one if something actually happened in it — a freeze is a
 * reward for a week of showing up, not for the calendar advancing.
 */
export function freezeToGrant(
  entryDays: Iterable<string>,
  freezes: readonly Freeze[],
  currentWeekStart: string,
): string | null {
  const lastWeek = addDays(currentWeekStart, -7);
  const days = entryDays instanceof Set ? entryDays : new Set(entryDays);

  const workedThen = [...days].some((day) => day >= lastWeek && day < currentWeekStart);
  if (!workedThen) return null;

  return canGrantFreeze(freezes, lastWeek) ? lastWeek : null;
}

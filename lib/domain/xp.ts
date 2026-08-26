/**
 * How a completion turns into XP.
 *
 * Every formula keeps integer arithmetic until the final division so that
 * ties land on exact halves and Math.round (half away from zero for positive
 * values) is deterministic. Writing `base * (1 + streak / 100)` instead would
 * make the .5 cases depend on float representation.
 */

/** A checked-off task is worth its face value. */
export function checkXp(value: number): number {
  return value;
}

/**
 * A timer task is worth `value` XP per 10 minutes.
 *
 *   earned = round(minutes / 10 * value)
 *
 * A session that ran but rounds down to nothing still pays `value`, so a short
 * genuine effort is never recorded as zero. A timer stopped at 0 minutes pays
 * nothing — there was no session.
 */
export function timerXp(minutes: number, value: number): number {
  if (minutes < 0) throw new RangeError(`minutes must not be negative, got ${minutes}`);
  const earned = Math.round((minutes * value) / 10);
  if (earned === 0 && minutes > 0) return value;
  return earned;
}

/** The streak bonus tops out at 30 days, i.e. +30%. */
export const MAX_STREAK_BONUS_DAYS = 30;

/**
 *   earned = round(base * (1 + min(streak_days, 30) / 100))
 */
export function withStreakBonus(base: number, streakDays: number): number {
  const capped = Math.min(Math.max(streakDays, 0), MAX_STREAK_BONUS_DAYS);
  return Math.round((base * (100 + capped)) / 100);
}

/** The full pipeline for one completion: base value, then the streak bonus. */
export function earnedXp(
  input: { kind: 'check'; value: number } | { kind: 'timer'; value: number; minutes: number },
  streakDays: number,
): number {
  const base = input.kind === 'check' ? checkXp(input.value) : timerXp(input.minutes, input.value);
  return withStreakBonus(base, streakDays);
}

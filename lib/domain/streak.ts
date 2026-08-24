import { addDays, dayKey } from './dates';

/**
 * Consecutive days with at least one log entry, counted back from today.
 *
 * A day with no entry yet does not end the streak while it is still running —
 * today only breaks it once it is over. So the walk starts at today when today
 * has an entry, and at yesterday when it does not.
 */
export function streakDays(entryDays: Iterable<string>, today: string): number {
  const days = entryDays instanceof Set ? entryDays : new Set(entryDays);
  if (days.size === 0) return 0;

  let cursor = days.has(today) ? today : addDays(today, -1);
  if (!days.has(cursor)) return 0;

  let count = 0;
  while (days.has(cursor)) {
    count += 1;
    cursor = addDays(cursor, -1);
  }
  return count;
}

/**
 * Day keys for a set of log entries.
 *
 * Rust entries are excluded: decay is the system acting on a skill, not the
 * user showing up, so it can neither extend a streak nor stand in for a day.
 */
export function daysFromEntries(
  entries: readonly { createdAt: string; source?: string }[],
): Set<string> {
  return new Set(
    entries.filter((e) => e.source !== 'rust').map((e) => dayKey(e.createdAt)),
  );
}

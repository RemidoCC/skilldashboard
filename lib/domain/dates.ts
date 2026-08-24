/**
 * Day boundaries decide streaks and rust, so they must follow the user's wall
 * clock rather than UTC. Everything here works on a "day key" (YYYY-MM-DD)
 * resolved in a named timezone.
 */

export const TIMEZONE = 'Europe/Amsterdam';

const KEY_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** YYYY-MM-DD for the given instant, in the app's timezone. */
export function dayKey(at: Date | string): string {
  const date = typeof at === 'string' ? new Date(at) : at;
  return KEY_FORMAT.format(date);
}

/** Shifts a day key by whole days. Day keys are calendar dates, so this is
 *  DST-safe: it never touches clock time. */
export function addDays(key: string, delta: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d + delta);
  const shifted = new Date(utc);
  const yy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Whole days from `from` to `to`, both day keys. Negative if `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const ms = Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd);
  return Math.round(ms / 86_400_000);
}

/** The Monday of the week a day key falls in. Weeks start Monday. */
export function weekStart(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const isoDow = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  return addDays(key, 1 - isoDow);
}

/** 24 augustus, not 2026-08-24 — a report reads in words. */
export function readableDay(day: string, withYear = false): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Intl.DateTimeFormat('nl-NL', {
    day: 'numeric',
    month: withYear ? 'short' : 'long',
    ...(withYear && { year: 'numeric' }),
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

import { addDays, weekStart } from './dates';

/**
 * When the Sunday report is on offer.
 *
 * It is generated Sunday at 18:00, but a report you can only see on Sunday
 * evening is a report you will miss. It stays up through Monday so opening the
 * app at the start of the week still shows you the last one.
 */
export const REPORT_HOUR = 18;

export function isReportAvailable(now: Date, timeZone = 'Europe/Amsterdam'): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const weekday = parts.find((p) => p.type === 'weekday')?.value;
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');

  if (weekday === 'Sun') return hour >= REPORT_HOUR;
  return weekday === 'Mon';
}

/**
 * Which report a day belongs to: the week that is ending.
 *
 * Used as the dismissal key, so dismissing Sunday's report does not also
 * dismiss next week's.
 *
 * Whether it is Monday is derived from the day key rather than taken as an
 * argument. The caller used `new Date().getDay() === 1`, which reads the
 * server's clock: on a UTC host, Amsterdam's Monday between 00:00 and 02:00 is
 * still Sunday there, so the key pointed at the week that was starting instead
 * of the one that had ended. A day key already carries the right timezone, and
 * a Monday is simply a day that is its own week start.
 */
export function reportKey(today: string): string {
  const monday = weekStart(today);
  return monday === today ? addDays(monday, -7) : monday;
}

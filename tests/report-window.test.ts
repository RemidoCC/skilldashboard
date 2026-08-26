import { describe, expect, it } from 'vitest';
import { REPORT_HOUR, isReportAvailable, reportKey } from '@/lib/domain/report-window';

/**
 * The Sunday report's window and its dismissal key.
 *
 * This module had no tests at all, which the audit found by changing
 * REPORT_HOUR from 18 to 12 and watching all 510 tests stay green. It also had
 * a real bug: the caller decided "is it Monday" from the server's clock, so on
 * a UTC host the Amsterdam hours between midnight and two on Monday keyed the
 * dismissal to the wrong week.
 */

/** An instant, given as Amsterdam wall time. */
function at(iso: string): Date {
  return new Date(iso);
}

const label = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Amsterdam',
    weekday: 'short',
    hour: '2-digit',
    hour12: false,
  }).format(d);

describe('REPORT_HOUR', () => {
  it('is six in the evening', () => {
    // Written as the number rather than as the constant: a test that compares
    // a rule to itself cannot fail when the rule changes.
    expect(REPORT_HOUR).toBe(18);
  });
});

describe('isReportAvailable', () => {
  it('is shut on Sunday afternoon', () => {
    expect(isReportAvailable(at('2026-08-30T17:59:00+02:00'))).toBe(false);
  });

  it('opens at six on Sunday', () => {
    expect(isReportAvailable(at('2026-08-30T18:00:00+02:00'))).toBe(true);
  });

  it('stays open through Sunday evening', () => {
    expect(isReportAvailable(at('2026-08-30T23:59:00+02:00'))).toBe(true);
  });

  it('is still there on Monday, which is the point of it', () => {
    expect(isReportAvailable(at('2026-08-31T00:30:00+02:00'))).toBe(true);
    expect(isReportAvailable(at('2026-08-31T09:00:00+02:00'))).toBe(true);
    expect(isReportAvailable(at('2026-08-31T23:59:00+02:00'))).toBe(true);
  });

  it('is gone by Tuesday', () => {
    expect(isReportAvailable(at('2026-09-01T00:30:00+02:00'))).toBe(false);
  });

  it('is shut every hour of Monday evening through Saturday', () => {
    const open: string[] = [];
    // Tuesday 00:00 through Saturday 23:00, Amsterdam.
    for (let day = 1; day <= 5; day += 1) {
      for (let hour = 0; hour < 24; hour += 1) {
        const d = new Date(Date.UTC(2026, 8, day, hour - 2));
        if (isReportAvailable(d)) open.push(label(d));
      }
    }
    expect(open).toEqual([]);
  });

  it('reads midnight as hour zero, not as twenty-four', () => {
    // Some ICU builds render hour12:false midnight as "24", which would make
    // `hour >= 18` true and open the report from Sunday 00:00.
    expect(isReportAvailable(at('2026-08-30T00:30:00+02:00'))).toBe(false);
  });

  it('follows the named zone rather than the host clock', () => {
    // 17:30 in Amsterdam is 15:30 UTC. Asked about UTC, it is not yet six.
    const justBefore = at('2026-08-30T17:30:00+02:00');
    expect(isReportAvailable(justBefore, 'Europe/Amsterdam')).toBe(false);
    expect(isReportAvailable(at('2026-08-30T20:30:00+02:00'), 'UTC')).toBe(true);
  });
});

describe('reportKey', () => {
  it('is the Monday of the week that is ending, all Sunday evening', () => {
    expect(reportKey('2026-08-30')).toBe('2026-08-24');
  });

  it('is the same key on the Monday after', () => {
    // The report you did not read on Sunday is the same report on Monday, so
    // dismissing it once has to be enough.
    expect(reportKey('2026-08-31')).toBe('2026-08-24');
  });

  it('never keys a report to the week that has not happened yet', () => {
    // This is the bug: with the weekday taken from a UTC server clock, Monday
    // 00:30 Amsterdam produced '2026-08-31' — next week's Monday. Dismissing
    // then would have silenced a report that did not exist yet.
    for (const day of ['2026-08-30', '2026-08-31']) {
      expect(reportKey(day) < day).toBe(true);
    }
  });

  it('gives each week its own key', () => {
    expect(reportKey('2026-08-23')).toBe('2026-08-17');
    expect(reportKey('2026-08-24')).toBe('2026-08-17');
    expect(reportKey('2026-08-30')).toBe('2026-08-24');
    expect(reportKey('2026-08-31')).toBe('2026-08-24');
    expect(reportKey('2026-09-06')).toBe('2026-08-31');
  });

  it('holds across a month and a year boundary', () => {
    expect(reportKey('2027-01-03')).toBe('2026-12-28'); // a Monday
    expect(reportKey('2027-01-02')).toBe('2026-12-28'); // the Saturday before
  });
});

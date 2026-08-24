import { describe, expect, it } from 'vitest';
import { addDays, dayKey, daysBetween, readableDay, weekStart } from '@/lib/domain/dates';

describe('dayKey', () => {
  it('resolves an instant to the Amsterdam calendar day', () => {
    // 22:30 UTC in summer is already the next day in Amsterdam (UTC+2).
    expect(dayKey('2026-08-23T22:30:00.000Z')).toBe('2026-08-24');
    expect(dayKey('2026-08-24T09:00:00.000Z')).toBe('2026-08-24');
  });

  it('handles the winter offset', () => {
    // 23:30 UTC in winter is 00:30 the next day in Amsterdam (UTC+1).
    expect(dayKey('2026-01-14T23:30:00.000Z')).toBe('2026-01-15');
    expect(dayKey('2026-01-14T22:30:00.000Z')).toBe('2026-01-14');
  });
});

describe('addDays', () => {
  it('moves forward and back', () => {
    expect(addDays('2026-08-24', 1)).toBe('2026-08-25');
    expect(addDays('2026-08-24', -1)).toBe('2026-08-23');
  });

  it('crosses months and years', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('survives a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
  });

  it('is unaffected by the DST switch', () => {
    // Clocks go forward on 29 March 2026 in Amsterdam.
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
  });
});

describe('daysBetween', () => {
  it('counts whole days in both directions', () => {
    expect(daysBetween('2026-08-20', '2026-08-24')).toBe(4);
    expect(daysBetween('2026-08-24', '2026-08-20')).toBe(-4);
    expect(daysBetween('2026-08-24', '2026-08-24')).toBe(0);
  });

  it('counts across the DST switch as whole days', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
  });
});

describe('weekStart', () => {
  it('returns the Monday of the week', () => {
    expect(weekStart('2026-08-24')).toBe('2026-08-24'); // a Monday
    expect(weekStart('2026-08-26')).toBe('2026-08-24');
    expect(weekStart('2026-08-30')).toBe('2026-08-24'); // Sunday belongs to it
    expect(weekStart('2026-08-31')).toBe('2026-08-31');
  });
});

describe('readableDay', () => {
  it('spells the month out', () => {
    expect(readableDay('2026-08-24')).toBe('24 augustus');
  });

  it('abbreviates and adds the year when asked', () => {
    expect(readableDay('2026-03-02', true)).toBe('2 mrt 2026');
  });

  it('does not shift the day across a timezone', () => {
    // Formatted in UTC from the day key, so the first of the month stays the first.
    expect(readableDay('2026-01-01')).toBe('1 januari');
    expect(readableDay('2026-12-31')).toBe('31 december');
  });
});

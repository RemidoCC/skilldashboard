import { describe, expect, it } from 'vitest';
import { streakDays } from '@/lib/domain/streak';

describe('streakDays', () => {
  it('is zero with no history', () => {
    expect(streakDays([], '2026-08-24')).toBe(0);
  });

  it('counts consecutive days ending today', () => {
    const days = ['2026-08-22', '2026-08-23', '2026-08-24'];
    expect(streakDays(days, '2026-08-24')).toBe(3);
  });

  it('keeps the streak alive on a day that has not been logged yet', () => {
    // Today is still running: nothing logged yet does not break anything.
    const days = ['2026-08-22', '2026-08-23'];
    expect(streakDays(days, '2026-08-24')).toBe(2);
  });

  it('breaks once a whole day was missed', () => {
    const days = ['2026-08-20', '2026-08-21'];
    expect(streakDays(days, '2026-08-24')).toBe(0);
  });

  it('counts only the run that reaches the present', () => {
    const days = ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-23', '2026-08-24'];
    expect(streakDays(days, '2026-08-24')).toBe(2);
  });

  it('crosses a month boundary', () => {
    const days = ['2026-07-30', '2026-07-31', '2026-08-01'];
    expect(streakDays(days, '2026-08-01')).toBe(3);
  });

  it('handles a single day today', () => {
    expect(streakDays(['2026-08-24'], '2026-08-24')).toBe(1);
  });
});

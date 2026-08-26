import { describe, expect, it } from 'vitest';
import {
  MAX_STREAK_BONUS_DAYS,
  checkXp,
  earnedXp,
  timerXp,
  withStreakBonus,
} from '@/lib/domain/xp';

describe('checkXp', () => {
  it('is the task value', () => {
    expect(checkXp(25)).toBe(25);
  });
});

describe('timerXp', () => {
  it('pays value per ten minutes', () => {
    expect(timerXp(10, 20)).toBe(20);
    expect(timerXp(30, 20)).toBe(60);
    expect(timerXp(45, 10)).toBe(45);
  });

  it('rounds half away from zero, deterministically', () => {
    // 5 minutes at 15 XP/10min = 7.5 -> 8, never 7.
    expect(timerXp(5, 15)).toBe(8);
    expect(timerXp(15, 5)).toBe(8);
  });

  it('pays the value when a real session rounds down to nothing', () => {
    // 1 minute at 5 XP/10min = 0.5 -> 1 by rounding, so exercise a true zero.
    expect(timerXp(1, 4)).toBe(4);
    expect(timerXp(2, 2)).toBe(2);
  });

  it('pays nothing for a timer that never ran', () => {
    expect(timerXp(0, 50)).toBe(0);
  });

  it('rejects negative minutes', () => {
    expect(() => timerXp(-5, 10)).toThrow(RangeError);
  });
});

describe('withStreakBonus', () => {
  it('is a no-op at zero', () => {
    expect(withStreakBonus(50, 0)).toBe(50);
  });

  it('adds one percent per streak day', () => {
    expect(withStreakBonus(100, 7)).toBe(107);
    expect(withStreakBonus(200, 10)).toBe(220);
  });

  it('rounds ties up rather than to even', () => {
    // 5 * 1.10 = 5.5 exactly. Half away from zero gives 6.
    expect(withStreakBonus(5, 10)).toBe(6);
    // 15 * 1.10 = 16.5 -> 17, where round-half-to-even would give 16.
    expect(withStreakBonus(15, 10)).toBe(17);
  });

  it('caps the bonus at thirty days', () => {
    // Written against the number rather than against MAX_STREAK_BONUS_DAYS: a
    // test that compares the rule to itself moves whenever the rule does, and
    // then it is not a test of anything.
    expect(withStreakBonus(100, 29)).toBe(129);
    expect(withStreakBonus(100, 30)).toBe(130);
    expect(withStreakBonus(100, 31)).toBe(130);
    expect(withStreakBonus(100, 365)).toBe(130);
    expect(MAX_STREAK_BONUS_DAYS).toBe(30);
  });

  it('treats a negative streak as no streak', () => {
    expect(withStreakBonus(100, -4)).toBe(100);
  });
});

describe('earnedXp', () => {
  it('applies the streak bonus after the base value', () => {
    expect(earnedXp({ kind: 'check', value: 100 }, 10)).toBe(110);
  });

  it('applies the streak bonus after the timer conversion', () => {
    // 30 minutes at 20 = 60 base, +10% = 66.
    expect(earnedXp({ kind: 'timer', value: 20, minutes: 30 }, 10)).toBe(66);
  });

  it('keeps the short-session floor before the bonus', () => {
    // base floors to 4, then +20% = 4.8 -> 5.
    expect(earnedXp({ kind: 'timer', value: 4, minutes: 1 }, 20)).toBe(5);
  });
});

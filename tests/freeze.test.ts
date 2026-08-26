import { describe, expect, it } from 'vitest';
import {
  canGrantFreeze,
  freezeToGrant,
  freezeToSpend,
  heldFreezes,
  MAX_HELD_FREEZES,
  resolveStreak,
  type Freeze,
} from '@/lib/domain/freeze';

function freeze(earnedWeek: string, spentOn: string | null = null): Freeze {
  return { id: `${earnedWeek}-${spentOn ?? 'held'}`, earnedWeek, spentOn };
}

describe('heldFreezes', () => {
  it('counts only the unspent ones', () => {
    const all = [freeze('2026-08-03'), freeze('2026-08-10', '2026-08-14'), freeze('2026-08-17')];
    expect(heldFreezes(all)).toHaveLength(2);
  });
});

describe('canGrantFreeze', () => {
  it('grants one for a fresh week', () => {
    expect(canGrantFreeze([], '2026-08-24')).toBe(true);
  });

  it('never grants the same week twice', () => {
    expect(canGrantFreeze([freeze('2026-08-24')], '2026-08-24')).toBe(false);
  });

  it('stops at three held', () => {
    const three = [freeze('2026-08-03'), freeze('2026-08-10'), freeze('2026-08-17')];
    expect(heldFreezes(three)).toHaveLength(MAX_HELD_FREEZES);
    expect(canGrantFreeze(three, '2026-08-24')).toBe(false);
  });

  it('grants again once one has been spent', () => {
    const three = [freeze('2026-08-03', '2026-08-05'), freeze('2026-08-10'), freeze('2026-08-17')];
    expect(canGrantFreeze(three, '2026-08-24')).toBe(true);
  });
});

describe('resolveStreak', () => {
  it('is zero with no history', () => {
    expect(resolveStreak([], [], '2026-08-24')).toEqual({ days: 0, frozenDays: [] });
  });

  it('counts an unbroken run', () => {
    const days = ['2026-08-22', '2026-08-23', '2026-08-24'];
    expect(resolveStreak(days, [], '2026-08-24').days).toBe(3);
  });

  it('does not spend a held freeze just by being asked', () => {
    // Three held freezes must not conjure a run out of a single logged day.
    const held = [freeze('a'), freeze('b'), freeze('c')];
    expect(resolveStreak(['2026-08-24'], held, '2026-08-24').days).toBe(1);
  });

  it('carries the chain across a day a freeze was spent on', () => {
    const days = ['2026-08-20', '2026-08-22', '2026-08-23', '2026-08-24'];
    const outcome = resolveStreak(days, [freeze('2026-08-17', '2026-08-21')], '2026-08-24');
    expect(outcome.days).toBe(5);
    expect(outcome.frozenDays).toEqual(['2026-08-21']);
  });

  it('still stops at a gap no freeze covered', () => {
    const days = ['2026-08-18', '2026-08-22', '2026-08-23', '2026-08-24'];
    expect(resolveStreak(days, [freeze('2026-08-17', '2026-08-21')], '2026-08-24').days).toBe(4);
  });

  it('keeps a day still in progress from breaking anything', () => {
    expect(resolveStreak(['2026-08-22', '2026-08-23'], [], '2026-08-24').days).toBe(2);
  });
});

describe('freezeToSpend', () => {
  const running = ['2026-08-21', '2026-08-22'];

  it('is due when a live streak missed yesterday', () => {
    // Yesterday is 23 August, and 21-22 were running into it.
    expect(freezeToSpend(running, [freeze('2026-08-17')], '2026-08-24')).toBe('2026-08-23');
  });

  it('is not due when yesterday was logged', () => {
    expect(freezeToSpend([...running, '2026-08-23'], [freeze('a')], '2026-08-24')).toBeNull();
  });

  it('is not due when nothing is held', () => {
    expect(freezeToSpend(running, [], '2026-08-24')).toBeNull();
  });

  it('is not due twice for the same day', () => {
    const spent = [freeze('2026-08-17', '2026-08-23')];
    expect(freezeToSpend(running, spent, '2026-08-24')).toBeNull();
  });

  it('protects a streak but never starts one', () => {
    // Nothing was running, so there is nothing to protect.
    expect(freezeToSpend([], [freeze('a')], '2026-08-24')).toBeNull();
    expect(freezeToSpend(['2026-08-01'], [freeze('a')], '2026-08-24')).toBeNull();
  });

  it('protects a run that was itself carried by an earlier freeze', () => {
    const days = ['2026-08-20', '2026-08-22'];
    const freezes = [freeze('2026-08-10', '2026-08-21'), freeze('2026-08-17')];
    expect(freezeToSpend(days, freezes, '2026-08-24')).toBe('2026-08-23');
  });
});

describe('freezeToGrant', () => {
  const week = '2026-08-24';

  it('grants for a completed week that was worked', () => {
    expect(freezeToGrant(['2026-08-19'], [], week)).toBe('2026-08-17');
  });

  it('grants nothing for a week where nothing happened', () => {
    expect(freezeToGrant(['2026-08-25'], [], week)).toBeNull();
  });

  it('grants nothing twice for the same week', () => {
    expect(freezeToGrant(['2026-08-19'], [freeze('2026-08-17')], week)).toBeNull();
  });

  it('grants nothing while three are already held', () => {
    const three = [freeze('2026-07-27'), freeze('2026-08-03'), freeze('2026-08-10')];
    expect(freezeToGrant(['2026-08-19'], three, week)).toBeNull();
  });

  it('grants again once one has been spent', () => {
    const three = [freeze('2026-07-27', '2026-08-01'), freeze('2026-08-03'), freeze('2026-08-10')];
    expect(freezeToGrant(['2026-08-19'], three, week)).toBe('2026-08-17');
  });

  it('ignores work from this week or older weeks', () => {
    expect(freezeToGrant(['2026-08-24', '2026-08-01'], [], week)).toBeNull();
  });
});

describe('freezeToSpend and a gap that has already broken the streak', () => {
  const held: Freeze[] = [{ id: 'f1', earnedWeek: '2026-08-10', spentOn: null }];

  it('covers yesterday when the day before it was worked', () => {
    const days = new Set(['2026-08-17', '2026-08-18']);
    expect(freezeToSpend(days, held, '2026-08-20')).toBe('2026-08-19');
  });

  it('covers yesterday when the day before it was itself frozen', () => {
    const days = new Set(['2026-08-17']);
    const chain: Freeze[] = [
      { id: 'f0', earnedWeek: '2026-08-03', spentOn: '2026-08-18' },
      { id: 'f1', earnedWeek: '2026-08-10', spentOn: null },
    ];
    expect(freezeToSpend(days, chain, '2026-08-20')).toBe('2026-08-19');
  });

  it('spends nothing once the gap is two days wide', () => {
    // Worked through Monday the 17th, missed Tuesday and Wednesday, and the
    // daily job did not run on Wednesday. The streak died on Tuesday; a freeze
    // spent on Wednesday would be thrown away for nothing.
    const days = new Set(['2026-08-15', '2026-08-16', '2026-08-17']);
    expect(freezeToSpend(days, held, '2026-08-20')).toBe(null);
  });

  it('still refuses to start a streak from nothing', () => {
    expect(freezeToSpend(new Set<string>(), held, '2026-08-20')).toBe(null);
  });
});

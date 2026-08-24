import { describe, expect, it } from 'vitest';
import { applyXp, cumulativeXp, levelFraction, rebuild, START, xpNeeded } from '@/lib/domain/curve';

describe('xpNeeded', () => {
  // These are the values the database returns for public.xp_needed(1..12).
  // If this table and the SQL ever disagree, history silently corrupts.
  it('matches round(100 * level^1.6)', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(xpNeeded)).toEqual([
      100, 303, 580, 919, 1313, 1758, 2250, 2786, 3363, 3981, 4637, 5330,
    ]);
  });

  it('rejects a level below 1', () => {
    expect(() => xpNeeded(0)).toThrow(RangeError);
    expect(() => xpNeeded(-3)).toThrow(RangeError);
  });
});

describe('applyXp', () => {
  it('adds XP without levelling when the gain is small', () => {
    expect(applyXp(START, 40)).toMatchObject({ level: 1, xp: 40, levelsGained: 0 });
  });

  it('levels up and carries the remainder over', () => {
    // 100 needed at level 1, so 140 leaves 40 sitting in level 2.
    expect(applyXp(START, 140)).toMatchObject({ level: 2, xp: 40, levelsGained: 1 });
  });

  it('levels exactly on the boundary with nothing left over', () => {
    expect(applyXp(START, 100)).toMatchObject({ level: 2, xp: 0, levelsGained: 1 });
  });

  it('cascades several levels from a single completion', () => {
    // 100 + 303 + 580 = 983 clears levels 1, 2 and 3 with 17 to spare.
    const result = applyXp(START, 1000);
    expect(result).toMatchObject({ level: 4, xp: 17, levelsGained: 3 });
  });

  it('claims a floor when it crosses a multiple of 5', () => {
    // Everything up to level 5: 100+303+580+919 = 1902.
    const result = applyXp(START, 1902);
    expect(result.level).toBe(5);
    expect(result.floorLevel).toBe(5);
    expect(result.floorsClaimed).toEqual([5]);
  });

  it('claims every floor a long cascade passes through', () => {
    let total = 0;
    for (let l = 1; l < 10; l += 1) total += xpNeeded(l);
    const result = applyXp(START, total);
    expect(result.level).toBe(10);
    expect(result.floorsClaimed).toEqual([5, 10]);
    expect(result.floorLevel).toBe(10);
  });

  it('does not lower a floor that was already earned', () => {
    const held = { level: 6, xp: 0, floorLevel: 5 };
    expect(applyXp(held, 10).floorLevel).toBe(5);
  });

  it('walks down a level when a negative gain overdraws the current one', () => {
    // 10 - 50 = -40, so it borrows level 2 back and lands 40 short of its top.
    expect(applyXp({ level: 3, xp: 10, floorLevel: 0 }, -50)).toMatchObject({
      level: 2,
      xp: xpNeeded(2) - 40,
    });
  });

  it('walks down several levels at once', () => {
    expect(applyXp({ level: 4, xp: 0, floorLevel: 0 }, -(xpNeeded(3) + xpNeeded(2)))).toMatchObject({
      level: 2,
      xp: 0,
    });
  });

  it('stops at level one rather than going under', () => {
    expect(applyXp({ level: 2, xp: 0, floorLevel: 0 }, -99999)).toMatchObject({
      level: 1,
      xp: 0,
    });
  });

  it('a gain and its exact negative cancel out', () => {
    const start = { level: 4, xp: 217, floorLevel: 0 };
    const up = applyXp(start, 640);
    const back = applyXp({ level: up.level, xp: up.xp, floorLevel: up.floorLevel }, -640);
    expect(back).toMatchObject({ level: start.level, xp: start.xp });
  });

  it('does not give back a floor once it has been earned', () => {
    const earned = applyXp({ level: 5, xp: 0, floorLevel: 5 }, -1);
    expect(earned.level).toBe(4);
    expect(earned.floorLevel).toBe(5);
  });

  it('rejects a non-integer gain', () => {
    expect(() => applyXp(START, 12.5)).toThrow(RangeError);
  });
});

describe('rebuild', () => {
  it('replaying the ledger equals applying the gains one by one', () => {
    const gains = [40, 60, 200, 15, 900, 5, 1200];
    let running = START;
    for (const g of gains) {
      const next = applyXp(running, g);
      running = { level: next.level, xp: next.xp, floorLevel: next.floorLevel };
    }
    expect(rebuild(gains)).toEqual(running);
  });

  it('is order-independent in total but not in floors — the sum still lands the same', () => {
    const forward = rebuild([500, 700, 900]);
    const backward = rebuild([900, 700, 500]);
    expect(forward).toEqual(backward);
  });

  it('an empty ledger is a fresh skill', () => {
    expect(rebuild([])).toEqual(START);
  });
});

describe('levelFraction', () => {
  it('reports how far into the level a skill sits', () => {
    expect(levelFraction({ level: 1, xp: 50, floorLevel: 0 })).toBeCloseTo(0.5);
    expect(levelFraction({ level: 2, xp: 0, floorLevel: 0 })).toBe(0);
  });
});

describe('cumulativeXp', () => {
  it('counts every level cleared plus the XP standing in the current one', () => {
    expect(cumulativeXp({ level: 1, xp: 40, floorLevel: 0 })).toBe(40);
    expect(cumulativeXp({ level: 3, xp: 10, floorLevel: 0 })).toBe(100 + 303 + 10);
  });
});

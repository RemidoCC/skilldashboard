import { describe, expect, it } from 'vitest';
import { applyPending, pendingXpOn } from '@/lib/offline/optimistic';
import { xpNeeded } from '@/lib/domain/curve';
import type { Skill } from '@/lib/domain/types';
import type { PendingCompletion } from '@/lib/offline/types';

function skill(id: string, level = 1, xp = 0, floorLevel = 0): Skill {
  return {
    id,
    name: id,
    subtitle: null,
    color: '#000',
    glyph: 'square',
    level,
    xp,
    floorLevel,
    lastActiveAt: null,
    active: true,
    sortOrder: 0,
  };
}

function queued(skillId: string, xp: number, occurredAt = '2026-08-24T10:00:00.000Z'): PendingCompletion {
  return {
    id: `${skillId}-${xp}-${occurredAt}`,
    kind: 'quick',
    skillId,
    title: 'test',
    xp,
    taskId: null,
    minutes: null,
    note: null,
    occurredAt,
    attempts: 0,
  };
}

describe('applyPending', () => {
  it('leaves the state alone when nothing is queued', () => {
    const skills = [skill('a', 3, 50)];
    expect(applyPending(skills, [])).toEqual(skills);
  });

  it('moves the skill a queued write belongs to', () => {
    const [a] = applyPending([skill('a', 1, 20)], [queued('a', 30)]);
    expect(a).toMatchObject({ level: 1, xp: 50 });
  });

  it('leaves other skills untouched', () => {
    const result = applyPending([skill('a'), skill('b', 2, 10)], [queued('a', 40)]);
    expect(result[1]).toMatchObject({ level: 2, xp: 10 });
  });

  it('levels up optimistically', () => {
    const [a] = applyPending([skill('a', 1, 80)], [queued('a', 40)]);
    expect(a).toMatchObject({ level: 2, xp: 20 });
  });

  it('adds several queued writes to the same skill', () => {
    const [a] = applyPending([skill('a')], [queued('a', 30), queued('a', 40)]);
    expect(a.xp).toBe(70);
  });

  it('cascades and claims a floor just as a real write would', () => {
    let total = 0;
    for (let l = 1; l < 5; l += 1) total += xpNeeded(l);
    const [a] = applyPending([skill('a')], [queued('a', total)]);
    expect(a.level).toBe(5);
    expect(a.floorLevel).toBe(5);
  });

  it('pushes lastActiveAt forward so rust backs off immediately', () => {
    const stale = { ...skill('a'), lastActiveAt: '2026-08-01T10:00:00.000Z' };
    const [a] = applyPending([stale], [queued('a', 10, '2026-08-24T10:00:00.000Z')]);
    expect(a.lastActiveAt).toBe('2026-08-24T10:00:00.000Z');
  });

  it('never moves lastActiveAt backwards', () => {
    const fresh = { ...skill('a'), lastActiveAt: '2026-08-24T18:00:00.000Z' };
    const [a] = applyPending([fresh], [queued('a', 10, '2026-08-24T09:00:00.000Z')]);
    expect(a.lastActiveAt).toBe('2026-08-24T18:00:00.000Z');
  });

  it('ignores a queued write for a skill that is not shown', () => {
    const result = applyPending([skill('a')], [queued('ghost', 500)]);
    expect(result[0]).toMatchObject({ level: 1, xp: 0 });
  });
});

describe('pendingXpOn', () => {
  it('counts only the given day', () => {
    const items = [
      queued('a', 30, '2026-08-24T10:00:00.000Z'),
      queued('a', 20, '2026-08-23T10:00:00.000Z'),
    ];
    expect(pendingXpOn(items, '2026-08-24')).toBe(30);
  });

  it('is zero with nothing queued', () => {
    expect(pendingXpOn([], '2026-08-24')).toBe(0);
  });

  it('resolves the day in the app timezone, not UTC', () => {
    // 22:30 UTC in summer is already the next day in Amsterdam.
    const late = queued('a', 15, '2026-08-23T22:30:00.000Z');
    expect(pendingXpOn([late], '2026-08-24')).toBe(15);
  });
});

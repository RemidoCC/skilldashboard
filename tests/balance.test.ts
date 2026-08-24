import { describe, expect, it } from 'vitest';
import { balanceSignal } from '@/lib/domain/balance';
import type { LogEntry, Skill } from '@/lib/domain/types';

function skill(id: string, name: string, active = true): Skill {
  return {
    id,
    name,
    subtitle: null,
    color: '#000000',
    glyph: 'square',
    level: 1,
    xp: 0,
    floorLevel: 0,
    lastActiveAt: null,
    active,
    sortOrder: 0,
  };
}

function entry(skillId: string, xp: number, day: string): LogEntry {
  return {
    id: `${skillId}-${day}-${xp}`,
    skillId,
    taskId: null,
    title: 'test',
    xp,
    minutes: null,
    note: null,
    source: 'manual',
    // Midday Amsterdam time, so the day key is unambiguous.
    createdAt: `${day}T10:00:00.000Z`,
  };
}

const skills = [skill('w', 'Werk'), skill('g', 'Gezin'), skill('h', 'Gezondheid')];

describe('balanceSignal', () => {
  it('says nothing when there is no history', () => {
    expect(balanceSignal(skills, [], '2026-08-24').sentence).toBeNull();
  });

  it('says nothing when the spread is reasonable', () => {
    const entries = [
      entry('w', 100, '2026-08-20'),
      entry('g', 80, '2026-08-21'),
      entry('h', 70, '2026-08-22'),
    ];
    expect(balanceSignal(skills, entries, '2026-08-24').sentence).toBeNull();
  });

  it('flags one skill over 55% against another under 10%', () => {
    const entries = [
      entry('w', 800, '2026-08-20'),
      entry('g', 300, '2026-08-21'),
      entry('h', 20, '2026-08-22'),
    ];
    const signal = balanceSignal(skills, entries, '2026-08-24');
    expect(signal.dominant?.name).toBe('Werk');
    expect(signal.quiet?.name).toBe('Gezondheid');
    expect(signal.sentence).toBe('Werk nam 71 procent van je XP in twee weken, Gezondheid 2 procent.');
  });

  it('stays quiet when the leader is dominant but nobody is starved', () => {
    const entries = [
      entry('w', 600, '2026-08-20'),
      entry('g', 250, '2026-08-21'),
      entry('h', 150, '2026-08-22'),
    ];
    // Werk is 60%, but Gezondheid is 15% — above the quiet threshold.
    expect(balanceSignal(skills, entries, '2026-08-24').sentence).toBeNull();
  });

  it('ignores entries outside the trailing fourteen days', () => {
    const entries = [
      entry('w', 5000, '2026-07-01'), // long past, must not count
      entry('w', 100, '2026-08-20'),
      entry('g', 90, '2026-08-21'),
      entry('h', 80, '2026-08-22'),
    ];
    expect(balanceSignal(skills, entries, '2026-08-24').sentence).toBeNull();
  });

  it('counts the fourteenth day back but not the fifteenth', () => {
    const inside = balanceSignal(skills, [entry('w', 100, '2026-08-11')], '2026-08-24');
    expect(inside.shares.find((s) => s.skillId === 'w')?.xp).toBe(100);

    const outside = balanceSignal(skills, [entry('w', 100, '2026-08-10')], '2026-08-24');
    expect(outside.shares.find((s) => s.skillId === 'w')?.xp).toBe(0);
  });

  it('ignores skills that are switched off', () => {
    const withOff = [...skills, skill('x', 'Podium', false)];
    const entries = [
      entry('x', 9000, '2026-08-20'),
      entry('w', 100, '2026-08-21'),
      entry('g', 90, '2026-08-22'),
      entry('h', 80, '2026-08-23'),
    ];
    const signal = balanceSignal(withOff, entries, '2026-08-24');
    expect(signal.sentence).toBeNull();
    expect(signal.shares.some((s) => s.name === 'Podium')).toBe(false);
  });

  it('never uses an exclamation mark', () => {
    const entries = [entry('w', 800, '2026-08-20'), entry('h', 10, '2026-08-21')];
    const sentence = balanceSignal(skills, entries, '2026-08-24').sentence ?? '';
    expect(sentence).not.toContain('!');
  });
});

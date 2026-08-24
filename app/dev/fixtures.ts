import { levelFraction } from '@/lib/domain/curve';
import { rustState } from '@/lib/domain/rust';
import { statusLines } from '@/lib/domain/status';
import { tierFor, totalLevel } from '@/lib/domain/tier';
import type { Skill, Task } from '@/lib/domain/types';

/**
 * Fixture state for the visual preview. Chosen to exercise the states that are
 * easy to get wrong: a two-digit display, a skill mid-level, a skill sitting on
 * an earned floor, and one that has started rusting.
 */
const TODAY = '2026-08-24';

function at(daysAgo: number): string {
  const [y, m, d] = TODAY.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - daysAgo, 9, 0, 0)).toISOString();
}

export const skills: Skill[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Werk',
    subtitle: 'Loondienst en opdrachten',
    color: '#5C7A99',
    glyph: 'square',
    level: 7,
    xp: 1200,
    floorLevel: 5,
    lastActiveAt: at(0),
    active: true,
    sortOrder: 1,
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Remido',
    subtitle: 'Eigen zaak',
    color: '#A6572E',
    glyph: 'diamond',
    level: 4,
    xp: 400,
    floorLevel: 0,
    lastActiveAt: at(2),
    active: true,
    sortOrder: 2,
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Gezin',
    subtitle: 'Thuis en aandacht',
    color: '#6E8C5A',
    glyph: 'ring',
    level: 5,
    xp: 90,
    floorLevel: 5,
    lastActiveAt: at(1),
    active: true,
    sortOrder: 3,
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    name: 'Gezondheid',
    subtitle: 'Lichaam en rust',
    color: '#8A6E9E',
    glyph: 'wave',
    level: 3,
    xp: 200,
    floorLevel: 0,
    lastActiveAt: at(12),
    active: true,
    sortOrder: 4,
  },
];

export const tasks: Task[] = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    skillId: skills[0].id,
    title: 'Offerte afmaken',
    kind: 'check',
    value: 30,
    onToday: true,
    archived: false,
  },
  {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    skillId: skills[1].id,
    title: 'Diep werkblok',
    kind: 'timer',
    value: 20,
    onToday: true,
    archived: false,
  },
  {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    skillId: skills[3].id,
    title: 'Wandelen',
    kind: 'timer',
    value: 15,
    onToday: true,
    archived: false,
  },
];

export const meters = skills.map((skill) => ({
  skill,
  fraction: levelFraction(skill),
  rust: rustState(skill.lastActiveAt!.slice(0, 10), TODAY, 'normaal'),
}));

export const tier = tierFor(totalLevel(skills));

export const lines = statusLines({
  xpToday: 145,
  balanceSentence: 'Werk nam 68 procent van je XP in twee weken, Gezondheid 4 procent.',
  quests: { total: 3, completed: 1 },
  rust: {
    name: 'Gezondheid',
    daysInactive: 12,
    daysUntilRust: 0,
    status: 'rusting',
  },
});

export const streak = 6;
export const seasonLabel = 'S02 · W07';

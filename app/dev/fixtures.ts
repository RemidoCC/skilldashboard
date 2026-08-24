import { groupByDay, levelTrajectory, WINDOW_DAYS } from '@/lib/domain/trajectory';
import { addDays } from '@/lib/domain/dates';
import type { LogEntry, Skill, Task } from '@/lib/domain/types';
import type { Goal } from '@/lib/offline/mutations';

/**
 * Fixture state for the visual preview. Chosen to exercise the states that are
 * easy to get wrong: a two-digit display, a skill mid-level, a skill sitting on
 * an earned floor, and one that has started rusting.
 */
export const TODAY = '2026-08-24';

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

export const xpToday = 145;
export const balanceSentence =
  'Werk nam 68 procent van je XP in twee weken, Gezondheid 4 procent.';
export const streak = 6;
export const seasonLabel = 'S02 · W07';

/* ------------------------------------------------------------- beheer -- */

export const archivedTask: Task = {
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  skillId: skills[0].id,
  title: 'Oude gewoonte',
  kind: 'check',
  value: 10,
  onToday: false,
  archived: true,
};

export const allTasks: Task[] = [...tasks, archivedTask];

export const goals: Goal[] = [
  {
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    skillId: skills[1].id,
    title: 'Drie vaste klanten',
    targetDate: '2026-12-31',
    progress: 40,
    done: false,
  },
  {
    id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    skillId: skills[3].id,
    title: 'Tien kilometer aan een stuk',
    targetDate: null,
    progress: 100,
    done: true,
  },
];

/* ----------------------------------------------------------- historie -- */

/* A ledger with enough shape to show a real trajectory: steady work, a burst,
   and one skill that fell quiet and rusted. */
function ledger(): LogEntry[] {
  const entries: LogEntry[] = [];
  let n = 0;

  const push = (skillId: string, xp: number, daysAgo: number, source: LogEntry['source'], title: string, note: string | null = null) => {
    n += 1;
    const day = addDays(TODAY, -daysAgo);
    entries.push({
      id: `fix-${n}`,
      skillId,
      taskId: null,
      title,
      xp,
      minutes: source === 'timer' ? 30 : null,
      note,
      source,
      createdAt: `${day}T10:0${n % 6}:00.000Z`,
    });
  };

  for (let d = 84; d >= 0; d -= 1) {
    if (d % 2 === 0) push(skills[0].id, 32, d, 'manual', 'Offerte afmaken');
    if (d % 3 === 0) push(skills[1].id, 66, d, 'timer', 'Diep werkblok');
    if (d % 5 === 0) push(skills[2].id, 25, d, 'quick', 'Avond zonder telefoon');
    if (d > 12 && d % 4 === 0) push(skills[3].id, 24, d, 'timer', 'Wandelen');
  }

  push(skills[0].id, 45, 1, 'manual', 'Kwartaalrapport', 'Later dan gepland, maar af.');
  push(skills[3].id, -580, 0, 'rust', 'Gezondheid roestte een niveau');

  return entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

const entries = ledger();
const from = addDays(TODAY, -(WINDOW_DAYS - 1));

export const historie = {
  trajectories: levelTrajectory(skills, entries, from, TODAY),
  days: groupByDay(entries).slice(0, 4),
  skillNames: new Map(skills.map((s) => [s.id, s.name])),
  seasons: [
    {
      id: 's1',
      user_id: 'fixture',
      name: 'S01',
      starts_on: '2026-03-02',
      ends_on: '2026-05-24',
      badge_slug: 'eerste-omloop',
      summary: null,
    },
  ],
};

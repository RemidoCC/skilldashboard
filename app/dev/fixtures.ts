import { DEFAULT_RANGE, groupByDay, levelTrajectory, WINDOW_DAYS } from '@/lib/domain/trajectory';
import { addDays, dayKey, weekStart } from '@/lib/domain/dates';
import type { LogEntry, Skill, Task } from '@/lib/domain/types';
import type { Goal } from '@/lib/offline/mutations';

/**
 * Fixture state for the visual preview. Chosen to exercise the states that are
 * easy to get wrong: a two-digit display, a skill mid-level, a skill sitting on
 * an earned floor, and one that has started rusting.
 */
/**
 * Anchored to the real clock, not to a fixed date.
 *
 * A pinned date quietly rots: everything derived from it keeps working until
 * midnight, when "today" moves on and the preview starts describing
 * yesterday — which is exactly how a queued completion stopped counting
 * towards the day's total in the offline check.
 */
export const TODAY = dayKey(new Date());

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

/** Not on today, so the preview exercises picking one. */
export const spareTask: Task = {
  id: 'eeee1111-eeee-4eee-8eee-eeeeeeee1111',
  skillId: skills[2].id,
  title: 'Voorlezen',
  kind: 'check',
  value: 15,
  onToday: false,
  archived: false,
};

export const allTasks: Task[] = [...tasks, spareTask, archivedTask];

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
  range: DEFAULT_RANGE,
  from,
  to: TODAY,
  seasons: [
    // One season with a summary and one without, so the preview shows both the
    // panel and what a season from before phase four falls back to.
    {
      id: 's1',
      user_id: 'fixture',
      name: 'S02',
      starts_on: '2026-06-01',
      ends_on: '2026-08-23',
      badge_slug: 's02-hersteld',
      summary: {
        theme: 'hersteld',
        totalXp: 8420,
        levelsGained: 11,
        questsCompleted: 9,
        longestStreak: 23,
        perSkill: [
          { skillId: skills[0].id, name: skills[0].name, xp: 3120, levelsGained: 4 },
          { skillId: skills[1].id, name: skills[1].name, xp: 2980, levelsGained: 4 },
          { skillId: skills[2].id, name: skills[2].name, xp: 1740, levelsGained: 2 },
          { skillId: skills[3].id, name: skills[3].name, xp: 580, levelsGained: 1 },
        ],
      },
    },
    {
      id: 's2',
      user_id: 'fixture',
      name: 'S01',
      starts_on: '2026-03-02',
      ends_on: '2026-05-24',
      badge_slug: 'eerste-omloop',
      summary: null,
    },
  ],
};

/* --------------------------------------------------------------- fase 4 -- */

export const quests = [
  {
    id: 'q1',
    skillId: skills[3].id,
    title: '3 keer Gezondheid',
    target: 3,
    progress: 1,
    bonusXp: 60,
    completed: false,
  },
  {
    id: 'q2',
    skillId: skills[1].id,
    title: '4 keer Remido',
    target: 4,
    progress: 4,
    bonusXp: 80,
    completed: true,
  },
  {
    id: 'q3',
    skillId: skills[2].id,
    title: '2 keer Gezin',
    target: 2,
    progress: 0,
    bonusXp: 40,
    completed: false,
  },
];

export const openGoals = goals
  .filter((g) => !g.done)
  .map((g) => ({ id: g.id, skillId: g.skillId, title: g.title, progress: g.progress }));

export const nextWeekStart = addDays(weekStart(TODAY), 7);

export const questCandidates = [
  { skillId: skills[3].id, title: '3 keer Gezondheid', target: 3, bonusXp: 60, weekStart: nextWeekStart },
  { skillId: skills[1].id, title: '4 keer Remido', target: 4, bonusXp: 80, weekStart: nextWeekStart },
  { skillId: skills[2].id, title: '2 keer Gezin', target: 2, bonusXp: 40, weekStart: nextWeekStart },
  { skillId: skills[0].id, title: '5 keer Werk', target: 5, bonusXp: 100, weekStart: nextWeekStart },
];

const REPORT_WEEK = weekStart(TODAY);

export const weekReport = {
  weekStart: REPORT_WEEK,
  weekEnd: addDays(REPORT_WEEK, 6),
  skills: [
    { skillId: skills[0].id, name: 'Werk', color: skills[0].color, xp: 420, previousXp: 300, levelsGained: 1 },
    { skillId: skills[1].id, name: 'Remido', color: skills[1].color, xp: 264, previousXp: 330, levelsGained: 0 },
    { skillId: skills[2].id, name: 'Gezin', color: skills[2].color, xp: 75, previousXp: 75, levelsGained: 0 },
    { skillId: skills[3].id, name: 'Gezondheid', color: skills[3].color, xp: 24, previousXp: 96, levelsGained: 0 },
  ],
  totalXp: 783,
  previousTotalXp: 801,
  levelled: [{ name: 'Werk', from: 6, to: 7 }],
  rust: [
    {
      skillId: skills[3].id,
      name: 'Gezondheid',
      status: 'rusting' as const,
      daysInactive: 12,
      daysUntilRust: 0,
      rusted: true,
    },
  ],
  balanceSentence: 'Werk nam 68 procent van je XP in twee weken, Gezondheid 4 procent.',
  proposedQuests: questCandidates.slice(0, 3),
};

export const frozenDays = [addDays(TODAY, -3)];
export const heldFreezes = 2;

/* --------------------------------------------------------------- fase 5 -- */

export const mappingRules = [
  { id: 'mr1', source: 'calendar' as const, pattern: 'standup', skillId: skills[0].id, xp: 20 },
  { id: 'mr2', source: 'calendar' as const, pattern: 'klant', skillId: skills[1].id, xp: 25 },
  { id: 'mr3', source: 'mail' as const, pattern: 'offerte', skillId: skills[1].id, xp: 15 },
];

export const inbox = [
  {
    id: 'ib1',
    source: 'calendar' as const,
    title: 'Standup · 30 min',
    skillId: skills[0].id,
    xp: 60,
    occurredAt: `${TODAY}T09:30:00.000Z`,
  },
  {
    id: 'ib2',
    source: 'mail' as const,
    title: '4 verstuurde mails · offerte',
    skillId: skills[1].id,
    xp: 15,
    occurredAt: `${TODAY}T16:10:00.000Z`,
  },
];

import { addDays, dayKey, weekStart } from './dates';
import { rustState, type RustStatus } from './rust';
import type { Capacity, LogEntry, Skill } from './types';
import type { ProposedQuest } from './quests';

/**
 * The Sunday report.
 *
 * It states what the week did and stops. No score, no encouragement, and
 * nothing that reads as a verdict on the person rather than the week.
 */
export interface SkillWeek {
  skillId: string;
  name: string;
  color: string;
  xp: number;
  /** Same skill, the week before. */
  previousXp: number;
  levelsGained: number;
}

export interface RustNote {
  skillId: string;
  name: string;
  status: RustStatus;
  daysInactive: number;
  daysUntilRust: number;
  /** True when the skill actually lost a level this week. */
  rusted: boolean;
}

export interface WeekReport {
  weekStart: string;
  weekEnd: string;
  skills: SkillWeek[];
  totalXp: number;
  previousTotalXp: number;
  levelled: { name: string; from: number; to: number }[];
  rust: RustNote[];
  balanceSentence: string | null;
  proposedQuests: ProposedQuest[];
}

function sumXp(entries: readonly LogEntry[], skillId: string, from: string, to: string): number {
  return entries
    .filter((e) => {
      const day = dayKey(e.createdAt);
      return e.skillId === skillId && day >= from && day <= to;
    })
    .reduce((sum, e) => sum + e.xp, 0);
}

/**
 * Levels gained inside a window, counted from the ledger rather than from the
 * current level — a skill that gained two and rusted one still gained two.
 */
function levelsGainedIn(
  skillId: string,
  from: string,
  to: string,
  levelAt: (skillId: string, day: string) => number,
): number {
  const before = levelAt(skillId, addDays(from, -1));
  const after = levelAt(skillId, to);
  return Math.max(after - before, 0);
}

export interface ReportInput {
  skills: readonly Skill[];
  entries: readonly LogEntry[];
  /** Level of a skill at the end of a given day, from the trajectory. */
  levelAt: (skillId: string, day: string) => number;
  capacity: Capacity;
  balanceSentence: string | null;
  proposedQuests: ProposedQuest[];
  today: string;
}

export function buildWeekReport(input: ReportInput): WeekReport {
  const from = weekStart(input.today);
  const to = addDays(from, 6);
  const previousFrom = addDays(from, -7);
  const previousTo = addDays(from, -1);

  const active = input.skills.filter((s) => s.active);

  const skills: SkillWeek[] = active.map((skill) => ({
    skillId: skill.id,
    name: skill.name,
    color: skill.color,
    xp: sumXp(input.entries, skill.id, from, to),
    previousXp: sumXp(input.entries, skill.id, previousFrom, previousTo),
    levelsGained: levelsGainedIn(skill.id, from, to, input.levelAt),
  }));

  const levelled = active
    .map((skill) => ({
      name: skill.name,
      from: input.levelAt(skill.id, addDays(from, -1)),
      to: input.levelAt(skill.id, to),
    }))
    .filter((row) => row.to > row.from);

  // A rust entry in the ledger this week is the only proof a level was lost.
  const rustedThisWeek = new Set(
    input.entries
      .filter((e) => {
        const day = dayKey(e.createdAt);
        return e.source === 'rust' && day >= from && day <= to;
      })
      .map((e) => e.skillId),
  );

  const rust: RustNote[] = active
    .map((skill) => {
      const state = rustState(
        skill.lastActiveAt ? dayKey(skill.lastActiveAt) : null,
        input.today,
        input.capacity,
      );
      return {
        skillId: skill.id,
        name: skill.name,
        status: state.status,
        daysInactive: state.daysInactive,
        daysUntilRust: state.daysUntilRust,
        rusted: rustedThisWeek.has(skill.id),
      };
    })
    // Only what is worth reporting: it rusted, or it is close.
    .filter((note) => note.rusted || note.status !== 'ok')
    .sort((a, b) => a.daysUntilRust - b.daysUntilRust);

  return {
    weekStart: from,
    weekEnd: to,
    skills,
    totalXp: skills.reduce((sum, s) => sum + s.xp, 0),
    previousTotalXp: skills.reduce((sum, s) => sum + s.previousXp, 0),
    levelled,
    rust,
    balanceSentence: input.balanceSentence,
    proposedQuests: input.proposedQuests,
  };
}

/** One plain line comparing the week to the one before it. */
export function weekComparison(report: WeekReport): string {
  const { totalXp, previousTotalXp } = report;
  if (previousTotalXp === 0 && totalXp === 0) return 'Deze week en vorige week beide niets.';
  if (previousTotalXp === 0) return `${totalXp} XP deze week, vorige week niets.`;

  const difference = totalXp - previousTotalXp;
  if (difference === 0) return `${totalXp} XP, precies evenveel als vorige week.`;

  const percent = Math.abs(Math.round((difference / previousTotalXp) * 100));
  return difference > 0
    ? `${totalXp} XP deze week, ${percent} procent meer dan vorige week.`
    : `${totalXp} XP deze week, ${percent} procent minder dan vorige week.`;
}

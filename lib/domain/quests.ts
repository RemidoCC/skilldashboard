import { daysBetween, weekStart } from './dates';
import type { Capacity, Skill } from './types';

/**
 * Weekly quests. Exactly three, every Monday.
 *
 * The bias is the whole design: a quest should land on a skill you said you
 * care about, or one that has gone quiet — not on whatever you were already
 * doing anyway. A quest you would have completed regardless measures nothing.
 */
export const QUESTS_PER_WEEK = 3;

/** How the week's capacity scales a target. Normaal is the full size. */
export const CAPACITY_FACTOR: Record<Capacity, number> = {
  rustig: 0.5,
  normaal: 1,
  gek: 0.75,
};

/** A target is never trivial and never a fantasy. */
export const MIN_TARGET = 2;
export const MAX_TARGET = 6;

/** XP per unit of target, and the range a bonus can land in. */
const BONUS_PER_TARGET = 20;
const MIN_BONUS = 40;
const MAX_BONUS = 120;

export interface QuestCandidate {
  skill: Skill;
  /** Completions per week over the recent past, used to size the target. */
  weeklyAverage: number;
  /** Days since the skill was last used. Higher is quieter. */
  daysQuiet: number;
  hasActiveGoal: boolean;
}

export interface ProposedQuest {
  skillId: string;
  title: string;
  target: number;
  bonusXp: number;
  weekStart: string;
}

/**
 * A skill's pull on the week's quests.
 *
 * A tied goal outweighs everything else — that is what "biased toward skills
 * tied to active goals" has to mean if it is to change the outcome. Quietness
 * then orders the rest, and is capped so a skill abandoned a year ago does not
 * outrank one quiet for a month.
 */
export function questScore(candidate: QuestCandidate): number {
  const goalPull = candidate.hasActiveGoal ? 100 : 0;
  const quietPull = Math.min(Math.max(candidate.daysQuiet, 0), 30) * 3;
  return goalPull + quietPull;
}

/**
 * How many completions the week asks for.
 *
 *   target = ceil(base * capacity factor), clamped to 2..6
 *
 * The base is one more than the skill's recent weekly average, so a quest is a
 * step up from the habit rather than a number picked out of the air.
 */
export function questTarget(weeklyAverage: number, capacity: Capacity): number {
  const base = Math.round(Math.max(weeklyAverage, 0)) + 1;
  const clamped = Math.min(Math.max(base, MIN_TARGET), MAX_TARGET);
  const scaled = Math.ceil(clamped * CAPACITY_FACTOR[capacity]);
  return Math.min(Math.max(scaled, MIN_TARGET), MAX_TARGET);
}

export function questBonus(target: number): number {
  return Math.min(Math.max(target * BONUS_PER_TARGET, MIN_BONUS), MAX_BONUS);
}

function questTitle(skill: Skill, target: number): string {
  return target === 1 ? `Eén keer ${skill.name}` : `${target} keer ${skill.name}`;
}

/**
 * The three quests for a week.
 *
 * Deterministic: the same input always produces the same three, so a job that
 * runs twice cannot produce a different week. Ties break on sort order.
 */
export function generateQuests(
  candidates: readonly QuestCandidate[],
  capacity: Capacity,
  week: string,
  /** How many to return. The Sunday report ranks every skill so a swap has
   *  somewhere to go; the weekly job takes the default three. */
  limit: number = QUESTS_PER_WEEK,
): ProposedQuest[] {
  const ranked = [...candidates]
    .filter((c) => c.skill.active)
    .sort((a, b) => {
      const byScore = questScore(b) - questScore(a);
      if (byScore !== 0) return byScore;
      return a.skill.sortOrder - b.skill.sortOrder;
    })
    .slice(0, Math.max(limit, 0));

  return ranked.map((candidate) => {
    const target = questTarget(candidate.weeklyAverage, capacity);
    return {
      skillId: candidate.skill.id,
      title: questTitle(candidate.skill, target),
      target,
      bonusXp: questBonus(target),
      weekStart: week,
    };
  });
}

/**
 * Builds the candidates from raw history.
 *
 * `weeks` decides how far back the average looks; four is long enough to
 * survive one odd week and short enough to follow a change of habit.
 */
export function buildCandidates(
  skills: readonly Skill[],
  completionDaysBySkill: ReadonlyMap<string, string[]>,
  activeGoalSkillIds: ReadonlySet<string>,
  today: string,
  weeks = 4,
): QuestCandidate[] {
  const since = weekStart(today);

  return skills.map((skill) => {
    const days = completionDaysBySkill.get(skill.id) ?? [];
    const recent = days.filter((day) => daysBetween(day, since) <= weeks * 7 && day <= today);
    const lastDay = days.length > 0 ? days.reduce((a, b) => (a > b ? a : b)) : null;

    return {
      skill,
      weeklyAverage: recent.length / weeks,
      daysQuiet: lastDay === null ? 999 : Math.max(daysBetween(lastDay, today), 0),
      hasActiveGoal: activeGoalSkillIds.has(skill.id),
    };
  });
}

/** A quest is done once its progress reaches its target. */
export function isQuestComplete(quest: { target: number; progress: number }): boolean {
  return quest.progress >= quest.target;
}

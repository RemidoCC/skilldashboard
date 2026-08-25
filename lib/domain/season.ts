import { addDays, daysBetween, weekStart } from './dates';
import type { Skill } from './types';

/** A season is twelve weeks, always starting on a Monday. */
export const SEASON_WEEKS = 12;

export interface SeasonRow {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  badgeSlug: string;
}

/** Season one starts on the Monday of the week the account first logs anything. */
export function seasonStartFor(day: string): string {
  return weekStart(day);
}

export function seasonEnd(startsOn: string): string {
  // Twelve whole weeks, so the last day is the Sunday of week twelve.
  return addDays(startsOn, SEASON_WEEKS * 7 - 1);
}

export function seasonName(number: number): string {
  return `S${String(number).padStart(2, '0')}`;
}

/** Week within the season, 1 to 12. Clamped, so a stale season still reads. */
export function seasonWeek(startsOn: string, today: string): number {
  const elapsed = Math.floor(daysBetween(startsOn, today) / 7);
  return Math.min(Math.max(elapsed + 1, 1), SEASON_WEEKS);
}

/** e.g. S02 · W07 */
export function seasonLabel(name: string, startsOn: string, today: string): string {
  return `${name} · W${String(seasonWeek(startsOn, today)).padStart(2, '0')}`;
}

export function hasEnded(season: { endsOn: string }, today: string): boolean {
  return today > season.endsOn;
}

/** The season that follows, starting the day after the last one ended. */
export function nextSeason(previous: { name: string; endsOn: string }): {
  name: string;
  startsOn: string;
  endsOn: string;
} {
  const number = Number(previous.name.replace(/\D/g, '')) + 1;
  const startsOn = addDays(previous.endsOn, 1);
  return { name: seasonName(number), startsOn, endsOn: seasonEnd(startsOn) };
}

/* ------------------------------------------------------------- the badge -- */

export type BadgeTheme = 'evenwichtig' | 'toegespitst' | 'hersteld' | 'gestaag';

export interface SeasonTally {
  skillId: string;
  name: string;
  xp: number;
  levelsGained: number;
  /** True when the skill spent part of the season rusting and still ended up. */
  recovered: boolean;
}

/**
 * What the season was, in one word.
 *
 * Deterministic and derived only from what happened, so the badge reports a
 * season rather than flattering it. The order matters: recovery is the rarest
 * and most worth naming, a lopsided season is worth naming honestly, and
 * balance is worth naming when it was actually achieved.
 */
export function badgeTheme(tallies: readonly SeasonTally[]): BadgeTheme {
  const total = tallies.reduce((sum, t) => sum + Math.max(t.xp, 0), 0);
  if (total === 0) return 'gestaag';

  if (tallies.some((t) => t.recovered)) return 'hersteld';

  const shares = tallies.map((t) => Math.max(t.xp, 0) / total);
  const highest = Math.max(...shares);

  if (highest > 0.55) return 'toegespitst';
  if (highest < 0.4) return 'evenwichtig';
  return 'gestaag';
}

export function badgeSlug(name: string, theme: BadgeTheme): string {
  return `${name.toLowerCase()}-${theme}`;
}

export interface SeasonSummary {
  theme: BadgeTheme;
  totalXp: number;
  levelsGained: number;
  perSkill: { skillId: string; name: string; xp: number; levelsGained: number }[];
  questsCompleted: number;
  longestStreak: number;
}

/** The record kept in seasons.summary. Facts only, no commentary. */
export function seasonSummary(
  tallies: readonly SeasonTally[],
  questsCompleted: number,
  longestStreak: number,
): SeasonSummary {
  return {
    theme: badgeTheme(tallies),
    totalXp: tallies.reduce((sum, t) => sum + t.xp, 0),
    levelsGained: tallies.reduce((sum, t) => sum + t.levelsGained, 0),
    perSkill: tallies.map((t) => ({
      skillId: t.skillId,
      name: t.name,
      xp: t.xp,
      levelsGained: t.levelsGained,
    })),
    questsCompleted,
    longestStreak,
  };
}

/**
 * Reading a stored summary back.
 *
 * seasons.summary is jsonb, so what comes out of the database is whatever went
 * in — including from an export someone edited. Every field is checked and a
 * missing one falls back rather than throwing, because a summary that will not
 * parse should cost you the panel, not the screen.
 */
export function parseSeasonSummary(value: unknown): SeasonSummary | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;

  const themes: BadgeTheme[] = ['evenwichtig', 'toegespitst', 'hersteld', 'gestaag'];
  const theme = themes.find((t) => t === raw.theme);
  if (!theme) return null;

  const whole = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

  const perSkill = Array.isArray(raw.perSkill)
    ? raw.perSkill
        .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
        .map((entry) => ({
          skillId: typeof entry.skillId === 'string' ? entry.skillId : '',
          name: typeof entry.name === 'string' ? entry.name : 'Onbekend',
          xp: whole(entry.xp),
          levelsGained: whole(entry.levelsGained),
        }))
    : [];

  return {
    theme,
    totalXp: whole(raw.totalXp),
    levelsGained: whole(raw.levelsGained),
    perSkill,
    questsCompleted: whole(raw.questsCompleted),
    longestStreak: whole(raw.longestStreak),
  };
}

/** What the badge word means, said plainly rather than left to be guessed. */
export const THEME_NOTES: Record<BadgeTheme, string> = {
  evenwichtig: 'geen vaardigheid nam meer dan vier tiende van het seizoen',
  toegespitst: 'meer dan de helft ging naar één vaardigheid',
  hersteld: 'een vaardigheid roestte en kwam er weer bovenop',
  gestaag: 'verdeeld, zonder uitschieter',
};

/** Skills that were active at the end of the season, for the tally. */
export function tallySkills(skills: readonly Skill[]): Skill[] {
  return skills.filter((s) => s.active);
}

import { applyXp, START } from './curve';
import { addDays, dayKey, daysBetween } from './dates';
import type { LogEntry, Progress, Skill } from './types';

/** What Historie looks at unless you say otherwise: one season's worth. */
export const WINDOW_DAYS = 90;

export type HistoryRange = '30' | '90' | '365' | 'alles';

/**
 * How far back Historie may look.
 *
 * Ninety days is a season, which is the unit this app thinks in, but a season
 * that has just ended falls off the front of it — the one moment you most want
 * to look back. So the window opens.
 */
export const HISTORY_RANGES: readonly { value: HistoryRange; label: string; days: number | null }[] =
  [
    { value: '30', label: '30 dagen', days: 30 },
    { value: '90', label: '90 dagen', days: WINDOW_DAYS },
    { value: '365', label: 'Een jaar', days: 365 },
    { value: 'alles', label: 'Alles', days: null },
  ];

export const DEFAULT_RANGE: HistoryRange = '90';

/** Anything else in the query string reads as the default rather than an error. */
export function toHistoryRange(raw: unknown): HistoryRange {
  return HISTORY_RANGES.some((r) => r.value === raw) ? (raw as HistoryRange) : DEFAULT_RANGE;
}

export function rangeLabelFor(range: HistoryRange): string {
  return HISTORY_RANGES.find((r) => r.value === range)?.label ?? '';
}

/**
 * The first day of the window.
 *
 * "Alles" reaches back to the first thing ever logged, but never shows less
 * than a month: a line drawn across four days is a line you cannot read, and
 * the empty days in front of it are the truth about the account anyway.
 */
export function windowStart(range: HistoryRange, today: string, earliest: string | null): string {
  const days = HISTORY_RANGES.find((r) => r.value === range)?.days ?? null;
  if (days !== null) return addDays(today, -(days - 1));

  const floor = addDays(today, -29);
  if (!earliest) return floor;
  return earliest < floor ? earliest : floor;
}

export interface TrajectoryPoint {
  day: string;
  level: number;
  /** Cumulative XP at the end of that day, for the shape of the line. */
  xpInLevel: number;
}

export interface SkillTrajectory {
  skillId: string;
  name: string;
  color: string;
  points: TrajectoryPoint[];
  /** Level at the start and the end of the window. */
  from: number;
  to: number;
  /** Highest level reached inside the window. */
  peak: number;
}

/**
 * Level per skill over a window of days, rebuilt from the ledger.
 *
 * The whole ledger is replayed, not just the window: a skill's level on day
 * one of the window depends on everything before it. Entries before the window
 * set the starting point; only the window is returned.
 *
 * One point per day, so every skill's series lines up and the small multiples
 * can share an axis.
 */
export function levelTrajectory(
  skills: readonly Skill[],
  entries: readonly LogEntry[],
  from: string,
  to: string,
): SkillTrajectory[] {
  const span = daysBetween(from, to);
  if (span < 0) return [];

  const days: string[] = [];
  for (let i = 0; i <= span; i += 1) days.push(addDays(from, i));

  const bySkill = new Map<string, LogEntry[]>();
  for (const entry of entries) {
    const list = bySkill.get(entry.skillId);
    if (list) list.push(entry);
    else bySkill.set(entry.skillId, [entry]);
  }

  return skills.map((skill) => {
    const own = (bySkill.get(skill.id) ?? [])
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    let state: Progress = START;
    let index = 0;

    // Everything before the window decides where the line starts.
    while (index < own.length && dayKey(own[index].createdAt) < from) {
      const next = applyXp(state, own[index].xp);
      state = { level: next.level, xp: next.xp, floorLevel: next.floorLevel };
      index += 1;
    }

    const startLevel = state.level;
    const points: TrajectoryPoint[] = [];

    for (const day of days) {
      while (index < own.length && dayKey(own[index].createdAt) <= day) {
        const next = applyXp(state, own[index].xp);
        state = { level: next.level, xp: next.xp, floorLevel: next.floorLevel };
        index += 1;
      }
      points.push({ day, level: state.level, xpInLevel: state.xp });
    }

    return {
      skillId: skill.id,
      name: skill.name,
      color: skill.color,
      points,
      from: startLevel,
      to: state.level,
      peak: points.reduce((high, p) => Math.max(high, p.level), startLevel),
    };
  });
}

/**
 * Whether a skill fell back inside the window and climbed out again.
 *
 * This is what the season badge `hersteld` is supposed to mean, and it needs a
 * dip to be true. The first cut asked `peak > from && to >= peak`, which is
 * satisfied by any skill that simply went up and stayed there — so every
 * season with a single level gained in it read as a comeback, and the honest
 * words for a lopsided or a balanced season became unreachable.
 *
 * A dip means a day whose level is below the highest the skill had already
 * reached in the window. Climbing out means ending at or above that high
 * point. Since a level only ever falls through a rust entry or a reverted one,
 * this cannot be true of a skill that only ever gained.
 */
export function recoveredWithin(line: {
  from: number;
  points: readonly TrajectoryPoint[];
}): boolean {
  if (line.points.length === 0) return false;

  let peak = line.from;
  let dipped = false;

  for (const point of line.points) {
    if (point.level < peak) dipped = true;
    if (point.level > peak) peak = point.level;
  }

  const last = line.points[line.points.length - 1].level;
  return dipped && last >= peak;
}

export interface LogDay {
  day: string;
  entries: LogEntry[];
  xp: number;
}

/** Log entries grouped by day, newest day first. */
export function groupByDay(entries: readonly LogEntry[]): LogDay[] {
  const days = new Map<string, LogEntry[]>();
  for (const entry of entries) {
    const key = dayKey(entry.createdAt);
    const list = days.get(key);
    if (list) list.push(entry);
    else days.set(key, [entry]);
  }

  return [...days.entries()]
    .map(([day, list]) => ({
      day,
      entries: list.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      xp: list.reduce((sum, e) => sum + e.xp, 0),
    }))
    .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
}

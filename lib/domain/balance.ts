import { addDays, dayKey } from './dates';
import type { LogEntry, Skill } from './types';

/** Trailing window the balance signal looks at. */
export const BALANCE_WINDOW_DAYS = 14;

/** A skill is "dominant" above this share of the window's XP. */
export const DOMINANT_SHARE = 0.55;
/** A skill is "quiet" below this share. */
export const QUIET_SHARE = 0.1;

export interface BalanceShare {
  skillId: string;
  name: string;
  xp: number;
  share: number;
}

export interface BalanceSignal {
  shares: BalanceShare[];
  dominant: BalanceShare | null;
  quiet: BalanceShare | null;
  /** One plain sentence, or null when nothing is out of balance. */
  sentence: string | null;
}

/**
 * Share of XP per active skill over the trailing window. Flags the case where
 * one skill takes more than 55% while another active skill sits under 10%.
 *
 * The sentence states the two numbers and stops. It does not advise.
 */
export function balanceSignal(
  skills: readonly Skill[],
  entries: readonly LogEntry[],
  today: string,
): BalanceSignal {
  const active = skills.filter((s) => s.active);
  const since = addDays(today, -(BALANCE_WINDOW_DAYS - 1));

  const xpBySkill = new Map<string, number>(active.map((s) => [s.id, 0]));
  for (const entry of entries) {
    const day = dayKey(entry.createdAt);
    if (day < since || day > today) continue;
    const current = xpBySkill.get(entry.skillId);
    if (current === undefined) continue; // inactive skill, ignored
    xpBySkill.set(entry.skillId, current + Math.max(entry.xp, 0));
  }

  const total = [...xpBySkill.values()].reduce((a, b) => a + b, 0);
  const shares: BalanceShare[] = active.map((s) => {
    const xp = xpBySkill.get(s.id) ?? 0;
    return { skillId: s.id, name: s.name, xp, share: total === 0 ? 0 : xp / total };
  });

  const empty = { shares, dominant: null, quiet: null, sentence: null };
  // Nothing logged, or only one skill in play: no meaningful balance to report.
  if (total === 0 || active.length < 2) return empty;

  const ranked = [...shares].sort((a, b) => b.share - a.share);
  const dominant = ranked[0];
  const quiet = ranked[ranked.length - 1];

  if (dominant.share <= DOMINANT_SHARE || quiet.share >= QUIET_SHARE) return empty;

  const pct = (n: number) => Math.round(n * 100);
  const sentence =
    `${dominant.name} nam ${pct(dominant.share)} procent van je XP in twee weken, ` +
    `${quiet.name} ${pct(quiet.share)} procent.`;

  return { shares, dominant, quiet, sentence };
}

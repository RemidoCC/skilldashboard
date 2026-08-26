import type { RustStatus } from './rust';

/** Small numbers read better spelled out: "negen dagen stil".
 *
 *  One carries its accents. Every use here is the numeral — "één van drie
 *  opdrachten af", "roest over één dag" — and without them the word is the
 *  indefinite article, which turns a count into a vague gesture at one of
 *  them.
 *
 *  Runs to thirty because the longest grace period is twenty-one days: at
 *  twenty the list used to stop and the rust line switched to digits, so a
 *  "gek" week read "roest over 21 dagen" under a setting that says
 *  "eenentwintig dagen voor roest". */
const WORDS = [
  'nul', 'één', 'twee', 'drie', 'vier', 'vijf', 'zes', 'zeven', 'acht', 'negen', 'tien',
  'elf', 'twaalf', 'dertien', 'veertien', 'vijftien', 'zestien', 'zeventien', 'achttien',
  'negentien', 'twintig', 'eenentwintig', 'tweeëntwintig', 'drieëntwintig',
  'vierentwintig', 'vijfentwintig', 'zesentwintig', 'zevenentwintig',
  'achtentwintig', 'negenentwintig', 'dertig',
];

export function dutchNumber(n: number): string {
  return WORDS[n] ?? String(n);
}

/**
 * Days inside a sentence: spelled out, because a sentence reads.
 *
 * Exported so every sentence in the app says it the same way. The Sunday
 * report used to write "roest over 3 dagen" while the display, two sections
 * up, wrote "roest over drie dagen" about the same skill on the same day.
 */
export function spelledDays(n: number): string {
  return n === 1 ? 'één dag' : `${dutchNumber(n)} dagen`;
}

/**
 * Days in a value slot: a numeral, because a value is read off.
 *
 * The display wrote "Reeks 6d" and the season panel "6 d" for the same kind of
 * measurement.
 */
export function dayCount(n: number): string {
  return n === 1 ? '1 dag' : `${n} dagen`;
}

export interface RustLineInput {
  name: string;
  daysInactive: number;
  daysUntilRust: number;
  status: RustStatus;
}

export interface StatusInput {
  xpToday: number;
  balanceSentence: string | null;
  quests: { total: number; completed: number } | null;
  /** The skill closest to rusting, if any skill has been used at all. */
  rust: RustLineInput | null;
}

/**
 * The lines the display rotates through, in order. Each one states a fact and
 * stops: no praise, no advice, no exclamation marks.
 *
 * Lines that have nothing to say are left out rather than padded, so the
 * rotation stays honest on a quiet day.
 */
export function statusLines(input: StatusInput): string[] {
  const lines: string[] = [];

  lines.push(
    input.xpToday > 0 ? `Vandaag ${input.xpToday} XP.` : 'Vandaag nog niets gelogd.',
  );

  if (input.balanceSentence) lines.push(input.balanceSentence);

  if (input.quests && input.quests.total > 0) {
    const { completed, total } = input.quests;
    lines.push(
      completed === total
        ? `Alle ${dutchNumber(total)} opdrachten staan af.`
        : `${dutchNumber(completed)} van ${dutchNumber(total)} opdrachten af.`,
    );
  }

  if (input.rust) {
    const { name, daysInactive, daysUntilRust, status } = input.rust;
    if (status === 'rusting') {
      lines.push(`${name} staat ${spelledDays(daysInactive)} stil.`);
    } else if (daysUntilRust === 0) {
      lines.push(`${name} roest vandaag.`);
    } else {
      lines.push(`${name} roest over ${spelledDays(daysUntilRust)}.`);
    }
  }

  return lines;
}

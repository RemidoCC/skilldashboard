import type { RustStatus } from './rust';

/** Small numbers read better spelled out: "negen dagen stil". */
const WORDS = [
  'nul', 'een', 'twee', 'drie', 'vier', 'vijf', 'zes', 'zeven', 'acht', 'negen', 'tien',
  'elf', 'twaalf', 'dertien', 'veertien', 'vijftien', 'zestien', 'zeventien', 'achttien',
  'negentien', 'twintig',
];

export function dutchNumber(n: number): string {
  return WORDS[n] ?? String(n);
}

function days(n: number): string {
  return n === 1 ? 'een dag' : `${dutchNumber(n)} dagen`;
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
      lines.push(`${name} staat ${days(daysInactive)} stil.`);
    } else if (daysUntilRust === 0) {
      lines.push(`${name} roest vandaag.`);
    } else {
      lines.push(`${name} roest over ${days(daysUntilRust)}.`);
    }
  }

  return lines;
}

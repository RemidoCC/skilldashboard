import { readableDay } from '@/lib/domain/dates';
import { dutchNumber } from '@/lib/domain/status';

/**
 * What the streak is standing on.
 *
 * A freeze that quietly saved a streak would be a lie of omission — the run
 * would read as unbroken effort. So a spent freeze is named, with the day it
 * covered.
 */
export function FreezeNote({ frozenDays, held }: { frozenDays: string[]; held: number }) {
  if (frozenDays.length === 0 && held === 0) return null;

  const recent = frozenDays[0];

  return (
    <p className="mt-3 text-[12px]" style={{ color: 'var(--muted)' }}>
      {recent ? (
        <>
          Op {readableDay(recent)} hield een freeze je reeks overeind
          {frozenDays.length > 1 ? `, en ${dutchNumber(frozenDays.length - 1)} keer eerder` : ''}.{' '}
        </>
      ) : null}
      {held === 0
        ? 'Je hebt er geen meer over.'
        : held === 1
          ? 'Je hebt er nog één.'
          : `Je hebt er nog ${dutchNumber(held)}.`}
    </p>
  );
}

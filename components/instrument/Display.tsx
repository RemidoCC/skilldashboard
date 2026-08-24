import { DotMatrix } from './DotMatrix';
import { StatusLine } from './StatusLine';
import { romanNumeral, type Tier } from '@/lib/domain/tier';

interface Props {
  tier: Tier;
  statusLines: string[];
  streakDays: number;
}

/**
 * The instrument screen: the total level as a dot matrix, the tier it falls
 * in, how far it is through that tier, and the rotating status line.
 */
export function Display({ tier, statusLines, streakDays }: Props) {
  return (
    <section className="screen px-4 pt-4 pb-3.5" aria-label="Instrument">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <span className="label" style={{ color: 'var(--screen-muted)' }}>
            Totaal niveau
          </span>
          <DotMatrix
            value={tier.totalLevel}
            cells={2}
            className="mt-2 h-14 w-auto"
          />
        </div>

        <div className="shrink-0 text-right">
          <span className="label" style={{ color: 'var(--screen-muted)' }}>
            {tier.label}
          </span>
          <p className="value mt-1.5 text-[13px]" style={{ color: 'var(--screen-ink)' }}>
            {tier.levelsToNext} tot {romanNumeral(tier.tier + 1)}
          </p>
          {streakDays > 0 ? (
            <p className="label mt-2" style={{ color: 'var(--screen-muted)' }}>
              Reeks {streakDays}d
            </p>
          ) : null}
        </div>
      </div>

      {/* Progress through the tier: a plain filled rule, no gradient. */}
      <div
        className="mt-3.5 h-1 w-full overflow-hidden rounded-full"
        style={{ background: 'rgba(255,255,255,.09)' }}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(tier.progress * 100)}
        aria-label={`Voortgang naar klasse ${tier.tier + 1}`}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${tier.progress * 100}%`, background: 'var(--signal)' }}
        />
      </div>

      <div className="mt-3">
        <StatusLine lines={statusLines} />
      </div>
    </section>
  );
}

import { Sparkline } from './Sparkline';
import { WINDOW_DAYS } from '@/lib/domain/trajectory';
import { readableDay } from '@/lib/domain/dates';
import type { LogDay, SkillTrajectory } from '@/lib/domain/trajectory';
import type { Tables } from '@/lib/db/database.types';

export interface HistorieViewData {
  trajectories: SkillTrajectory[];
  days: LogDay[];
  skillNames: Map<string, string>;
  seasons: Tables<'seasons'>[];
}

const SOURCE_LABELS: Record<string, string> = {
  manual: 'afgevinkt',
  timer: 'timer',
  quick: 'snel gelogd',
  calendar: 'agenda',
  mail: 'mail',
  quest: 'opdracht',
  rust: 'roest',
};

/**
 * What the window did to a level.
 *
 * A skill that climbed and then rusted back ends where it started, and
 * reporting a bare "1" would suggest nothing happened at all. The peak is
 * named in that case, because it was earned.
 */
function rangeLabel(trajectory: SkillTrajectory): string {
  if (trajectory.from !== trajectory.to) return `${trajectory.from} → ${trajectory.to}`;
  if (trajectory.peak > trajectory.to) return `${trajectory.to} · piek ${trajectory.peak}`;
  return String(trajectory.to);
}

/**
 * The Historie screen as pure markup, so the dev preview renders the real
 * thing rather than a copy that can drift.
 */
export function HistorieView({ data }: { data: HistorieViewData }) {
  return (
    <>
      {/* -------------------------------------------------------- verloop -- */}
      <section className="mt-5" aria-labelledby="verloop">
        <div className="flex items-baseline justify-between">
          <h2 id="verloop" className="label">
            Niveauverloop
          </h2>
          <span className="label">{WINDOW_DAYS} dagen</span>
        </div>

        {data.trajectories.length === 0 ? (
          <p className="mt-2 text-[13px]" style={{ color: 'var(--muted)' }}>
            Geen actieve vaardigheden. Zet er minstens één aan in Beheer.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {data.trajectories.map((trajectory) => (
              <li key={trajectory.skillId} className="raised px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="label">{trajectory.name}</span>
                  <span className="value text-[13px]">{rangeLabel(trajectory)}</span>
                </div>
                <div className="mt-1.5">
                  <Sparkline trajectory={trajectory} />
                </div>
                <span
                  aria-hidden
                  className="mt-1.5 block h-0.5 w-8 rounded-full"
                  style={{ background: trajectory.color }}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* -------------------------------------------------------- logboek -- */}
      <section className="mt-6" aria-labelledby="logboek">
        <h2 id="logboek" className="label">
          Logboek
        </h2>

        {data.days.length === 0 ? (
          <p className="mt-2 text-[13px]" style={{ color: 'var(--muted)' }}>
            Nog niets vastgelegd in deze periode. Wat je op Vandaag aftekent komt hier terecht.
          </p>
        ) : (
          <div className="mt-2 space-y-4">
            {data.days.map((day) => (
              <div key={day.day}>
                <div className="flex items-baseline justify-between">
                  <span className="label">{readableDay(day.day)}</span>
                  <span className="value text-[13px]">{day.xp} XP</span>
                </div>

                <ul className="mt-1.5 space-y-1.5">
                  {day.entries.map((entry) => (
                    <li key={entry.id} className="raised px-3 py-2">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="min-w-0 flex-1 truncate text-[13px]">{entry.title}</p>
                        <span
                          className="value shrink-0 text-[13px]"
                          style={{ color: entry.xp < 0 ? 'var(--signal-text)' : 'var(--ink)' }}
                        >
                          {entry.xp > 0 ? '+' : ''}
                          {entry.xp}
                        </span>
                      </div>
                      <span className="label mt-0.5 block">
                        {data.skillNames.get(entry.skillId) ?? 'Onbekend'} ·{' '}
                        {SOURCE_LABELS[entry.source] ?? entry.source}
                        {entry.minutes !== null ? ` · ${entry.minutes} min` : ''}
                      </span>
                      {entry.note ? (
                        <p className="mt-1.5 text-[13px]" style={{ color: 'var(--muted)' }}>
                          {entry.note}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ------------------------------------------------------ seizoenen -- */}
      <section className="mt-6" aria-labelledby="seizoenen">
        <h2 id="seizoenen" className="label">
          Seizoenen
        </h2>
        {data.seasons.length === 0 ? (
          <p className="mt-2 text-[13px]" style={{ color: 'var(--muted)' }}>
            Nog geen seizoen afgerond. Een seizoen duurt twaalf weken en levert een badge op die je
            houdt.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {data.seasons.map((season) => (
              <li
                key={season.id}
                className="raised flex items-baseline justify-between gap-3 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-[14px] leading-tight">{season.name}</p>
                  <span className="label mt-0.5 block">
                    {readableDay(season.starts_on, true)} tot {readableDay(season.ends_on, true)}
                  </span>
                </div>
                <span className="label shrink-0">{season.badge_slug}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

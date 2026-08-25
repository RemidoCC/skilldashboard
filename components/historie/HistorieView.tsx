import { Sparkline } from './Sparkline';
import { RevertButton } from './RevertButton';
import { HISTORY_RANGES } from '@/lib/domain/trajectory';
import { daysBetween, readableDay } from '@/lib/domain/dates';
import { parseSeasonSummary, THEME_NOTES } from '@/lib/domain/season';
import type { HistoryRange, LogDay, SkillTrajectory } from '@/lib/domain/trajectory';
import type { Tables } from '@/lib/db/database.types';

export interface HistorieViewData {
  trajectories: SkillTrajectory[];
  days: LogDay[];
  skillNames: Map<string, string>;
  seasons: Tables<'seasons'>[];
  range: HistoryRange;
  /** The window actually drawn, which "alles" decides from the ledger. */
  from: string;
  to: string;
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
 * How far back you are looking.
 *
 * Plain links rather than buttons: the window is in the URL, so it survives a
 * reload and a bookmark, and it works before any JavaScript has run.
 */
function RangePicker({ range }: { range: HistoryRange }) {
  return (
    <nav aria-label="Periode" className="mt-2 flex gap-1.5">
      {HISTORY_RANGES.map((option) => {
        const selected = option.value === range;
        return (
          <a
            key={option.value}
            href={`/historie?dagen=${option.value}`}
            aria-current={selected ? 'page' : undefined}
            className="raised flex h-11 flex-1 items-center justify-center px-2 text-[12px]"
            style={{
              background: selected ? 'var(--ink)' : undefined,
              color: selected ? 'var(--panel)' : 'var(--ink)',
            }}
          >
            {option.label}
          </a>
        );
      })}
    </nav>
  );
}

/**
 * The Historie screen as pure markup, so the dev preview renders the real
 * thing rather than a copy that can drift.
 */
export function HistorieView({ data }: { data: HistorieViewData }) {
  // "Alles" reaches as far as the ledger does, so the count is worth naming.
  const span = daysBetween(data.from, data.to) + 1;

  return (
    <>
      {/* -------------------------------------------------------- verloop -- */}
      <section className="mt-5" aria-labelledby="verloop">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h2 id="verloop" className="label">
            Niveauverloop
          </h2>
          {/* The picker already says how long; this says which days. */}
          <span className="label">
            {readableDay(data.from, true)} tot {readableDay(data.to, true)}
          </span>
        </div>

        <RangePicker range={data.range} />

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
            Niets vastgelegd in deze {span} dagen. Wat je op Vandaag aftekent komt hier terecht.
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
                      {/* Rust is the system's, and a quest bonus is a
                          consequence; neither is yours to take back. */}
                      {entry.source === 'rust' || entry.source === 'quest' ? null : (
                        <div className="mt-1.5">
                          <RevertButton entryId={entry.id} title={entry.title} />
                        </div>
                      )}
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
              <Season key={season.id} season={season} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/** A number that reads as a measurement rather than a score. */
function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="value block text-[15px] leading-none">{value}</span>
      <span className="label mt-1 block">{label}</span>
    </div>
  );
}

/**
 * A finished season, with what it consisted of.
 *
 * The summary has been written at the end of every season since phase four and
 * shown nowhere, which made the badge a word without a source. Facts only: no
 * "well done", no comparison to the season before.
 */
function Season({ season }: { season: Tables<'seasons'> }) {
  const summary = parseSeasonSummary(season.summary);

  return (
    <li className="raised px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] leading-tight">{season.name}</p>
          <span className="label mt-0.5 block">
            {readableDay(season.starts_on, true)} tot {readableDay(season.ends_on, true)}
          </span>
        </div>
        <span className="label shrink-0">{summary ? summary.theme : season.badge_slug}</span>
      </div>

      {summary ? (
        <>
          <p className="mt-1.5 text-[12px]" style={{ color: 'var(--muted)' }}>
            {THEME_NOTES[summary.theme]}
          </p>

          <div className="recess mt-2 grid grid-cols-2 gap-x-3 gap-y-2.5 px-3 py-2.5">
            <Figure label="XP" value={String(summary.totalXp)} />
            <Figure label="niveaus" value={`+${summary.levelsGained}`} />
            <Figure label="opdrachten" value={String(summary.questsCompleted)} />
            <Figure label="reeks" value={`${summary.longestStreak} d`} />
          </div>

          {summary.perSkill.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {summary.perSkill
                .slice()
                .sort((a, b) => b.xp - a.xp)
                .map((entry) => (
                  <li
                    key={entry.skillId || entry.name}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <span className="min-w-0 flex-1 truncate text-[13px]">{entry.name}</span>
                    <span className="label shrink-0">
                      {entry.xp} XP
                      {entry.levelsGained !== 0
                        ? ` · ${entry.levelsGained > 0 ? '+' : ''}${entry.levelsGained}`
                        : ''}
                    </span>
                  </li>
                ))}
            </ul>
          ) : null}
        </>
      ) : (
        // A season from before the summary was written keeps its badge, which
        // the header already shows. Nothing more is known about it.
        <span className="label mt-1.5 block" style={{ color: 'var(--muted)' }}>
          Van voor de seizoensbalans; alleen de badge is bewaard.
        </span>
      )}
    </li>
  );
}

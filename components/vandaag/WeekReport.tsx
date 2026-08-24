'use client';

import { useEffect, useMemo, useState } from 'react';
import { useOffline } from '@/components/offline/OfflineProvider';
import { weekComparison, type WeekReport as Report } from '@/lib/domain/report';
import { QUESTS_PER_WEEK, type ProposedQuest } from '@/lib/domain/quests';
import { readableDay } from '@/lib/domain/dates';

const DISMISS_PREFIX = 'skillunit.report.';

/**
 * The Sunday report.
 *
 * It reports the week and stops: what came in, what levelled, what is going
 * quiet, and what the coming week would ask. No score, and nothing that reads
 * as a verdict on the person rather than on the seven days.
 */
export function WeekReport({
  report,
  candidates,
  nextWeekStart,
  reportKey,
}: {
  report: Report;
  /** Every skill, ranked. Swapping walks down this list. */
  candidates: ProposedQuest[];
  nextWeekStart: string;
  reportKey: string;
}) {
  const { mutate } = useOffline();
  const [dismissed, setDismissed] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [chosen, setChosen] = useState<string[]>(() =>
    candidates.slice(0, QUESTS_PER_WEEK).map((q) => q.skillId),
  );

  // Read on mount so the server and the first client render agree.
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_PREFIX + reportKey) === 'done');
    } catch {
      setDismissed(false);
    }
  }, [reportKey]);

  const bySkill = useMemo(
    () => new Map(candidates.map((c) => [c.skillId, c])),
    [candidates],
  );
  const picked = chosen.map((id) => bySkill.get(id)).filter((q): q is ProposedQuest => Boolean(q));

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_PREFIX + reportKey, 'done');
    } catch {
      // Storage blocked; it will simply show again.
    }
  }

  /** Swaps one proposal for the next-best skill not already on the list. */
  function swap(index: number) {
    const next = candidates.find((c) => !chosen.includes(c.skillId));
    if (!next) return;
    setChosen((current) => current.map((id, i) => (i === index ? next.skillId : id)));
  }

  async function accept() {
    setAccepted(true);
    await mutate({
      kind: 'quest.accept',
      weekStart: nextWeekStart,
      quests: picked.map((q) => ({
        skillId: q.skillId,
        title: q.title,
        target: q.target,
        bonusXp: q.bonusXp,
      })),
    });
  }

  if (dismissed) return null;

  const somethingLeftToSwapTo = candidates.length > chosen.length;

  return (
    <section className="recess mt-3 p-3" aria-labelledby="weekbericht">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="weekbericht" className="label">
          {readableDay(report.weekStart)} tot {readableDay(report.weekEnd)}
        </h2>
        <button type="button" onClick={dismiss} className="label underline underline-offset-2">
          Sluiten
        </button>
      </div>

      <p className="mt-2 text-[13px]">{weekComparison(report)}</p>

      {/* ------------------------------------------------------ per skill -- */}
      <ul className="mt-3 space-y-1.5">
        {report.skills.map((skill) => {
          const difference = skill.xp - skill.previousXp;
          return (
            <li key={skill.skillId} className="raised flex items-baseline gap-3 px-3 py-2">
              <span
                aria-hidden
                className="h-2.5 w-0.5 shrink-0 rounded-full"
                style={{ background: skill.color }}
              />
              <span className="min-w-0 flex-1 truncate text-[13px]">{skill.name}</span>
              <span className="value shrink-0 text-[13px]">{skill.xp}</span>
              <span className="label shrink-0" style={{ minWidth: '3.5em', textAlign: 'right' }}>
                {difference === 0 ? 'gelijk' : `${difference > 0 ? '+' : ''}${difference}`}
              </span>
            </li>
          );
        })}
      </ul>

      {report.levelled.length > 0 ? (
        <p className="mt-3 text-[13px]">
          {report.levelled
            .map((row) => `${row.name} ging van ${row.from} naar ${row.to}`)
            .join('. ')}
          .
        </p>
      ) : null}

      {report.rust.length > 0 ? (
        <p className="mt-2 text-[13px]" style={{ color: 'var(--signal-text)' }}>
          {report.rust
            .map((note) =>
              note.rusted
                ? `${note.name} roestte een niveau`
                : `${note.name} roest over ${note.daysUntilRust} dagen`,
            )
            .join('. ')}
          .
        </p>
      ) : null}

      {report.balanceSentence ? (
        <p className="mt-2 text-[13px]" style={{ color: 'var(--muted)' }}>
          {report.balanceSentence}
        </p>
      ) : null}

      {/* --------------------------------------------------- de opdrachten -- */}
      <div className="mt-4">
        <span className="label">Voor de komende week</span>

        {picked.length === 0 ? (
          <p className="mt-1.5 text-[13px]" style={{ color: 'var(--muted)' }}>
            Geen actieve vaardigheden om opdrachten voor te zetten.
          </p>
        ) : (
          <ul className="mt-1.5 space-y-1.5">
            {picked.map((quest, index) => (
              <li key={quest.skillId} className="raised flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px]">{quest.title}</p>
                  <span className="label mt-0.5 block">bonus {quest.bonusXp} XP</span>
                </div>
                <button
                  type="button"
                  onClick={() => swap(index)}
                  disabled={accepted || !somethingLeftToSwapTo}
                  className="recess h-11 shrink-0 px-3 text-[12px]"
                >
                  Wissel
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex items-center justify-end gap-2">
          {accepted ? (
            <span className="label" role="status">
              Overgenomen
            </span>
          ) : (
            <button
              type="button"
              onClick={accept}
              disabled={picked.length === 0}
              className="raised h-11 px-5 text-[13px]"
              style={{ background: 'var(--signal-fill)', color: 'var(--on-signal)' }}
            >
              Neem over
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

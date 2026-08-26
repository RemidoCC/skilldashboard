'use client';

import { useEffect, useMemo, useState } from 'react';
import { useOffline } from '@/components/offline/OfflineProvider';
import { weekComparison, type WeekReport as Report } from '@/lib/domain/report';
import { QUESTS_PER_WEEK, type ProposedQuest } from '@/lib/domain/quests';
import { readableDay } from '@/lib/domain/dates';
import { spelledDays } from '@/lib/domain/status';
import { CAPACITIES } from '@/lib/domain/capacity';
import type { Capacity } from '@/lib/domain/types';

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
  nextCapacity,
}: {
  report: Report;
  /** Every skill, ranked. Swapping walks down this list. */
  candidates: ProposedQuest[];
  nextWeekStart: string;
  reportKey: string;
  /** What the coming week is already set to, if anything. */
  nextCapacity: Capacity;
}) {
  const { mutate } = useOffline();
  const [dismissed, setDismissed] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [chosen, setChosen] = useState<string[]>(() =>
    candidates.slice(0, QUESTS_PER_WEEK).map((q) => q.skillId),
  );
  const [capacity, setCapacity] = useState<Capacity>(nextCapacity);

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

  /**
   * The coming week's setting, chosen here because Sunday evening is when you
   * know what next week looks like. Written straight away rather than waiting
   * for "Neem over", so picking it is worth something even if you close the
   * report without accepting the quests.
   */
  async function chooseCapacity(next: Capacity) {
    setCapacity(next);
    await mutate({ kind: 'week.capacity', weekStart: nextWeekStart, capacity: next });
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
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        {/* Was the date range itself, so navigating by heading landed you on
            "24 augustus tot 30 augustus" with no idea what it headed. */}
        <h2 id="weekbericht" className="label">
          Weekbericht
        </h2>
        <span className="label">
          {readableDay(report.weekStart)} tot {readableDay(report.weekEnd)}
        </span>
        <button type="button" onClick={dismiss} className="label-button label underline underline-offset-2">
          Sluiten
        </button>
      </div>

      {/* What stays visible when it is folded: the week in one line, and the
          skills that rusted or are about to. Folding the report was the point —
          it is roughly 800px and it stood between the display and the one thing
          you open the app for — but a bad reading behind a tap is the same
          mistake the rotating status line made, so those two lines stay out. */}
      <p className="mt-2 text-[13px]">{weekComparison(report)}</p>

      {report.rust.length > 0 ? (
        <p className="mt-2 text-[13px]" style={{ color: 'var(--signal-text)' }}>
          {report.rust
            .map((note) =>
              note.rusted
                ? `${note.name} roestte een niveau`
                : `${note.name} roest over ${spelledDays(note.daysUntilRust)}`,
            )
            .join('. ')}
          .
        </p>
      ) : null}

      <div id="weekbericht-rest" hidden={!expanded}>
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

      {report.balanceSentence ? (
        <p className="mt-2 text-[13px]" style={{ color: 'var(--muted)' }}>
          {report.balanceSentence}
        </p>
      ) : null}

      {/* ------------------------------------------------------ de weekstand -- */}
      <fieldset className="mt-4">
        <legend className="label">Hoe wordt de komende week</legend>
        <div className="mt-1.5 flex gap-1.5">
          {CAPACITIES.map((option) => {
            const selected = option.value === capacity;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => void chooseCapacity(option.value)}
                aria-pressed={selected}
                className="raised h-11 flex-1 px-2 text-[12px]"
                style={{
                  background: selected ? 'var(--ink)' : undefined,
                  color: selected ? 'var(--panel)' : 'var(--ink)',
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-[12px]" style={{ color: 'var(--muted)' }}>
          {CAPACITIES.find((c) => c.value === capacity)?.hint}
        </p>
      </fieldset>

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
          {/* Stays mounted once accepted: swapping it for a span dropped the
              keyboard back to the top of the document. */}
          <button
            type="button"
            onClick={accepted ? undefined : accept}
            // aria-disabled once accepted, so the button keeps the focus it
            // has; disabled would drop the keyboard back to the top.
            // The name of the focused element changes, which is what a screen
            // reader reads out; a live region on a control would be neither.
            aria-disabled={accepted || undefined}
            disabled={!accepted && picked.length === 0}
            className="raised h-11 px-5 text-[13px]"
            style={
              accepted
                ? undefined
                : { background: 'var(--signal-fill)', color: 'var(--on-signal)' }
            }
          >
            {accepted ? 'Overgenomen' : 'Neem over'}
          </button>
        </div>
      </div>
      </div>

      {/* Same element in both states, so unfolding and folding again keeps the
          keyboard where it was instead of dropping it to the top. */}
      <div className="mt-2">
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          aria-controls="weekbericht-rest"
          className="label-button label underline underline-offset-2"
        >
          {expanded ? 'Inklappen' : 'Het hele weekbericht'}
        </button>
      </div>
    </section>
  );
}

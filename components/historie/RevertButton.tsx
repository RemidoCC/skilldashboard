'use client';

import { useEffect, useRef, useState } from 'react';
import { useOffline } from '@/components/offline/OfflineProvider';

/**
 * Takes a completion back.
 *
 * Two taps, because it removes something from the record and there is no undo
 * for the undo. The confirmation says what will happen rather than asking
 * "are you sure" — and it says it in numbers. It used to read "XP terug,
 * opdracht mee", set at 9px, while the restore flow two screens away counted
 * out in full what it was about to replace. Same kind of decision, opposite
 * treatment, and the smaller one sat on the screen you scroll past most.
 *
 * The button stays mounted once it is done. Replacing it with a span dropped
 * the keyboard back to `body`, so confirming one entry sent you to the top of
 * the log to find the next.
 */
export function RevertButton({
  entryId,
  title,
  xp,
}: {
  entryId: string;
  title: string;
  /** What the entry is worth, so the confirmation can name it. */
  xp: number;
}) {
  const { mutate } = useOffline();
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  const settled = useRef<HTMLButtonElement>(null);

  /* Confirming replaces a two-button panel with one line, so the element the
     keyboard was standing on stops existing and focus falls to <body> — in a
     long log that means walking back down from the top after every entry.
     aria-disabled alone does not help here, because it is a different element;
     the focus has to be handed over. Handing it over is also what announces
     the change, so no live region is needed — and role="status" on a control
     is not a thing anyway. */
  useEffect(() => {
    if (done) settled.current?.focus();
  }, [done]);

  if (done) {
    return (
      <button
        ref={settled}
        type="button"
        aria-disabled="true"
        onClick={(e) => e.preventDefault()}
        className="label-button label"
      >
        Teruggedraaid
      </button>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="label-button label underline underline-offset-2"
      >
        Terugdraaien
      </button>
    );
  }

  return (
    <div className="recess px-3 py-2">
      <p className="text-[12px]" style={{ color: 'var(--signal-text)' }}>
        {/* The bonus and the quest step are the server's to work out on replay,
            so they are named without a figure rather than guessed at here. */}
        {xp >= 0 ? `${xp} XP gaat eraf.` : `${Math.abs(xp)} XP komt terug.`} Een opdracht die
        hierdoor vooruitging en een bonus die dit betaalde, gaan mee terug.
      </p>
      <div className="mt-1.5 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="raised h-11 px-4 text-[12px]"
        >
          Laat staan
        </button>
        <button
          type="button"
          onClick={async () => {
            setDone(true);
            await mutate({ kind: 'entry.revert', id: entryId });
          }}
          // The accessible name has to start with the visible words, or voice
          // control cannot reach the button by what it says (WCAG 2.5.3).
          aria-label={`Doe maar, ${title} terugdraaien`}
          className="raised h-11 px-5 text-[13px]"
          style={{ background: 'var(--signal-fill)', color: 'var(--on-signal)' }}
        >
          Doe maar
        </button>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useOffline } from '@/components/offline/OfflineProvider';

/**
 * Takes a completion back.
 *
 * Two taps, because it removes something from the record and there is no undo
 * for the undo. The confirmation says what will happen rather than asking
 * "are you sure".
 */
export function RevertButton({ entryId, title }: { entryId: string; title: string }) {
  const { mutate } = useOffline();
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <span className="label" role="status">
        Teruggedraaid
      </span>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="label underline underline-offset-2"
      >
        Terugdraaien
      </button>
    );
  }

  return (
    <span className="flex items-center gap-3">
      <span className="label">XP terug, opdracht mee</span>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="label underline underline-offset-2"
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
        className="label underline underline-offset-2"
        style={{ color: 'var(--signal-text)' }}
      >
        Doe maar
      </button>
    </span>
  );
}

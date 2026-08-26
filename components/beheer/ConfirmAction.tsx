'use client';

import { useState } from 'react';

/**
 * A destructive action written out in two taps.
 *
 * The app had three treatments for one kind of decision: restoring asked twice
 * and said in numbers what it was about to do; signing out asked twice; and
 * deleting a goal or a mapping rule went on a single tap from a 9px line, with
 * nothing said and nothing to undo. This is the one shape, so the third case
 * cannot drift back.
 *
 * The confirmation states the cost rather than asking whether you are sure,
 * and the confirming button keeps its own focus by staying mounted — replacing
 * it dropped the keyboard back to the top of the document.
 */
export function ConfirmAction({
  label,
  cost,
  confirmLabel = 'Doe maar',
  confirmName,
  onConfirm,
  disabled = false,
}: {
  /** What the first tap says. */
  label: string;
  /** What the second tap will cost, in words, and in numbers where there are any. */
  cost: string;
  confirmLabel?: string;
  /** Accessible name for the confirming button; must start with its visible words. */
  confirmName: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={disabled}
        className="label-button label underline underline-offset-2"
      >
        {label}
      </button>
    );
  }

  return (
    <div className="recess px-3 py-2">
      <p className="text-[12px]" style={{ color: 'var(--signal-text)' }}>
        {cost}
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
          onClick={onConfirm}
          // Starts with the visible words, or voice control cannot reach it
          // by what it says (WCAG 2.5.3).
          aria-label={confirmName}
          className="raised h-11 px-5 text-[13px]"
          style={{ background: 'var(--signal-fill)', color: 'var(--on-signal)' }}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { usePrefersReducedMotion } from '@/lib/hooks/usePrefersReducedMotion';

const ROTATE_MS = 6000;
const FADE_MS = 320;

/**
 * One line at a time, cross-faded. Never slides — the display swaps a reading,
 * it does not carry text across the screen.
 */
export function StatusLine({ lines }: { lines: string[] }) {
  const reduced = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (lines.length <= 1) return;

    const timer = window.setInterval(() => {
      if (reduced) {
        setIndex((i) => (i + 1) % lines.length);
        return;
      }
      // Fade out, swap while invisible, fade back in.
      setVisible(false);
      window.setTimeout(() => {
        setIndex((i) => (i + 1) % lines.length);
        setVisible(true);
      }, FADE_MS);
    }, ROTATE_MS);

    return () => window.clearInterval(timer);
  }, [lines.length, reduced]);

  // A shorter list after a data change must not leave the index dangling.
  const line = lines[Math.min(index, lines.length - 1)] ?? '';

  return (
    <p
      // Politely announced: the line changes on its own, so it must not
      // interrupt a screen reader mid-sentence.
      aria-live="polite"
      className="text-[12px] leading-snug"
      style={{
        color: 'var(--screen-ink)',
        opacity: reduced ? 1 : visible ? 1 : 0,
        transition: reduced ? 'none' : `opacity ${FADE_MS}ms linear`,
        minHeight: '2.4em',
      }}
    >
      {line}
    </p>
  );
}

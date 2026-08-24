'use client';

import { useMemo } from 'react';
import { GLYPH_HEIGHT, dotsFor, matrixWidth } from './font5x7';
import { useSelfTest } from './SelfTest';
import { usePrefersReducedMotion } from '@/lib/hooks/usePrefersReducedMotion';

interface Props {
  /** The number on the display. Padded with leading blanks, never zeroes. */
  value: number;
  /** How many character cells the display has. */
  cells?: number;
  className?: string;
}

/**
 * The total level, rendered as a real dot matrix: a 5x7 bitmap per digit drawn
 * as circles. Lit dots take the signal colour; unlit dots stay faintly visible
 * so the grid reads as hardware rather than as a font.
 */
export function DotMatrix({ value, cells = 2, className }: Props) {
  const phase = useSelfTest();
  const reduced = usePrefersReducedMotion();

  const text = useMemo(() => {
    const digits = String(Math.max(Math.trunc(value), 0));
    return digits.length >= cells ? digits : digits.padStart(cells, ' ');
  }, [value, cells]);

  const dots = useMemo(() => dotsFor(text), [text]);
  const width = matrixWidth(text.length);

  return (
    <svg
      className={className}
      viewBox={`0 0 ${width} ${GLYPH_HEIGHT}`}
      role="img"
      aria-label={`Totaal niveau ${value}`}
      style={{ display: 'block' }}
    >
      {dots.map((dot, i) => (
        <circle
          key={i}
          cx={dot.x + 0.5}
          cy={dot.y + 0.5}
          r={0.36}
          fill={phase === 'sweep' || dot.lit ? 'var(--signal)' : 'var(--dot-off)'}
          style={{ transition: reduced ? 'none' : 'fill 260ms linear' }}
        />
      ))}
    </svg>
  );
}

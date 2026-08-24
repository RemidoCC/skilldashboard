'use client';

import { useEffect, useRef, useState } from 'react';
import { useSelfTest } from './SelfTest';
import { SkillGlyph } from './SkillGlyph';
import { usePrefersReducedMotion } from '@/lib/hooks/usePrefersReducedMotion';
import type { SkillGlyph as GlyphName } from '@/lib/domain/types';

/* The gauge sweeps 240 degrees with the gap at the bottom, so the needle
   travels from -120 to +120 degrees measured from straight up. */
const SWEEP = 240;
const START = -SWEEP / 2;
const TICKS = 41; // 40 intervals of 6 degrees; every 5th is a long tick
const RADIUS = 42;
const CENTER = 50;

function pointOnArc(angleDeg: number, radius: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CENTER + radius * Math.sin(rad), y: CENTER - radius * Math.cos(rad) };
}

interface Props {
  name: string;
  glyph: GlyphName;
  color: string;
  level: number;
  /** How far into the current level, 0..1. Fills the ticks. */
  fraction: number;
  /** A rusting skill turns its ticks to the signal colour. */
  rusting?: boolean;
  /** Set when the last change crossed a level, so the needle steps instead of sliding. */
  steppedTo?: number;
}

export function Meter({ name, glyph, color, level, fraction, rusting = false, steppedTo }: Props) {
  const phase = useSelfTest();
  const reduced = usePrefersReducedMotion();

  // The needle only animates from a previous reading, so the very first paint
  // must not slide up from zero.
  const [settled, setSettled] = useState(false);
  const previousLevel = useRef(level);
  const [stepping, setStepping] = useState(false);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setSettled(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (previousLevel.current === level) return;
    previousLevel.current = level;
    // A level-up steps through discrete clicks rather than sliding.
    setStepping(true);
    const timer = window.setTimeout(() => setStepping(false), 500);
    return () => window.clearTimeout(timer);
  }, [level, steppedTo]);

  const shown = phase === 'sweep' ? 1 : settled || reduced ? fraction : 0;
  const angle = START + SWEEP * Math.min(Math.max(shown, 0), 1);

  const easing = stepping
    ? 'steps(6, end)'
    : // Spring-damped: overshoots roughly 12 percent, then settles.
      'cubic-bezier(.34, 1.45, .64, 1)';

  const lit = (index: number) => index / (TICKS - 1) <= shown + 1e-9;

  return (
    <div className="raised flex flex-col items-center px-2 pt-3 pb-2">
      <svg viewBox="0 0 100 88" className="w-full" role="img" aria-label={`${name}, niveau ${level}`}>
        {Array.from({ length: TICKS }, (_, i) => {
          const angleAt = START + (SWEEP * i) / (TICKS - 1);
          const long = i % 5 === 0;
          const outer = pointOnArc(angleAt, RADIUS);
          const inner = pointOnArc(angleAt, RADIUS - (long ? 9 : 5));
          const on = lit(i);
          return (
            <line
              key={i}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke={on ? (rusting ? 'var(--signal)' : 'var(--ink)') : 'var(--tick-off)'}
              strokeWidth={long ? 2.2 : 1.4}
              strokeLinecap="butt"
            />
          );
        })}

        {/* The needle. Rotation is animated rather than the geometry, so the
            browser can keep it on the compositor. */}
        <g
          style={{
            transform: `rotate(${angle}deg)`,
            transformOrigin: `${CENTER}px ${CENTER}px`,
            transition: reduced ? 'none' : `transform 450ms ${easing}`,
          }}
        >
          <line
            x1={CENTER}
            y1={CENTER}
            x2={CENTER}
            y2={CENTER - (RADIUS - 12)}
            stroke="var(--ink)"
            strokeWidth={2.4}
            strokeLinecap="round"
          />
        </g>

        {/* The needle hub carries the skill's colour — the one place it shows. */}
        <circle cx={CENTER} cy={CENTER} r={4.2} fill={color} />
        <circle cx={CENTER} cy={CENTER} r={1.6} fill="var(--raised)" />

        {/* Below the arc, clear of the needle at either end of the sweep. */}
        <text
          x={CENTER}
          y={84}
          textAnchor="middle"
          className="value"
          fontSize={17}
          fill="var(--ink)"
          style={{ fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums' }}
        >
          {String(level).padStart(2, '0')}
        </text>
      </svg>

      <div className="mt-1 flex w-full items-center justify-center gap-1.5">
        <span style={{ color: 'var(--muted)' }}>
          <SkillGlyph name={glyph} size={11} />
        </span>
        <span className="label truncate">{name}</span>
      </div>
      {/* The skill's colour, as a 2px rule under the label. */}
      <span
        aria-hidden
        className="mt-1 block h-0.5 w-8 rounded-full"
        style={{ background: color }}
      />
    </div>
  );
}

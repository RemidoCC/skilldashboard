'use client';

import { useId } from 'react';

export const MIN_VALUE = 5;
export const MAX_VALUE = 150;
export const STEP = 5;
/** Above this, a single completion is worth more than most days of work. */
export const HEAVY_VALUE = 60;

/**
 * The value of one completion, 5 to 150 in steps of 5.
 *
 * The warning is the point of the control: XP only means anything while the
 * scale holds, and a handful of heavy tasks flattens everything else.
 */
export function ValueSlider({
  value,
  onChange,
  label = 'Waarde',
  hint,
}: {
  value: number;
  onChange: (next: number) => void;
  label?: string;
  hint?: string;
}) {
  const id = useId();
  const heavy = value > HEAVY_VALUE;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="label">
          {label}
        </label>
        <span className="value text-[15px]">{value}</span>
      </div>

      <input
        id={id}
        type="range"
        min={MIN_VALUE}
        max={MAX_VALUE}
        step={STEP}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 h-11 w-full accent-[var(--signal-fill)]"
      />

      <p
        className="mt-1 text-[12px]"
        style={{ color: heavy ? 'var(--signal-text)' : 'var(--muted)' }}
      >
        {heavy
          ? 'Zwaar. Houd dit zeldzaam, anders verdwijnt de rest in het niet.'
          : (hint ?? 'Stappen van 5.')}
      </p>
    </div>
  );
}

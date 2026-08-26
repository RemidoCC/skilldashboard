'use client';

import { colorName, SKILL_COLORS } from '@/lib/domain/colors';

export { SKILL_COLORS };

/** The eight swatches, each named rather than announced as a hex code. */
export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <fieldset>
      <legend className="label">Kleur</legend>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {SKILL_COLORS.map((color) => {
          const selected = color.toLowerCase() === value.toLowerCase();
          return (
            <button
              key={color}
              type="button"
              onClick={() => onChange(color)}
              aria-pressed={selected}
              aria-label={`Kleur ${colorName(color)}`}
              className="raised grid h-11 w-11 place-items-center"
            >
              <span
                className="block h-5 w-5 rounded-full"
                style={{
                  background: color,
                  // The selected one gets a hard ring rather than a glow.
                  boxShadow: selected ? '0 0 0 2px var(--ink)' : 'none',
                }}
              />
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

'use client';

/**
 * Skill colours, kept muted on purpose: the colour only ever appears as a 2px
 * rule under a label and the needle hub, so a bright one would fight the
 * single action colour for attention.
 */
export const SKILL_COLORS = [
  '#5C7A99',
  '#A6572E',
  '#6E8C5A',
  '#8A6E9E',
  '#9E8A4A',
  '#7A6A5A',
  '#4A7A7A',
  '#8A5A6E',
] as const;

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
              aria-label={`Kleur ${color}`}
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

'use client';

import { SkillGlyph } from '@/components/instrument/SkillGlyph';
import { GLYPH_NAMES } from '@/lib/domain/glyphs';
import type { SkillGlyph as GlyphName } from '@/lib/domain/types';

/** The fixed set. No emoji, and nothing to upload. */
export function GlyphPicker({
  value,
  onChange,
}: {
  value: GlyphName;
  onChange: (next: GlyphName) => void;
}) {
  return (
    <fieldset>
      <legend className="label">Teken</legend>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {GLYPH_NAMES.map((name) => {
          const selected = name === value;
          return (
            <button
              key={name}
              type="button"
              onClick={() => onChange(name)}
              aria-pressed={selected}
              aria-label={name}
              className="raised grid h-11 w-11 place-items-center"
              style={{
                background: selected ? 'var(--ink)' : undefined,
                color: selected ? 'var(--panel)' : 'var(--ink)',
              }}
            >
              <SkillGlyph name={name} size={16} />
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

import type { SkillGlyph } from './types';

/** The fixed set a skill can carry. New skills pick from this. */
export const GLYPH_NAMES: readonly SkillGlyph[] = [
  'square',
  'diamond',
  'ring',
  'wave',
  'triangle',
  'cross',
  'hexagon',
  'bars',
];

/**
 * What each mark is called, in the language of the interface.
 *
 * The buttons in the picker carry no visible text, so these names are what a
 * screen reader reads and what voice control listens for. They used to be the
 * identifiers themselves — 'square', 'diamond', 'wave' — which is the one
 * place English leaked into a Dutch screen.
 */
export const GLYPH_LABELS: Record<SkillGlyph, string> = {
  square: 'vierkant',
  diamond: 'ruit',
  ring: 'ring',
  wave: 'golf',
  triangle: 'driehoek',
  cross: 'kruis',
  hexagon: 'zeshoek',
  bars: 'balken',
};

export function isGlyphName(value: string): value is SkillGlyph {
  return (GLYPH_NAMES as readonly string[]).includes(value);
}

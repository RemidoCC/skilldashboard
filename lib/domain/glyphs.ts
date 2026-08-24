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

export function isGlyphName(value: string): value is SkillGlyph {
  return (GLYPH_NAMES as readonly string[]).includes(value);
}

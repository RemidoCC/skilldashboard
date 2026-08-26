/**
 * The colours a skill can carry, and what each one is called.
 *
 * Kept muted on purpose: the colour only ever appears as a 2px rule under a
 * label and as the needle hub, so a bright one would fight the single action
 * colour for attention.
 *
 * The names are not decoration either. The swatches in the picker carry no
 * visible text, so the name is the whole accessible name — and it used to be
 * the hex code, which a screen reader spells out one character at a time and
 * voice control cannot say at all. Data rather than markup, so it lives here
 * with the rest of the rules.
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

export const COLOR_NAMES: Record<string, string> = {
  '#5C7A99': 'blauwgrijs',
  '#A6572E': 'roestbruin',
  '#6E8C5A': 'mosgroen',
  '#8A6E9E': 'paars',
  '#9E8A4A': 'okergeel',
  '#7A6A5A': 'taupe',
  '#4A7A7A': 'blauwgroen',
  '#8A5A6E': 'oudroze',
};

/** Falls back to the code itself rather than to nothing, so a colour restored
 *  from an edited export is still announced as something. */
export function colorName(color: string): string {
  return COLOR_NAMES[color.toUpperCase()] ?? color;
}

/**
 * A 5x7 bitmap font, one entry per glyph, seven rows of five bits.
 *
 * The display draws these as circles. It is not a typeface trick: the grid is
 * real, and unlit dots stay faintly visible so you can see the matrix behind
 * the number.
 */
export const GLYPH_WIDTH = 5;
export const GLYPH_HEIGHT = 7;

const DIGITS: Record<string, string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

/** Rows of booleans for one character. Unknown characters render blank. */
export function glyphFor(char: string): boolean[][] {
  const rows = DIGITS[char] ?? DIGITS[' '];
  return rows.map((row) => row.split('').map((bit) => bit === '1'));
}

/** Every dot of a string, as {x, y, lit} in glyph-grid coordinates. */
export function dotsFor(text: string, gap = 1.5): { x: number; y: number; lit: boolean }[] {
  const dots: { x: number; y: number; lit: boolean }[] = [];
  text.split('').forEach((char, index) => {
    const originX = index * (GLYPH_WIDTH + gap);
    glyphFor(char).forEach((row, y) => {
      row.forEach((lit, x) => {
        dots.push({ x: originX + x, y, lit });
      });
    });
  });
  return dots;
}

/** Width of a rendered string in grid units. */
export function matrixWidth(length: number, gap = 1.5): number {
  return length * GLYPH_WIDTH + Math.max(length - 1, 0) * gap;
}

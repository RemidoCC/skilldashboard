import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AA_LARGE, AA_TEXT, contrast } from '@/lib/design/contrast';

/**
 * The quality floor says contrast passes WCAG AA in both palettes. Labels run
 * at 9-10px, so they are normal text and need 4.5:1 — this reads the real
 * tokens out of globals.css so the check cannot drift from what ships.
 */
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

function palette(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  expect(start, `${selector} not found in globals.css`).toBeGreaterThan(-1);
  const block = css.slice(start, css.indexOf('}', start));

  const tokens: Record<string, string> = {};
  for (const match of block.matchAll(/--([a-z-]+):\s*(#[0-9A-Fa-f]{3,6})\s*;/g)) {
    tokens[match[1]] = match[2];
  }
  return tokens;
}

const day = palette(':root {');
const night = palette(":root[data-theme='night']");

describe.each([
  ['dag', day],
  ['nacht', night],
])('%s palette', (_name, p) => {
  it('defines every token the components reference', () => {
    for (const token of [
      'panel', 'recess', 'raised', 'screen', 'ink', 'muted',
      'signal', 'signal-text', 'signal-fill', 'on-signal',
      'edge', 'tick-off', 'screen-ink', 'screen-muted',
    ]) {
      expect(p[token], `--${token} missing`).toMatch(/^#[0-9A-Fa-f]{3,6}$/);
    }
  });

  it.each([
    ['ink on panel', 'ink', 'panel'],
    ['ink on recess', 'ink', 'recess'],
    ['ink on raised', 'ink', 'raised'],
    ['muted on panel', 'muted', 'panel'],
    ['muted on recess', 'muted', 'recess'],
    ['muted on raised', 'muted', 'raised'],
    ['signal-text on panel', 'signal-text', 'panel'],
    ['signal-text on recess', 'signal-text', 'recess'],
    ['signal-text on raised', 'signal-text', 'raised'],
    ['on-signal on signal-fill', 'on-signal', 'signal-fill'],
    ['screen-ink on screen', 'screen-ink', 'screen'],
    ['screen-muted on screen', 'screen-muted', 'screen'],
  ])('%s reaches AA for normal text', (_label, fg, bg) => {
    expect(contrast(p[fg], p[bg])).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each([
    ['raised', 'raised'],
    ['screen', 'screen'],
  ])('the signal reads as a mark on %s', (_label, surface) => {
    // Non-text use only: lit ticks, the dot matrix, the tier bar. --signal is
    // never placed on --panel; the active tab rule uses --signal-fill, which
    // is the shade that clears 3:1 there.
    expect(contrast(p.signal, p[surface])).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it('the active tab mark clears 3:1 on the panel it sits on', () => {
    expect(contrast(p['signal-fill'], p.panel)).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it('lit ticks stand clear of the surface they sit on', () => {
    expect(contrast(p.ink, p.raised)).toBeGreaterThanOrEqual(AA_LARGE);
  });
});

describe('contrast helper', () => {
  it('is symmetric', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(contrast('#FFFFFF', '#000000'));
  });

  it('spans the full range', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrast('#777777', '#777777')).toBeCloseTo(1);
  });

  it('expands shorthand hex', () => {
    expect(contrast('#fff', '#000')).toBeCloseTo(21, 1);
  });

  it('rejects nonsense', () => {
    expect(() => contrast('red', '#000')).toThrow(RangeError);
  });
});

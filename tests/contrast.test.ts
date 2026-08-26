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
/* The night block only overrides what changes, so the effective night palette
   is day with those overrides applied — same as the cascade at runtime. */
const night = { ...day, ...palette(":root[data-theme='night']") };

describe.each([
  ['dag', day],
  ['nacht', night],
])('%s palette', (_name, p) => {
  it('defines every token the components reference', () => {
    for (const token of [
      'panel', 'recess', 'raised', 'screen', 'ink', 'muted',
      'signal', 'signal-text', 'signal-fill', 'on-signal', 'focus',
      'edge', 'outline', 'tick-off', 'screen-ink', 'screen-muted', 'ok',
    ]) {
      expect(p[token], `--${token} missing`).toMatch(/^#[0-9A-Fa-f]{3,6}$/);
    }
  });

  /* Every foreground/background pair the app actually renders. Body copy,
     labels, placeholders, error lines, button faces and the inverted chip —
     all of it is normal text at 9-15px, so all of it needs 4.5:1. */
  it.each([
    ['body ink on panel', 'ink', 'panel'],
    ['ink on recess', 'ink', 'recess'],
    ['ink on raised', 'ink', 'raised'],
    ['label muted on panel', 'muted', 'panel'],
    ['label muted on recess', 'muted', 'recess'],
    ['label muted on raised', 'muted', 'raised'],
    ['placeholder muted on raised', 'muted', 'raised'],
    ['placeholder muted on recess', 'muted', 'recess'],
    ['error signal-text on panel', 'signal-text', 'panel'],
    ['error signal-text on recess', 'signal-text', 'recess'],
    ['error signal-text on raised', 'signal-text', 'raised'],
    ['button on-signal on signal-fill', 'on-signal', 'signal-fill'],
    ['selected chip panel on ink', 'panel', 'ink'],
    ['screen-ink on screen', 'screen-ink', 'screen'],
    ['screen-muted on screen', 'screen-muted', 'screen'],
  ])('%s reaches AA for normal text', (_label, fg, bg) => {
    expect(contrast(p[fg], p[bg])).toBeGreaterThanOrEqual(AA_TEXT);
  });

  /* WCAG 2.4.11: a focus indicator needs 3:1 against the surface it sits on.
     Every interactive element in the app lives on one of these three. */
  it.each([['panel'], ['recess'], ['raised']])(
    'the focus ring stands out on %s',
    (surface) => {
      expect(contrast(p.focus, p[surface])).toBeGreaterThanOrEqual(AA_LARGE);
    },
  );

  it('the on-screen focus ring stands out on the display', () => {
    expect(contrast(p.ok, p.screen)).toBeGreaterThanOrEqual(AA_LARGE);
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

  /* WCAG 1.4.11: the boundary of a control needs 3:1 against what it sits on.
     A .raised control lands on the panel, on a recess, and on another raised
     row; a .recess control lands on all three too. --edge cannot carry this —
     it reaches 1.19:1 — so the hairline is a token of its own. */
  it.each([['panel'], ['recess'], ['raised']])(
    'the control hairline stands out on %s',
    (surface) => {
      expect(contrast(p.outline, p[surface])).toBeGreaterThanOrEqual(AA_LARGE);
    },
  );
});

/* The night palette is written twice: once for the explicit choice, once for a
   dark system with no JavaScript to make that choice. CSS cannot share a
   declaration block, so the guard against drift lives here. */
describe('the two night palettes', () => {
  const chosen = palette(":root[data-theme='night']");
  const system = palette(":root:not([data-theme='day']) {");

  it('carry the same tokens', () => {
    expect(Object.keys(system).sort()).toEqual(Object.keys(chosen).sort());
  });

  it('carry the same values', () => {
    expect(system).toEqual(chosen);
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

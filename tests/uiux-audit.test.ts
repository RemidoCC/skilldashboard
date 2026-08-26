import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CAPACITY_FACTOR } from '@/lib/domain/quests';
import { GRACE_DAYS } from '@/lib/domain/rust';
import { GLYPH_LABELS, GLYPH_NAMES } from '@/lib/domain/glyphs';
import { COLOR_NAMES, SKILL_COLORS, colorName } from '@/lib/domain/colors';
import { dayCount, dutchNumber, spelledDays, statusLines } from '@/lib/domain/status';

/**
 * The findings from the interface audit of 26 August 2026, held down.
 *
 * Most of them are not the kind of thing a unit test normally covers — a
 * selector that cannot match, a status line that names a cause it never
 * measured, a control with no perceivable edge. They are also exactly the kind
 * of thing that comes back the next time someone tidies a stylesheet. Where
 * the fix is a value or a function it is tested as one; where the fix is
 * structural, the structure itself is read out of the source, the way
 * tests/service-worker.test.ts holds the worker to the shared constants.
 */
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/** The source with its comments taken out, for checks about what ships. Every
 *  fix below explains itself in a comment that quotes what it replaced. */
const shipped = (path: string) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const css = read('app/globals.css');
const settings = read('components/beheer/Settings.tsx');
const capacity = read('lib/domain/capacity.ts');
const statusLine = read('components/instrument/StatusLine.tsx');
const syncBar = read('components/offline/SyncBar.tsx');
const queue = read('lib/offline/queue.ts');
const instrument = read('components/vandaag/Instrument.tsx');
const header = read('components/shell/Header.tsx');

/* ------------------------------------------------------ de leidende regel -- */

describe('the governing rule: it reports, it does not flatter', () => {
  it('says how the week is set in numbers, not in adjectives', () => {
    // "lagere" and "kleinere" described half and three quarters, and the
    // Sunday report called both of them "kleinere opdrachten".
    for (const hint of capacity.matchAll(/hint: '([^']+)'/g)) {
      expect(hint[1]).toMatch(/helft|hele|driekwart/);
    }
  });

  it('describes each week setting exactly once, for both screens', () => {
    // Two lists meant two wordings for the same three settings.
    // In the domain layer, not in a client component: importing it from
    // Settings would pull restore, sign-out and the feedback module into the
    // Vandaag bundle for the sake of three strings.
    expect(capacity).toContain('export const CAPACITIES');
    for (const file of ['components/beheer/Settings.tsx', 'components/vandaag/WeekReport.tsx']) {
      expect(read(file)).toContain("import { CAPACITIES } from '@/lib/domain/capacity'");
    }
    expect(shipped('components/vandaag/WeekReport.tsx')).not.toContain('const CAPACITIES');
  });

  it('keeps those numbers in step with the rules they describe', () => {
    const hints = [...capacity.matchAll(/value: '(\w+)'[^}]*hint: '([^']+)'/g)];
    expect(hints).toHaveLength(3);
    for (const [, value, hint] of hints) {
      const capacity = value as keyof typeof GRACE_DAYS;
      const spelled = spelledDays(GRACE_DAYS[capacity]);
      expect(hint, `${value} names its grace period`).toContain(spelled);
      const share = CAPACITY_FACTOR[capacity];
      expect(hint).toContain(share === 0.5 ? 'helft' : share === 1 ? 'hele' : 'driekwart');
    }
  });

  it('shows the quest reading it has been computing all along', () => {
    // Instrument passed `quests: null` with a note saying they arrived in
    // phase four. Phase four shipped; the line never did.
    expect(shipped('components/vandaag/Instrument.tsx')).not.toContain('quests: null');
    expect(instrument).toContain('quests,');
    expect(read('app/vandaag/page.tsx')).toContain('quests={');
    expect(statusLines({ xpToday: 0, balanceSentence: null, rust: null, quests: { total: 3, completed: 1 } }))
      .toContain('één van drie opdrachten af.');
  });

  it('names the confirmation of a revert in figures', () => {
    const revert = read('components/historie/RevertButton.tsx');
    expect(shipped('components/historie/RevertButton.tsx')).not.toContain('XP terug, opdracht mee');
    expect(revert).toContain('XP gaat eraf');
    expect(read('components/historie/HistorieView.tsx')).toContain('xp={entry.xp}');
  });

  it('states a measurement where it used to give advice', () => {
    for (const [file, gone] of [
      ['components/vandaag/PickThree.tsx', 'een lijst in plaats van een keuze'],
      ['components/beheer/TaskManager.tsx', 'een lijst in plaats van een keuze'],
      ['components/beheer/ValueSlider.tsx', 'Houd dit zeldzaam'],
      ['components/beheer/SkillManager.tsx', 'Zes is de bovengrens'],
    ] as const) {
      expect(shipped(file), `${file} still gives advice`).not.toContain(gone);
    }
  });
});

/* ----------------------------------------------------------- de meetlat -- */

describe('what the sync bar reports', () => {
  it('has a measured reason for a queue that is standing still', () => {
    // "Wacht op verbinding" was shown for a refusing server on a live
    // connection: a cause the instrument had not taken a reading of.
    expect(queue).toContain("export type Blocked = 'offline' | 'server' | null");
    expect(queue).toContain("report.blocked = 'offline'");
    expect(queue).toContain("report.blocked = 'server'");
    expect(queue).toContain("blocked = 'offline'");
    expect(queue).toContain("blocked = 'server'");
  });

  it('names all four states apart', () => {
    for (const line of [
      'Geen verbinding',
      'Bezig met versturen',
      'De server nam dit niet aan',
      'Het verzoek kwam niet aan',
      'Nog niet verstuurd',
    ]) {
      expect(syncBar).toContain(line);
    }
    expect(shipped('components/offline/SyncBar.tsx')).not.toContain("'Wacht op verbinding'");
  });

  it('offers a way to try again, because nothing retries on its own', () => {
    // drain runs on mount, on `online`, on a return to the tab and on a new
    // write. After one 5xx none of those happens, so the queue simply sat.
    expect(syncBar).toContain('Nu opnieuw proberen');
    expect(read('components/offline/OfflineProvider.tsx')).toContain('const retry =');
  });

  it('calls throwing a failed write away what it is', () => {
    // The write is already out of the queue; this is the last place it exists,
    // and the button said "Sluiten".
    expect(syncBar).toContain('Weggooien');
    expect(syncBar).toContain('staat nergens anders meer');
    expect(syncBar).toContain('Opnieuw proberen');
    expect(queue).toContain('export async function requeueFailure');
  });

  it('keeps the write itself when it parks one', () => {
    expect(queue).toContain('item: { ...item, attempts: 0 }');
    expect(read('public/sw.js')).toContain('item: { ...item, attempts: 0 }');
  });

  it('offers the way back when the session is what failed', () => {
    expect(queue).toContain('response.status === 401');
    expect(syncBar).toContain('Naar het inlogscherm');
  });

  it('announces the state, which changes with no reload', () => {
    expect(syncBar).toMatch(/role="status"/);
  });
});

describe('the Sunday report', () => {
  const report = read('components/vandaag/WeekReport.tsx');

  it('opens folded, so it does not stand between the display and a task', () => {
    // Roughly 800px of it used to sit above everything on a Sunday.
    expect(report).toContain('const [expanded, setExpanded] = useState(false)');
    expect(report).toContain('aria-expanded={expanded}');
    expect(report).toContain("aria-controls=\"weekbericht-rest\"");
    // hidden, not display:none by class: it leaves the tab order too.
    expect(report).toContain('hidden={!expanded}');
  });

  it('keeps a bad reading out of the fold', () => {
    // Hiding the rust line behind a tap is the mistake the rotating status
    // line made. The comparison and the rust note stay above it.
    const fold = report.indexOf('<div id="weekbericht-rest"');
    expect(fold).toBeGreaterThan(-1);
    const summary = report.slice(report.indexOf('weekComparison(report)'), fold);
    expect(summary).toContain('report.rust.length > 0');
  });

  it('keeps the toggle mounted, so folding does not drop the keyboard', () => {
    // One button, below the folded part, rendered in both states — React then
    // reuses the DOM node and the focus rides along.
    expect(report).toContain("{expanded ? 'Inklappen' : 'Het hele weekbericht'}");
    expect(report.indexOf("'Het hele weekbericht'")).toBeGreaterThan(
      report.indexOf("'Neem over'"),
    );
    // The only place `expanded` decides what to render is that label: the body
    // is hidden, not unmounted, and the toggle is never conditional.
    expect(report.match(/expanded \?/g)).toHaveLength(1);
  });
});

describe('the display', () => {
  it('shows every reading at once instead of rotating through them', () => {
    // Six seconds a line, forever, with no way to pause it (WCAG 2.2.2) — and
    // two thirds of every reading invisible at any moment.
    expect(shipped('components/instrument/StatusLine.tsx')).not.toContain('setInterval');
    expect(shipped('components/instrument/StatusLine.tsx')).not.toContain('aria-live=');
    expect(statusLine).toContain('<ul');
  });
});

/* --------------------------------------------------------- de ontwerplaag -- */

describe('the design layer', () => {
  it('gives a control a hairline that can actually be seen', () => {
    // The fill alone reached 1.29:1 on the panel and 1.49:1 on a raised row.
    expect(css).toContain('--outline: #747369');
    expect(css).toContain('--outline: #75766E');
    const raised = css.slice(css.indexOf('.raised {'), css.indexOf('}', css.indexOf('.raised {')));
    const recess = css.slice(css.indexOf('.recess {'), css.indexOf('}', css.indexOf('.recess {')));
    expect(raised).toContain('border: 1px solid var(--outline)');
    expect(recess).toContain('border: 1px solid var(--outline)');
  });

  it('makes a disabled control look disabled', () => {
    // Three primary buttons on an empty account looked exactly like three
    // working ones; only the mouse cursor differed, and a phone has none.
    expect(css).toContain(':where(.raised, .recess):disabled:not([data-done])');
    expect(css).toContain(":where(.raised, .recess)[aria-disabled='true']");
    // A checked task means "recorded", not "unavailable", and keeps its face.
    expect(read('components/vandaag/TaskRow.tsx')).toContain('data-done=');
  });

  it('gives a text button something to hit', () => {
    const block = css.slice(css.indexOf('.label-button {'), css.indexOf('}', css.indexOf('.label-button {')));
    expect(block).toContain('min-height: 44px');
    // Grown as a pseudo-element it laid invisible targets over real ones.
    expect(shipped('app/globals.css')).not.toContain('.label-button::after');
  });

  it('stops one long word from taking the page sideways', () => {
    expect(css).toContain('overflow-wrap: break-word');
    // A fieldset defaults to min-inline-size: min-content, so it grows to fit
    // its widest chip rather than fitting the column.
    expect(css).toContain('fieldset { min-inline-size: 0; }');
  });

  it('has a night palette for a dark system with no JavaScript', () => {
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).toContain(":root:not([data-theme='day'])");
  });
});

/* -------------------------------------------------------- toegankelijkheid -- */

describe('accessibility fixes that a scanner cannot see', () => {
  it('puts the restore file field where its focus ring can reach it', () => {
    // Tailwind compiles peer-focus-visible to a sibling combinator. With the
    // input one level up the rule could never match, and the field is sr-only,
    // so focus landed somewhere invisible on the one irreversible flow.
    const section = settings.indexOf('<h3 className="label">Terugzetten</h3>');
    const flex = settings.indexOf('<div className="mt-2 flex justify-end">', section);
    const input = settings.indexOf('id="restore-file"', section);
    const label = settings.indexOf('htmlFor="restore-file"', section);
    expect(section).toBeGreaterThan(-1);
    expect(flex).toBeGreaterThan(-1);
    expect(input).toBeGreaterThan(flex);
    expect(label).toBeGreaterThan(input);
    expect(settings.slice(flex, label)).not.toContain('</div>');
  });

  it('names every screen in its own h1', () => {
    expect(header).toContain('{screen}');
    for (const [page, screen] of [
      ['app/vandaag/page.tsx', 'Vandaag'],
      ['app/beheer/page.tsx', 'Beheer'],
      ['app/historie/page.tsx', 'Historie'],
    ] as const) {
      expect(read(page)).toContain(`<Header screen="${screen}"`);
    }
    expect(read('app/login/page.tsx')).toContain('<h1');
    expect(read('app/offline/page.tsx')).toContain('<h1');
  });

  it('puts a section title in a heading rather than a span', () => {
    for (const [file, title] of [
      ['components/beheer/Settings.tsx', 'Export'],
      ['components/beheer/Settings.tsx', 'Terugzetten'],
      ['components/beheer/SignOut.tsx', 'Sessie'],
      ['components/beheer/GoalProposals.tsx', 'Voorstellen bij dit doel'],
      ['components/vandaag/PickThree.tsx', 'Op vandaag zetten'],
      ['components/offline/InstallPrompt.tsx', 'Op het beginscherm'],
    ] as const) {
      expect(read(file), `${title} is a heading`).toContain(`<h3 className="label">${title}</h3>`);
    }
  });

  it('starts an accessible name with the words that are visible (2.5.3)', () => {
    expect(read('components/vandaag/PickThree.tsx')).toContain('`Vandaag, ${task.title}');
    expect(read('components/vandaag/QuickLog.tsx')).toContain('aria-label="− Waarde omlaag"');
    expect(read('components/vandaag/QuickLog.tsx')).toContain('aria-label="+ Waarde omhoog"');
  });

  it('hands focus over rather than dropping it to the body', () => {
    // disabled on the element the keyboard stands on sends focus to <body>.
    const revert = read('components/historie/RevertButton.tsx');
    expect(revert).toContain('settled.current?.focus()');
    expect(revert).toContain('aria-disabled="true"');
    expect(read('components/vandaag/WeekReport.tsx')).toContain('aria-disabled={accepted || undefined}');
  });

  it('names a colour and a mark in words', () => {
    for (const color of SKILL_COLORS) {
      expect(COLOR_NAMES[color], `${color} has a name`).toBeTruthy();
      expect(colorName(color)).not.toMatch(/^#/);
    }
    for (const glyph of GLYPH_NAMES) {
      expect(GLYPH_LABELS[glyph], `${glyph} has a Dutch name`).toBeTruthy();
    }
    // Every one that has a different Dutch word uses it; 'ring' is 'ring'.
    expect(Object.entries(GLYPH_LABELS).filter(([k, v]) => k === v).map(([k]) => k)).toEqual(['ring']);
    expect(read('components/beheer/GlyphPicker.tsx')).toContain('GLYPH_LABELS[name]');
  });

  it('falls back to the code when a colour is not one of ours', () => {
    // An edited export can carry anything; announcing nothing is worse.
    expect(colorName('#123456')).toBe('#123456');
  });
});

/* ------------------------------------------------------------- samenhang -- */

describe('one thing written one way', () => {
  it('spells one with its accents, because every use is the numeral', () => {
    expect(dutchNumber(1)).toBe('één');
    expect(spelledDays(1)).toBe('één dag');
  });

  it('spells a number out in a sentence and prints it in a value', () => {
    expect(spelledDays(3)).toBe('drie dagen');
    expect(dayCount(3)).toBe('3 dagen');
    expect(dayCount(1)).toBe('1 dag');
  });

  it('uses those two everywhere days are shown', () => {
    expect(read('components/instrument/Display.tsx')).toContain('dayCount(streakDays)');
    expect(read('components/historie/HistorieView.tsx')).toContain('dayCount(summary.longestStreak)');
    expect(read('components/vandaag/WeekReport.tsx')).toContain('spelledDays(note.daysUntilRust)');
  });

  it('writes a date through readableDay, everywhere', () => {
    const goals = read('components/beheer/GoalManager.tsx');
    expect(goals).toContain('readableDay(goal.targetDate)');
    expect(shipped('components/beheer/GoalManager.tsx')).not.toMatch(/voor \$\{goal\.targetDate\}/);
  });

  it('writes a percentage as a word on both screens', () => {
    expect(read('components/vandaag/Goals.tsx')).toContain('{goal.progress} procent');
    expect(read('components/beheer/GoalManager.tsx')).toContain('procent');
  });

  it('gives a destructive action one shape', () => {
    const confirm = read('components/beheer/ConfirmAction.tsx');
    expect(confirm).toContain('Laat staan');
    for (const file of ['components/beheer/GoalManager.tsx', 'components/beheer/MappingRules.tsx']) {
      expect(read(file), `${file} confirms first`).toContain('<ConfirmAction');
    }
  });

  it('reports a failed disconnect instead of saying nothing', () => {
    const rules = read('components/beheer/MappingRules.tsx');
    expect(rules).toContain('setDisconnectError');
    expect(rules).toContain('De koppeling staat er nog');
    expect(rules).toContain('Ontkoppelen kan alleen online');
  });

  it('writes the progress of a goal once, not on every step of the drag', () => {
    const goals = read('components/beheer/GoalManager.tsx');
    expect(goals).toContain('onPointerUp={commit}');
    expect(goals).toContain('onBlur={commit}');
  });
});

/* ------------------------------------------------------------ Nederlands -- */

describe('Dutch, including in the error messages', () => {
  it('does not hand a Supabase sentence straight to the screen', () => {
    const actions = read('app/login/actions.ts');
    expect(shipped('app/login/actions.ts')).not.toContain('${error.message}');
    expect(actions).toContain('over_email_send_rate_limit');
    expect(actions).toContain('Er is net al een link verstuurd');
  });

  it('does not open a sentence with an environment variable', () => {
    const rules = read('components/beheer/MappingRules.tsx');
    expect(shipped('components/beheer/MappingRules.tsx')).not.toContain("'TOKEN_ENCRYPTION_KEY ontbreekt");
    expect(rules).toContain('De sleutel waarmee het token versleuteld wordt');
  });
});

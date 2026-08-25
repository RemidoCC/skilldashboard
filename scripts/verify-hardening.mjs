import { chromium } from 'playwright';
import { randomUUID } from 'node:crypto';

/**
 * Checks the four hardening items in the real UI, not just in the types:
 * the token key gate, the restore path, the season summary, and the window.
 */
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();

const fail = (m) => { console.log(`FAIL  ${m}`); process.exitCode = 1; };
const pass = (m) => console.log(`ok    ${m}`);

/** A valid export, built here so the checker is exercised against real input. */
function exportFile(over = {}) {
  const skill = randomUUID();
  const task = randomUUID();
  return {
    exportedAt: new Date().toISOString(),
    schema: 'skill-unit/2',
    skills: [{
      id: skill, name: 'Werk', subtitle: null, color: '#3E6BA8', glyph: 'square',
      level: 4, xp: 20, floor_level: 0, last_active_at: null, active: true,
      sort_order: 0, created_at: '2026-01-01T00:00:00Z',
    }],
    tasks: [{
      id: task, skill_id: skill, title: 'Oefenen', kind: 'check', value: 20,
      on_today: true, archived: false, created_at: '2026-01-01T00:00:00Z',
    }],
    logEntries: Array.from({ length: 12 }, (_, i) => ({
      id: randomUUID(), skill_id: skill, task_id: task, title: 'Oefenen', xp: 40,
      minutes: null, note: null, source: 'manual',
      created_at: `2026-02-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
    })),
    ...over,
  };
}

/**
 * Rendered text, lowercased.
 *
 * The .label class uppercases through CSS, and innerText reports what is
 * painted rather than what is written, so every check here is case-blind.
 */
const said = async (locator) => (await locator.innerText()).replace(/\s+/g, ' ').toLowerCase();

const upload = async (name, body) =>
  page.setInputFiles('#restore-file', {
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)),
  });

/** The restore panel's own alert, not Next's route announcer. */
const alertText = async () => {
  const box = page.locator('p[role="alert"]');
  return (await box.count()) === 0 ? '' : (await box.first().innerText()).trim();
};

/* ------------------------------------------------------- 2. terugzetten -- */

await page.goto(`${BASE}/dev/beheer`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

if ((await page.locator('#restore-file').count()) !== 1) fail('no restore control on Beheer');
else pass('Beheer offers a restore');

if ((await page.getByText('Kies een bestand').count()) !== 1) {
  fail('the file control has no Dutch label of its own');
} else pass('the file control is labelled in Dutch, not by the browser');

await upload('kapot.json', '{ dit is geen json');
await page.waitForTimeout(250);
if (!/leesbare JSON/.test(await alertText())) fail('a broken file is not refused clearly');
else pass('a broken file is refused before anything is asked');

await upload('vakantie.json', { hello: 1 });
await page.waitForTimeout(250);
if (!/geen export/.test(await alertText())) fail('a foreign JSON file is not refused clearly');
else pass('a file that is not an export is refused');

await upload('oud.json', exportFile({ schema: 'skill-unit/99' }));
await page.waitForTimeout(250);
if (!/versie/.test(await alertText())) fail('an unreadable version is not named');
else pass('an unreadable version is named');

const orphan = exportFile();
orphan.tasks[0].skill_id = randomUUID();
await upload('los.json', orphan);
await page.waitForTimeout(250);
if (!/vaardigheid die niet in het bestand staat/.test(await alertText())) {
  fail('a dangling reference is not refused');
} else pass('a dangling reference is refused with a sentence');

await upload('skill-unit-2026-08-25.json', exportFile());
await page.waitForTimeout(300);
if ((await alertText()) !== '') fail(`a valid export was refused: ${await alertText()}`);
else pass('a valid export is accepted');

const counts = await said(page.locator('.recess', { hasText: 'skill-unit-2026-08-25.json' }));
if (!/1 vaardigheid/.test(counts) || !/1 taak/.test(counts) || !/12 logregels/.test(counts)) {
  fail(`the counts do not read right: ${counts}`);
} else pass('the file is summed up in singular and plural');

if ((await page.getByRole('button', { name: /^Doe maar/ }).count()) !== 0) {
  fail('the destructive button is offered without a confirmation step');
} else pass('the destructive button waits for a second tap');

await page.getByRole('button', { name: 'Terugzetten' }).click();
await page.waitForTimeout(250);

if ((await page.getByText('Hier is geen weg terug uit.').count()) !== 1) {
  fail('the confirmation does not say what it costs');
} else pass('the confirmation says what it costs');

// WCAG 2.5.3: voice control must reach the button by the words on it.
if ((await page.getByRole('button', { name: /^Doe maar/ }).count()) !== 1) {
  fail('the confirm button cannot be reached by its visible words');
} else pass('the confirm button is reachable by its visible words');

await page.getByRole('button', { name: 'Laat staan' }).click();
await page.waitForTimeout(200);
if ((await page.getByRole('button', { name: /^Doe maar/ }).count()) !== 0) {
  fail('backing out left the destructive button in place');
} else pass('backing out puts the destructive button away');

/* ------------------------------------- 1. no token without a key ---------- */

/**
 * The states that matter are the ones you cannot click your way into, so the
 * preview takes them from the query string.
 */
async function koppelingen(query) {
  await page.goto(`${BASE}/dev/beheer${query}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  return said(page.locator('section[aria-labelledby="koppelingen"]'));
}

const noKey = await koppelingen('?sleutel=nee&gekoppeld=nee&google=geen-sleutel');
if (/koppelen/.test(noKey.split('regels')[0])) {
  fail('Koppelen is offered while there is no key to store the token under');
} else pass('without an encryption key there is nothing to press');

if (!/token_encryption_key ontbreekt/.test(noKey)) {
  fail('a missing encryption key is not named');
} else pass('a missing encryption key is named, not just "niet ingesteld"');

if ((noKey.match(/token_encryption_key ontbreekt/g) ?? []).length > 1) {
  fail('the missing key is explained twice on the same card');
} else pass('the missing key is explained once');

const noCreds = await koppelingen('?sleutels=nee&gekoppeld=nee&google=niet-ingesteld');
if (!/sleutels van google staan nog niet in de omgeving/.test(noCreds)) {
  fail('missing Google credentials are not named');
} else pass('missing Google credentials read differently from a missing key');

const refused = await koppelingen('?gekoppeld=nee&google=geweigerd');
if (!/toestemming geweigerd/.test(refused)) {
  fail('a refused consent comes back to a screen that says nothing');
} else pass('a refused consent is reported rather than silently ignored');

const linked = await koppelingen('?google=gekoppeld');
if (!/google is gekoppeld/.test(linked)) fail('a successful connect is not confirmed');
else pass('a successful connect is confirmed');

/* -------------------------------------------------- 3 and 4. Historie ----- */

await page.goto(`${BASE}/dev/historie`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

const picker = page.getByRole('navigation', { name: 'Periode' });
if ((await picker.count()) !== 1) fail('no period picker on Historie');
else pass('Historie has a period picker');

for (const label of ['30 dagen', '90 dagen', 'Een jaar', 'Alles']) {
  if ((await picker.getByRole('link', { name: label }).count()) !== 1) {
    fail(`the picker is missing "${label}"`);
  }
}
pass('the picker offers 30, 90, 365 and everything');

const current = picker.locator('[aria-current="page"]');
if ((await current.count()) !== 1) fail('the picker marks no current period');
else pass(`the current period is marked: ${(await current.innerText()).trim()}`);

for (const [label, expected] of [['30 dagen', '?dagen=30'], ['Alles', '?dagen=alles']]) {
  const href = await picker.getByRole('link', { name: label }).getAttribute('href');
  if (!href?.endsWith(expected)) fail(`"${label}" links to ${href}, not ${expected}`);
}
pass('every period is a plain link, so it survives a reload and a bookmark');

/**
 * "27 jul 2026" as a day number.
 *
 * Date.parse only knows the English abbreviations, and half the Dutch ones —
 * mei, mrt, okt — are not among them. Relying on it would let this check pass
 * on a NaN, which is worse than not having it.
 */
const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
function dutchDay(text) {
  const [day, month, year] = text.trim().split(' ');
  const index = MONTHS.indexOf(month.replace('.', ''));
  if (index < 0) throw new Error(`onbekende maand in "${text}"`);
  return Date.UTC(Number(year), index, Number(day)) / 86400000;
}

// Each window draws the days it says, and the picker marks the one you are on.
for (const [range, days] of [['30', 30], ['90', 90], ['365', 365]]) {
  await page.goto(`${BASE}/dev/historie?dagen=${range}`, { waitUntil: 'networkidle' });
  const span = await said(page.locator('section[aria-labelledby="verloop"] > div > span'));
  const [from, to] = span.split(' tot ').map(dutchDay);
  const drawn = to - from + 1;
  const marked = await said(page.locator('[aria-current="page"]'));

  if (!marked.startsWith(range === '365' ? 'een jaar' : range)) {
    fail(`?dagen=${range} marks "${marked}" as current`);
  } else if (drawn !== days) {
    fail(`?dagen=${range} draws ${drawn} days, not ${days}`);
  } else pass(`?dagen=${range} draws ${days} days and marks itself`);
}

await page.goto(`${BASE}/dev/historie?dagen=alles`, { waitUntil: 'networkidle' });
if (!(await said(page.locator('[aria-current="page"]'))).startsWith('alles')) {
  fail('?dagen=alles does not mark itself');
} else pass('?dagen=alles reaches back to the first thing logged');

await page.goto(`${BASE}/dev/historie?dagen=zeventien`, { waitUntil: 'networkidle' });
if (!(await said(page.locator('[aria-current="page"]'))).startsWith('90')) {
  fail('an unknown period is not treated as the default');
} else pass('an unknown period falls back to ninety days rather than erroring');

const seizoenen = page.locator('section[aria-labelledby="seizoenen"]');
const text = await said(seizoenen.locator('li', { hasText: 'S02' }).first());

const missing = [
  ['the theme', /hersteld/],
  ['what the theme means', /roestte en kwam er weer bovenop/],
  ['the total XP', /8420/],
  ['the levels gained', /\+11/],
  ['the quests completed', /9 opdrachten/],
  ['the longest streak', /23 d/],
  ['the split per skill', /werk 3120 xp/],
].filter(([, pattern]) => !pattern.test(text));

if (missing.length > 0) {
  for (const [what] of missing) fail(`the season summary does not show ${what}`);
  console.log(`      it says: ${text}`);
} else pass('a finished season shows what it consisted of');

const older = await said(seizoenen.locator('li', { hasText: 'S01' }).first());
if (!/alleen de badge is bewaard/.test(older)) {
  fail(`a season from before the summary does not say so: ${older}`);
} else pass('a season from before the summary says so, rather than showing zeroes');

await browser.close();

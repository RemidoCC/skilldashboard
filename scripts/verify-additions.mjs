import { chromium } from 'playwright';

/** Checks the four additions in the real UI, not just in the types. */
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();

const fail = (m) => { console.log(`FAIL  ${m}`); process.exitCode = 1; };
const pass = (m) => console.log(`ok    ${m}`);

const mutations = () => page.evaluate(async () => {
  const open = indexedDB.open('skillunit');
  const db = await new Promise((r, j) => { open.onsuccess = () => r(open.result); open.onerror = () => j(open.error); });
  if (!db.objectStoreNames.contains('pending-mutations')) return [];
  const req = db.transaction('pending-mutations', 'readonly').objectStore('pending-mutations').getAll();
  return new Promise((r) => { req.onsuccess = () => r(req.result); });
});

// ---------------------------------------------- 2. capacity on Sunday --
await page.goto(`${BASE}/dev/vandaag?theme=day`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1400);

if ((await page.locator('text=Hoe wordt de komende week').count()) !== 1) fail('the report does not ask for the coming week');
else pass('the report asks for the coming week');

await ctx.setOffline(true);
await page.getByRole('button', { name: 'Rustig' }).click();
await page.waitForTimeout(500);
const cap = (await mutations()).find((m) => m.mutation.kind === 'week.capacity');
if (!cap) fail('choosing a capacity queued nothing');
else if (cap.mutation.weekStart === '2026-08-24') fail(`capacity was written to the wrong week: ${cap.mutation.weekStart}`);
else pass(`capacity queued for the coming week (${cap.mutation.weekStart}, ${cap.mutation.capacity})`);

// ------------------------------------------------- 4. pick your three --
await page.getByRole('button', { name: 'Kies uit je taken' }).click();
await page.waitForTimeout(300);
const putBtn = page.getByRole('button', { name: /op vandaag zetten$/ }).first();
if ((await putBtn.count()) === 0) fail('no task offered to put on today');
else {
  await putBtn.click();
  await page.waitForTimeout(400);
  const put = (await mutations()).find((m) => m.mutation.kind === 'task.update' && m.mutation.patch?.onToday === true);
  if (!put) fail('putting a task on today queued nothing');
  else pass('a task can be put on today without leaving Vandaag');
}
await ctx.setOffline(false);

// ------------------------------------------------------ 1. reverting --
await page.goto(`${BASE}/dev/historie?theme=day`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

if ((await page.getByRole('button', { name: 'Terugdraaien' }).count()) === 0) fail('no revert control in the log');
else pass(`revert offered on ${await page.getByRole('button', { name: 'Terugdraaien' }).count()} entries`);

// Rust and quest bonuses must not offer one.
const rustRow = page.locator('li', { hasText: 'roestte een niveau' });
if ((await rustRow.count()) > 0 && (await rustRow.getByRole('button', { name: 'Terugdraaien' }).count()) > 0) {
  fail('rust offers a revert, which it must not');
} else pass('rust offers no revert');

await ctx.setOffline(true);
await page.getByRole('button', { name: 'Terugdraaien' }).first().click();
await page.waitForTimeout(200);
if ((await page.locator('text=XP terug, opdracht mee').count()) === 0) fail('no confirmation before reverting');
else pass('reverting asks first, and says what it will do');

await page.getByRole('button', { name: /^Doe maar/ }).click();
await page.waitForTimeout(500);
const rev = (await mutations()).find((m) => m.mutation.kind === 'entry.revert');
if (!rev) fail('confirming a revert queued nothing');
else pass('revert queued, and works offline like everything else');
await ctx.setOffline(false);

// ------------------------------------------------------ 3. sign out --
await page.goto(`${BASE}/dev/beheer?theme=day`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

if ((await page.getByRole('button', { name: 'Uitloggen' }).count()) === 0) fail('no sign-out control');
else pass('sign-out is offered');

await page.getByRole('button', { name: 'Uitloggen', exact: true }).click();
await page.waitForTimeout(300);
if ((await page.getByRole('button', { name: 'Uitloggen en wissen' }).count()) === 0) fail('sign-out does not confirm');
else pass('sign-out asks first, and says the device copy goes too');

await browser.close();

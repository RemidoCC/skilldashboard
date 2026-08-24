import { chromium } from 'playwright';

/**
 * Phase 3 claims every edit in Beheer works offline and reconciles later.
 * This drives the real screen with the network cut to check that: the edit
 * shows immediately, it is queued, it survives a reload, and it drains in the
 * order it was made once the connection returns.
 */
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();

const fail = (m) => { console.log(`FAIL  ${m}`); process.exitCode = 1; };
const pass = (m) => console.log(`ok    ${m}`);

const rowsIn = (store) => page.evaluate(async (name) => {
  const open = indexedDB.open('skillunit');
  const db = await new Promise((res, rej) => {
    open.onsuccess = () => res(open.result);
    open.onerror = () => rej(open.error);
  });
  if (!db.objectStoreNames.contains(name)) return [];
  const req = db.transaction(name, 'readonly').objectStore(name).getAll();
  return new Promise((res) => { req.onsuccess = () => res(req.result); });
}, store);

await page.goto(`${BASE}/dev/beheer?theme=day`, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);

if ((await page.locator('text=Gezondheid').count()) === 0) fail('Beheer did not render');
else pass('Beheer renders');

// ------------------------------------------------------------- offline --
await context.setOffline(true);
pass('network cut');

// 1. Switch a skill off.
await page.locator('li', { hasText: 'Gezondheid' }).getByRole('button', { name: 'Aan' }).first().click();
await page.waitForTimeout(400);
const off = await page.locator('li', { hasText: 'Gezondheid' }).getByRole('button', { name: 'Uit' }).count();
if (off === 0) fail('switching a skill off did not show');
else pass('skill switched off, immediately');

// 2. Create a task.
await page.getByRole('button', { name: 'Taak toevoegen' }).click();
await page.getByLabel('Nieuwe taak').fill('Offerte nakijken');
await page.getByRole('button', { name: 'Aanmaken' }).click();
await page.waitForTimeout(500);
if ((await page.locator('text=Offerte nakijken').count()) === 0) fail('the new task did not appear');
else pass('task created, immediately');

// 3. Put it on today.
await page.locator('li', { hasText: 'Offerte nakijken' }).getByRole('button', { name: 'Vandaag' }).click();
await page.waitForTimeout(400);

const queued = await rowsIn('pending-mutations');
if (queued.length !== 3) fail(`expected 3 queued edits, found ${queued.length}`);
else pass(`3 edits queued: ${queued.map((q) => q.mutation.kind).join(', ')}`);

const order = queued.map((q) => q.queueId);
if (order.join('|') !== [...order].sort().join('|')) fail('the queue is not in the order the edits were made');
else pass('queue holds the order the edits were made');

const bar = await page.locator('text=in de wachtrij').count();
if (bar !== 1) fail('the sync bar did not report the queued edits');
else pass('sync bar reports the queued edits');

// --------------------------------------------------- survives a reload --
await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
await page.waitForTimeout(1200);
if ((await rowsIn('pending-mutations')).length !== 3) fail('the edits did not survive a reload');
else pass('edits survive a reload while offline');

// ------------------------------------------------------------ reconnect --
await context.setOffline(false);
await page.goto(`${BASE}/dev/beheer?theme=day`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

if ((await rowsIn('pending-mutations')).length !== 0) fail('the queue did not drain on reconnect');
else pass('queue drained on reconnect');

// No session in the preview, so every edit comes back 401 — permanent, and
// each one must be named rather than silently dropped.
const parked = await rowsIn('failed-completions');
if (parked.length !== 3) fail(`expected 3 reported failures, found ${parked.length}`);
else pass(`each failed edit named: ${parked.map((p) => p.title).join(' / ')}`);

await browser.close();

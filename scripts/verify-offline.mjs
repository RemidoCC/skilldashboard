import { chromium } from 'playwright';

/**
 * Drives the real app with the network cut, to prove the three claims phase 2
 * makes: a completion works offline, it survives a reload, and a write that
 * can never succeed is reported rather than silently dropped.
 */
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();

const fail = (m) => { console.log(`FAIL  ${m}`); process.exitCode = 1; };
const pass = (m) => console.log(`ok    ${m}`);

/* Opens without a version so the check never fights the app over upgrades. */
const rowsIn = (store) => page.evaluate(async (storeName) => {
  const open = indexedDB.open('skillunit');
  const db = await new Promise((res, rej) => {
    open.onsuccess = () => res(open.result);
    open.onerror = () => rej(open.error);
  });
  if (!db.objectStoreNames.contains(storeName)) return 0;
  const req = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
  return new Promise((res) => { req.onsuccess = () => res(req.result.length); });
}, store);

const queueCount = () => rowsIn('pending-completions');

const statusLine = () => page.locator('section[aria-label="Instrument"] p[aria-live="polite"]').innerText();

await page.goto(`${BASE}/dev/vandaag?theme=day`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

const before = await statusLine();
if (!before.includes('145')) fail(`expected the seeded 145 XP on the display, got "${before}"`);
else pass(`display starts at the server value: "${before}"`);

// ---------------------------------------------------------------- offline --
await context.setOffline(true);
pass('network cut');

await page.getByRole('button', { name: 'Offerte afmaken afvinken' }).click();
await page.waitForTimeout(800);

const after = await statusLine();
// 30 XP at a 6-day streak is 32, so the day total should read 177.
if (!after.includes('177')) fail(`expected 177 XP after an offline completion, got "${after}"`);
else pass(`completion counted while offline: "${after}"`);

const queued = await queueCount();
if (queued !== 1) fail(`expected 1 queued write, found ${queued}`);
else pass('write is sitting in IndexedDB');

const bar = page.locator('section[aria-label="Verbinding"]');
if ((await bar.locator('text=in de wachtrij').count()) !== 1) {
  fail('the sync bar did not report the queue');
} else pass('sync bar reports the queue');

const offlineLabel = await bar.locator('text=Geen verbinding').count();
if (offlineLabel < 1) fail('the sync bar did not report the lost connection');
else pass('sync bar reports the lost connection');

// ----------------------------------------------------- survives a reload --
await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
await page.waitForTimeout(1200);

const afterReload = await queueCount();
if (afterReload !== 1) fail(`queue did not survive a reload: ${afterReload} rows`);
else pass('queue survives a reload while still offline');

// ------------------------------------------------------------- reconnect --
await context.setOffline(false);
await page.goto(`${BASE}/dev/vandaag?theme=day`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

const drained = await queueCount();
if (drained !== 0) fail(`queue did not drain on reconnect: ${drained} rows left`);
else pass('queue drained on reconnect');

// No session in this preview, so the server answers 401 — a permanent
// failure. It must be surfaced, not swallowed.
const alerts = page.locator('[role="alert"]');
const reported = await alerts.count();
const alertText = reported > 0 ? (await alerts.first().innerText()).trim() : '';
if (alertText === '') fail('a permanently failed write was dropped without telling anyone');
else pass(`permanent failure surfaced: "${alertText}"`);

// A failure must survive a reload until it is actually acknowledged.
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
if ((await rowsIn('failed-completions')) !== 1) fail('the failure did not survive a reload');
else pass('failure survives a reload until dismissed');

await page.getByRole('button', { name: 'Sluiten' }).first().click();
await page.waitForTimeout(600);
if ((await rowsIn('failed-completions')) !== 0) fail('dismissing did not clear the failure');
else pass('dismissing clears it for good');

// ------------------------------------------------------- service worker --
const swState = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration('/');
  return reg ? (reg.active ? 'active' : 'registered') : 'none';
});
if (swState !== 'active') fail(`service worker is ${swState}, expected active`);
else pass('service worker active');

// With the network gone and nothing cached for this URL, the worker has to
// serve the offline shell rather than a browser error page.
await context.setOffline(true);
const response = await page.goto(`${BASE}/historie`, { waitUntil: 'domcontentloaded' }).catch(() => null);
const shell = await page.locator('text=Geen verbinding').count();
if (!response || shell === 0) fail('offline navigation did not fall back to the shell');
else pass('offline navigation falls back to the shell');

await browser.close();

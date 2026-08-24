import { chromium } from 'playwright';

/**
 * Checks the installability criteria directly.
 *
 * Lighthouse dropped its PWA category in v12, so there is no score to point
 * at any more. These are the conditions Chromium actually applies before it
 * will offer to install, checked one by one against the running build.
 */
const BASE = process.env.BASE_URL ?? 'http://localhost:3100';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' });
const page = await browser.newPage();

const fail = (m) => { console.log(`FAIL  ${m}`); process.exitCode = 1; };
const pass = (m) => console.log(`ok    ${m}`);

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });

// -- manifest -----------------------------------------------------------
const linked = await page.locator('link[rel="manifest"]').getAttribute('href');
if (!linked) fail('no <link rel="manifest">');
else pass(`manifest linked at ${linked}`);

const res = await page.request.get(`${BASE}/manifest.webmanifest`);
if (!res.ok()) fail(`manifest not served: ${res.status()}`);
else pass(`manifest served (${res.status()}, ${res.headers()['content-type']})`);

const manifest = await res.json();
const required = ['name', 'short_name', 'start_url', 'display', 'icons'];
const missing = required.filter((k) => manifest[k] === undefined);
if (missing.length) fail(`manifest missing: ${missing.join(', ')}`);
else pass('manifest has every required field');

if (!['standalone', 'fullscreen', 'minimal-ui'].includes(manifest.display)) {
  fail(`display "${manifest.display}" is not installable`);
} else pass(`display is ${manifest.display}`);

// Chromium needs at least one icon of 192px or more, and one of 512 for splash.
const sizes = manifest.icons.map((i) => parseInt(i.sizes, 10));
if (!sizes.some((s) => s >= 192)) fail('no icon of 192px or larger');
else pass('has an icon of at least 192px');
if (!sizes.includes(512)) fail('no 512px icon for the splash screen');
else pass('has a 512px icon');

const maskable = manifest.icons.filter((i) => (i.purpose ?? '').includes('maskable'));
if (maskable.length === 0) fail('no maskable icon, so Android will letterbox it');
else pass(`${maskable.length} maskable icons`);

for (const icon of manifest.icons) {
  const iconRes = await page.request.get(`${BASE}${icon.src}`);
  if (!iconRes.ok()) fail(`icon ${icon.src} is ${iconRes.status()}`);
}
pass('every icon in the manifest resolves');

// -- start_url ----------------------------------------------------------
// It may redirect when signed out, but it must not 404.
const start = await page.request.get(`${BASE}${manifest.start_url}`, { maxRedirects: 0 });
if (start.status() >= 400) fail(`start_url ${manifest.start_url} is ${start.status()}`);
else pass(`start_url reachable (${start.status()})`);

// -- service worker -----------------------------------------------------
const sw = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration('/');
  if (!reg) return null;
  await navigator.serviceWorker.ready;
  return { scope: reg.scope, active: Boolean(reg.active) };
});
if (!sw) fail('no service worker registered');
else if (!sw.active) fail('service worker registered but never activated');
else pass(`service worker active at scope ${sw.scope}`);

const swSource = await (await page.request.get(`${BASE}/sw.js`)).text();
if (!swSource.includes("addEventListener('fetch'")) {
  fail('the worker has no fetch handler, which Chromium requires');
} else pass('worker has a fetch handler');

// -- viewport and theme -------------------------------------------------
const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
if (!viewport?.includes('width=device-width')) fail('viewport is not responsive');
else pass('viewport is responsive');

const theme = await page.locator('meta[name="theme-color"]').count();
if (theme === 0) fail('no theme-color, so the status bar will not match');
else pass('theme-color present');

const apple = await page.locator('link[rel="apple-touch-icon"]').count();
if (apple === 0) fail('no apple-touch-icon, so iOS installs a screenshot');
else pass('apple-touch-icon present');

await browser.close();

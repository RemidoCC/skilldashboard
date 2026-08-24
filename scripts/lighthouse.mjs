import { chromium } from 'playwright';
import lighthouse from 'lighthouse';

/**
 * Measures the production build on a throttled mobile profile.
 *
 * /vandaag needs a session, which this environment cannot create, so the
 * measured route is /login — it loads the same shared bundle, the same fonts
 * and the same worker registration, which is what the score is dominated by.
 */
const URL_UNDER_TEST = process.env.LH_URL ?? 'http://localhost:3100/login';

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  args: ['--remote-debugging-port=9222'],
});

const result = await lighthouse(
  URL_UNDER_TEST,
  { port: 9222, output: 'json', logLevel: 'error', formFactor: 'mobile', screenEmulation: { mobile: true, width: 390, height: 844, deviceScaleFactor: 2, disabled: false } },
  undefined,
);

const lhr = result.lhr;
const pct = (n) => Math.round((n ?? 0) * 100);

console.log(`url          ${URL_UNDER_TEST}`);
for (const [key, category] of Object.entries(lhr.categories)) {
  console.log(`${key.padEnd(13)}${String(pct(category.score)).padStart(3)}`);
}

console.log('\nkey metrics');
for (const id of ['first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift', 'speed-index']) {
  const audit = lhr.audits[id];
  if (audit) console.log(`  ${id.padEnd(28)} ${String(audit.displayValue ?? '').padStart(10)}`);
}

console.log('\ninstallability');
for (const id of ['installable-manifest', 'service-worker', 'maskable-icon', 'apple-touch-icon', 'themed-omnibox', 'viewport']) {
  const audit = lhr.audits[id];
  if (!audit) continue;
  const mark = audit.score === 1 ? 'pass' : audit.score === null ? 'n/a ' : 'FAIL';
  console.log(`  ${mark}  ${id}${audit.explanation ? ` — ${audit.explanation}` : ''}`);
}

const failures = Object.values(lhr.audits).filter(
  (a) => a.score !== null && a.score < 1 && ['error', 'warning'].includes(a.scoreDisplayMode) === false && a.group === 'a11y-names-labels',
);
if (failures.length) console.log('\naccessibility gaps:', failures.map((f) => f.id).join(', '));

await browser.close();

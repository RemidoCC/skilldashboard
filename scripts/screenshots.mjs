import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT = 'docs/screenshots';

/* A fixed bottom bar lands in the middle of a full-page capture, which makes
   the design impossible to review. Full-page shots hide it; a separate
   viewport shot shows it where it actually sits. */
const HIDE_NAV = 'nav[aria-label="Hoofdnavigatie"] { display: none !important; }';

/* Beheer and Historie are stubs until phase 3 and sit behind the session
   redirect, so there is nothing to capture there yet. */
const pages = [
  { slug: 'vandaag', path: '/dev/vandaag' },
  { slug: 'beheer', path: '/dev/beheer' },
  { slug: 'historie', path: '/dev/historie' },
  { slug: 'login', path: '/login' },
];
const themes = ['day', 'night'];
const widths = [360, 390];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' });

for (const page of pages) {
  for (const theme of themes) {
    for (const width of widths) {
      const context = await browser.newContext({
        viewport: { width, height: 800 },
        deviceScaleFactor: 2,
      });
      const tab = await context.newPage();
      await tab.goto(`${BASE}${page.path}?theme=${theme}`, { waitUntil: 'networkidle' });
      // Wait out the 600ms self-test so needles and dots show real values.
      await tab.waitForTimeout(1400);

      await tab.addStyleTag({ content: HIDE_NAV });
      const name = `${page.slug}-${theme === 'day' ? 'dag' : 'nacht'}-${width}`;
      await tab.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

      // One viewport-height shot per page/theme, with the tab bar in place.
      if (width === 390) {
        await tab.addStyleTag({ content: 'nav[aria-label="Hoofdnavigatie"] { display: block !important; }' });
        await tab.screenshot({ path: `${OUT}/${page.slug}-${theme === 'day' ? 'dag' : 'nacht'}-viewport.png` });
      }
      console.log(name);
      await context.close();
    }
  }
}

/* The offline state is part of the product now, so it gets captured too. */
for (const theme of themes) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const tab = await context.newPage();
  await tab.goto(`${BASE}/dev/vandaag?theme=${theme}`, { waitUntil: 'networkidle' });
  await tab.waitForTimeout(1400);

  await context.setOffline(true);
  await tab.getByRole('button', { name: 'Offerte afmaken afvinken' }).click();
  await tab.waitForTimeout(900);

  await tab.addStyleTag({ content: HIDE_NAV });
  const name = `vandaag-offline-${theme === 'day' ? 'dag' : 'nacht'}`;
  await tab.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(name);
  await context.close();
}

await browser.close();

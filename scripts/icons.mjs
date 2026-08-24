import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

/**
 * Renders the app icon: the gauge, in the instrument's own language. Drawn
 * from the same geometry as components/instrument/Meter.tsx so the icon and
 * the product are recognisably the same object.
 */
const SWEEP = 240;
const START = -SWEEP / 2;
const TICKS = 41;

function gauge({ size, inset }) {
  const c = size / 2;
  const radius = (size / 2) * inset;
  const point = (deg, r) => {
    const rad = (deg * Math.PI) / 180;
    return { x: c + r * Math.sin(rad), y: c - r * Math.cos(rad) };
  };

  // Lit to just past the top, so the needle sits where a working meter would.
  const filled = 0.62;
  let ticks = '';
  for (let i = 0; i < TICKS; i += 1) {
    const deg = START + (SWEEP * i) / (TICKS - 1);
    const long = i % 5 === 0;
    const outer = point(deg, radius);
    const inner = point(deg, radius - radius * (long ? 0.22 : 0.13));
    const on = i / (TICKS - 1) <= filled;
    ticks += `<line x1="${inner.x.toFixed(2)}" y1="${inner.y.toFixed(2)}" x2="${outer.x.toFixed(2)}" y2="${outer.y.toFixed(2)}" stroke="${on ? '#FF4A00' : 'rgba(255,255,255,.20)'}" stroke-width="${(size * (long ? 0.026 : 0.016)).toFixed(2)}" stroke-linecap="butt"/>`;
  }

  const needleDeg = START + SWEEP * filled;
  const tip = point(needleDeg, radius * 0.72);

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#14161A"/>
  ${ticks}
  <line x1="${c}" y1="${c}" x2="${tip.x.toFixed(2)}" y2="${tip.y.toFixed(2)}"
        stroke="#E8E7E1" stroke-width="${(size * 0.03).toFixed(2)}" stroke-linecap="round"/>
  <circle cx="${c}" cy="${c}" r="${(size * 0.055).toFixed(2)}" fill="#FF4A00"/>
  <circle cx="${c}" cy="${c}" r="${(size * 0.021).toFixed(2)}" fill="#14161A"/>
</svg>`;
}

await mkdir('public/icons', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' });

const jobs = [
  // "any" fills the square; the platform rounds the corners itself.
  { file: 'icon-192.png', size: 192, inset: 0.82 },
  { file: 'icon-512.png', size: 512, inset: 0.82 },
  // Maskable keeps everything inside the circular safe zone, so the gauge
  // survives whatever shape Android crops it to.
  { file: 'maskable-192.png', size: 192, inset: 0.58 },
  { file: 'maskable-512.png', size: 512, inset: 0.58 },
  { file: 'apple-touch-icon.png', size: 180, inset: 0.78 },
];

for (const job of jobs) {
  const context = await browser.newContext({ viewport: { width: job.size, height: job.size } });
  const page = await context.newPage();
  await page.setContent(
    `<body style="margin:0">${gauge(job)}</body>`,
    { waitUntil: 'load' },
  );
  await page.screenshot({ path: `public/icons/${job.file}`, omitBackground: false });
  console.log(`${job.file}  ${job.size}x${job.size}`);
  await context.close();
}

await browser.close();

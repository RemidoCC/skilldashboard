export type ThemePreference = 'auto' | 'day' | 'night';
export type Theme = 'day' | 'night';

export const THEME_STORAGE_KEY = 'skillunit.theme';

/** Amsterdam. The panel follows the light where the user actually is. */
export const LATITUDE = 52.3676;
export const LONGITUDE = 4.9041;

/**
 * Runs before first paint so the panel is never briefly the wrong colour.
 *
 * Deliberately self-contained: layout.tsx inlines this function by calling
 * .toString() on it, so it must not reference anything outside its own body.
 * The sunrise/sunset maths is the standard NOAA approximation, which is
 * accurate to about a minute — far more than a colour switch needs.
 */
export function themeBoot(): void {
  const STORAGE_KEY = 'skillunit.theme';
  const LAT = 52.3676;
  const LON = 4.9041;

  function sunEventUtcMinutes(date: Date, rising: boolean): number | null {
    const rad = Math.PI / 180;
    const start = Date.UTC(date.getUTCFullYear(), 0, 0);
    const dayOfYear = Math.floor(
      (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start) / 86400000,
    );

    const lngHour = LON / 15;
    const t = dayOfYear + ((rising ? 6 : 18) - lngHour) / 24;
    const m = 0.9856 * t - 3.289;
    let l = m + 1.916 * Math.sin(m * rad) + 0.02 * Math.sin(2 * m * rad) + 282.634;
    l = ((l % 360) + 360) % 360;

    let ra = Math.atan(0.91764 * Math.tan(l * rad)) / rad;
    ra = ((ra % 360) + 360) % 360;
    ra += Math.floor(l / 90) * 90 - Math.floor(ra / 90) * 90;
    ra /= 15;

    const sinDec = 0.39782 * Math.sin(l * rad);
    const cosDec = Math.cos(Math.asin(sinDec));

    // 90.833 degrees is the official zenith: the sun's disc plus refraction.
    const cosH =
      (Math.cos(90.833 * rad) - sinDec * Math.sin(LAT * rad)) / (cosDec * Math.cos(LAT * rad));
    // Polar day or polar night — no event today.
    if (cosH > 1 || cosH < -1) return null;

    let h = rising ? 360 - Math.acos(cosH) / rad : Math.acos(cosH) / rad;
    h /= 15;

    const localMean = h + ra - 0.06571 * t - 6.622;
    const utc = ((((localMean - lngHour) % 24) + 24) % 24);
    return utc * 60;
  }

  function resolve(): 'day' | 'night' {
    const now = new Date();
    const sunrise = sunEventUtcMinutes(now, true);
    const sunset = sunEventUtcMinutes(now, false);
    if (sunrise === null || sunset === null) return 'day';

    const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    return minutes >= sunrise && minutes < sunset ? 'day' : 'night';
  }

  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private mode or blocked storage: fall through to auto.
  }

  // ?theme= wins for one page load. Used by the screenshot pass.
  let forced: string | null = null;
  try {
    forced = new URLSearchParams(location.search).get('theme');
  } catch {
    // No location (shouldn't happen in a browser), fall through.
  }

  const choice = forced || stored || 'auto';
  const theme = choice === 'day' || choice === 'night' ? choice : resolve();
  document.documentElement.setAttribute('data-theme', theme);

  /* The status bar of an installed app follows <meta name="theme-color">, and
     the two the layout ships are keyed to prefers-color-scheme. This panel
     follows sunset in Amsterdam instead, so on a light phone after dark the
     bar stayed paper while the app went dark. Only the resolver knows which
     it is, so it says so. */
  try {
    const colour = theme === 'night' ? '#1A1B19' : '#E4E3DE';
    let tag = document.querySelector('meta[name="theme-color"]:not([media])');
    if (!tag) {
      tag = document.createElement('meta');
      tag.setAttribute('name', 'theme-color');
      document.head.appendChild(tag);
    }
    tag.setAttribute('content', colour);
  } catch {
    // No document head to speak of; the media-keyed tags still apply.
  }
}

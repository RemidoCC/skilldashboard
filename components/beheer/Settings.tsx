'use client';

import { useEffect, useState } from 'react';
import { useOffline } from '@/components/offline/OfflineProvider';
import { HAPTICS_KEY, SOUND_KEY, click, setPreference, hapticsEnabled, soundEnabled } from '@/lib/feedback';
import { THEME_STORAGE_KEY, type ThemePreference } from '@/lib/theme';
import { CAPACITIES } from '@/lib/domain/capacity';
import { checkRestore, restoreCounts } from '@/lib/domain/restore';
import { SignOut } from './SignOut';
import type { Capacity } from '@/lib/domain/types';

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'auto', label: 'Automatisch' },
  { value: 'day', label: 'Dag' },
  { value: 'night', label: 'Nacht' },
];

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="raised px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] leading-tight">{label}</p>
          {hint ? (
            // A sentence, so it is set as one. .label is a two-word microlabel
            // and renders in caps at 9px; a sentence run through it wraps to
            // two lines of spaced capitals with a full stop on the end.
            <span className="mt-0.5 block text-[12px]" style={{ color: 'var(--muted)' }}>
              {hint}
            </span>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  );
}

function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      // Starts with the visible word, so "klik Aan" reaches it (WCAG 2.5.3).
      aria-label={`${on ? 'Aan' : 'Uit'}, ${label}`}
      onClick={() => onChange(!on)}
      className="recess h-11 shrink-0 px-3 text-[12px]"
      style={{
        background: on ? 'var(--ink)' : undefined,
        color: on ? 'var(--panel)' : 'var(--ink)',
      }}
    >
      {on ? 'Aan' : 'Uit'}
    </button>
  );
}

export function Settings({ capacity, weekStart }: { capacity: Capacity; weekStart: string }) {
  const { mutate } = useOffline();
  const [sound, setSound] = useState(false);
  const [haptics, setHaptics] = useState(true);
  const [theme, setTheme] = useState<ThemePreference>('auto');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Read on mount so server and first client render agree.
  useEffect(() => {
    setSound(soundEnabled());
    setHaptics(hapticsEnabled());
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'day' || stored === 'night' || stored === 'auto') setTheme(stored);
    } catch {
      // Storage blocked; auto stands.
    }
  }, []);

  function chooseTheme(next: ThemePreference) {
    setTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Nothing to do; the choice just will not persist.
    }
    // Applied immediately rather than on the next load.
    if (next === 'auto') {
      location.reload();
    } else {
      document.documentElement.setAttribute('data-theme', next);
    }
  }

  async function exportJson() {
    setExporting(true);
    setExportError(null);
    try {
      const response = await fetch('/api/export');
      if (!response.ok) {
        setExportError(
          response.status === 401
            ? 'Je sessie is verlopen. Log opnieuw in en probeer het nog eens.'
            : 'De export kwam er niet uit. Probeer het zo nog eens.',
        );
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `skill-unit-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError('Geen verbinding. Een export moet online opgehaald worden.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <section aria-labelledby="instellingen">
      <h2 id="instellingen" className="label">
        Instellingen
      </h2>

      <div className="mt-2 space-y-2">
        <Row label="Geluid" hint="Eén droge klik bij een voltooiing.">
          <Toggle
            on={sound}
            label="Geluid"
            onChange={(next) => {
              setSound(next);
              setPreference(SOUND_KEY, next);
              // Play it once so the choice is audible rather than theoretical.
              if (next) click();
            }}
          />
        </Row>

        <Row label="Trillen" hint="Kort bij een voltooiing, dubbel bij een niveau.">
          <Toggle
            on={haptics}
            label="Trillen"
            onChange={(next) => {
              setHaptics(next);
              setPreference(HAPTICS_KEY, next);
            }}
          />
        </Row>
      </div>

      <fieldset className="mt-3">
        <legend className="label">Nachtpaneel</legend>
        <div className="mt-1.5 flex gap-1.5">
          {THEMES.map((option) => {
            const selected = option.value === theme;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => chooseTheme(option.value)}
                aria-pressed={selected}
                className="raised h-11 flex-1 px-3 text-[12px]"
                style={{
                  background: selected ? 'var(--ink)' : undefined,
                  color: selected ? 'var(--panel)' : 'var(--ink)',
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-[12px]" style={{ color: 'var(--muted)' }}>
          Automatisch volgt zonsondergang in Amsterdam.
        </p>
      </fieldset>

      <fieldset className="mt-4">
        <legend className="label">Weekstand</legend>
        <div className="mt-1.5 space-y-2">
          {CAPACITIES.map((option) => {
            const selected = option.value === capacity;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => void mutate({ kind: 'week.capacity', weekStart, capacity: option.value })}
                aria-pressed={selected}
                className="raised flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                style={{
                  background: selected ? 'var(--ink)' : undefined,
                  color: selected ? 'var(--panel)' : 'var(--ink)',
                }}
              >
                <span>
                  <span className="block text-[14px] leading-tight">{option.label}</span>
                  <span
                    className="mt-0.5 block text-[12px]"
                    style={{ color: selected ? 'var(--panel)' : 'var(--muted)' }}
                  >
                    {option.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <SignOut />

      <div className="mt-4">
        <h3 className="label">Export</h3>
        <p className="mt-1 text-[13px]">
          Alles wat het toestel van je bewaart, als JSON. Het logboek zit erbij, dus hieruit is elk
          niveau opnieuw te berekenen.
        </p>
        {exportError ? (
          <p className="mt-2 text-[12px]" style={{ color: 'var(--signal-text)' }} role="alert">
            {exportError}
          </p>
        ) : null}
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={exportJson}
            disabled={exporting}
            className="raised h-11 px-5 text-[13px]"
            style={{ background: 'var(--signal-fill)', color: 'var(--on-signal)' }}
          >
            {exporting ? 'Bezig' : 'Download JSON'}
          </button>
        </div>
      </div>

      <Restore />
    </section>
  );
}

/**
 * Reading an export back in.
 *
 * The only destructive thing in the app, so it behaves like one: the file is
 * checked before anything is asked, the confirmation says in numbers what is
 * about to arrive and in words what is about to go, and the last tap is a
 * separate one. The same check runs again on the server — this one is here so
 * you find out about a bad file before you commit to anything.
 */
function Restore() {
  const [file, setFile] = useState<{ name: string; text: string; counts: [string, number][] } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    setError(null);
    setConfirming(false);
    setFile(null);
    if (!chosen) return;

    const text = await chosen.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setError('Dit bestand is geen leesbare JSON.');
      return;
    }

    const check = checkRestore(parsed);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setFile({ name: chosen.name, text, counts: restoreCounts(check) });
  }

  async function send() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: file.text,
      });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !body.ok) {
        setError(body.error ?? 'Terugzetten mislukte. Er is niets veranderd.');
        setConfirming(false);
        return;
      }
      // Every screen is now looking at something that no longer exists.
      location.assign('/vandaag');
    } catch {
      setError('Geen verbinding. Terugzetten kan alleen online.');
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      <h3 className="label">Terugzetten</h3>
      <p className="mt-1 text-[13px]">
        Een eerder gedownloade export weer inlezen. Wat er nu staat wordt vervangen, niet
        aangevuld. De niveaus worden daarna opnieuw uit het logboek berekend.
      </p>

      {/* The native file control paints its own English button in its own
          style. The input stays, so the keyboard and the screen reader still
          find it; the label is what you see, and it carries the focus ring.

          The input has to be a preceding *sibling* of that label. Tailwind
          compiles peer-focus-visible to `:is(:where(.peer):focus-visible ~ *)`,
          a sibling combinator: with the input one level up the rule could never
          match, so the field took focus — it is sr-only, clipped to 1×1 — and
          nothing at all appeared on screen. First step of the only irreversible
          flow in the app, and the keyboard lost its place there. */}
      <div className="mt-2 flex justify-end">
        <input
          id="restore-file"
          type="file"
          accept="application/json,.json"
          onChange={choose}
          className="peer sr-only"
        />
        <label
          htmlFor="restore-file"
          className="raised flex h-11 cursor-pointer items-center px-5 text-[13px] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2"
          style={{ outlineColor: 'var(--focus)' }}
        >
          Kies een bestand
        </label>
      </div>

      {error ? (
        <p className="mt-2 text-[12px]" style={{ color: 'var(--signal-text)' }} role="alert">
          {error}
        </p>
      ) : null}

      {file ? (
        <div className="recess mt-2 p-3">
          <p className="text-[13px]">{file.name}</p>
          <span className="label mt-0.5 block">
            {file.counts.map(([name, n]) => `${n} ${name}`).join(' · ')}
          </span>

          {confirming ? (
            <div className="mt-2.5">
              <p className="text-[13px]" style={{ color: 'var(--signal-text)' }}>
                Alles wat er nu staat verdwijnt: vaardigheden, taken, logboek, seizoenen. Hier is
                geen weg terug uit.
              </p>
              <div className="mt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="label-button label underline underline-offset-2"
                >
                  Laat staan
                </button>
                <button
                  type="button"
                  onClick={send}
                  disabled={busy}
                  // The accessible name starts with the visible words, or voice
                  // control cannot reach the button by what it says (WCAG 2.5.3).
                  aria-label="Doe maar, alles vervangen door dit bestand"
                  className="raised h-11 px-5 text-[13px]"
                  style={{ background: 'var(--signal-fill)', color: 'var(--on-signal)' }}
                >
                  {busy ? 'Bezig' : 'Doe maar'}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-2.5 flex justify-end">
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="raised h-11 px-5 text-[13px]"
              >
                Terugzetten
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

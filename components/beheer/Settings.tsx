'use client';

import { useEffect, useState } from 'react';
import { useOffline } from '@/components/offline/OfflineProvider';
import { HAPTICS_KEY, SOUND_KEY, click, setPreference, hapticsEnabled, soundEnabled } from '@/lib/feedback';
import { THEME_STORAGE_KEY, type ThemePreference } from '@/lib/theme';
import type { Capacity } from '@/lib/domain/types';

const CAPACITIES: { value: Capacity; label: string; hint: string }[] = [
  { value: 'rustig', label: 'Rustig', hint: 'Lagere opdrachten, en veertien dagen voor roest.' },
  { value: 'normaal', label: 'Normaal', hint: 'Volle opdrachten, en tien dagen voor roest.' },
  { value: 'gek', label: 'Gek', hint: 'Kleinere opdrachten, en eenentwintig dagen voor roest.' },
];

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
            <span className="label mt-0.5 block">{hint}</span>
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
      aria-label={label}
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
                    className="label mt-0.5 block"
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

      <div className="mt-4">
        <span className="label">Export</span>
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
    </section>
  );
}

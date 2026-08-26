'use client';

import { useState } from 'react';
import { DB_NAME } from '@/lib/offline/types';

/**
 * Signing out, and taking the device copy with it.
 *
 * The worker caches Vandaag, Beheer and Historie network-first, so without
 * clearing them your last state stays readable on the phone after the session
 * is gone. Anything still queued goes too: it can no longer be sent, and the
 * next account would inherit it.
 */
export function SignOut() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/signout', { method: 'POST' });
      if (!response.ok) {
        setError('Uitloggen mislukte. Probeer het zo nog eens.');
        setBusy(false);
        return;
      }

      // The worker holds the cached pages; it clears them on this message.
      try {
        const registration = await navigator.serviceWorker?.getRegistration('/');
        registration?.active?.postMessage({ type: 'clear-caches' });
      } catch {
        // No worker registered; nothing cached to clear.
      }

      try {
        indexedDB.deleteDatabase(DB_NAME);
      } catch {
        // Blocked storage; the session is gone either way.
      }

      location.href = '/login';
    } catch {
      setError('Geen verbinding. Uitloggen kan alleen online.');
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      <h3 className="label">Sessie</h3>
      <p className="mt-1 text-[13px]">
        Uitloggen wist ook wat er op dit toestel bewaard is: de opgeslagen schermen en alles wat
        nog in de wachtrij stond.
      </p>

      {error ? (
        <p className="mt-2 text-[12px]" style={{ color: 'var(--signal-text)' }} role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-2 flex justify-end gap-2">
        {confirming ? (
          <>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="raised h-11 px-4 text-[12px]"
            >
              Blijf ingelogd
            </button>
            <button
              type="button"
              onClick={signOut}
              disabled={busy}
              className="raised h-11 px-5 text-[13px]"
              style={{ background: 'var(--signal-fill)', color: 'var(--on-signal)' }}
            >
              {busy ? 'Bezig' : 'Uitloggen en wissen'}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="raised h-11 px-5 text-[13px]"
          >
            Uitloggen
          </button>
        )}
      </div>
    </div>
  );
}

'use client';

import { useOffline } from './OfflineProvider';

/**
 * States what the connection is doing, and only when there is something to
 * say. A quiet, fully synced app shows nothing at all.
 */
export function SyncBar() {
  const { pending, online, syncing, failures, dismissFailure } = useOffline();

  if (failures.length === 0 && pending.length === 0 && online) return null;

  return (
    <div className="mt-3 space-y-2">
      {pending.length > 0 || !online ? (
        <div className="recess flex items-center justify-between gap-3 px-3 py-2">
          <span className="label">
            {online
              ? syncing
                ? 'Bezig met versturen'
                : 'Wacht op verbinding'
              : 'Geen verbinding'}
          </span>
          <span className="value text-[13px]">
            {pending.length === 0
              ? 'alles verstuurd'
              : pending.length === 1
                ? '1 in de wachtrij'
                : `${pending.length} in de wachtrij`}
          </span>
        </div>
      ) : null}

      {failures.map((failure) => (
        <div key={failure.id} className="recess flex items-start gap-3 px-3 py-2">
          <p className="flex-1 text-[12px]" style={{ color: 'var(--signal-text)' }} role="alert">
            {/* Name what was lost, then why. A bare error hides which one it was. */}
            {failure.title}: {failure.message}
          </p>
          <button
            type="button"
            onClick={() => dismissFailure(failure.id)}
            className="label shrink-0 underline underline-offset-2"
          >
            Sluiten
          </button>
        </div>
      ))}
    </div>
  );
}

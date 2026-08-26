'use client';

import { useOffline } from './OfflineProvider';

/**
 * States what the connection is doing, and only when there is something to
 * say. A quiet, fully synced app shows nothing at all.
 *
 * The line names what was actually measured. It used to read "wacht op
 * verbinding" for every queue that was not moving, including a queue the
 * server was refusing while the connection was fine — a reading the
 * instrument had not taken. And nothing retried on its own, so that wrong
 * sentence could stand for hours with no way to act on it.
 */
export function SyncBar() {
  const { pending, mutations, online, syncing, blocked, failures, dismissFailure, retry, retryFailure } =
    useOffline();
  const queued = pending.length + mutations.length;

  if (failures.length === 0 && queued === 0 && online) return null;

  const state = !online
    ? 'Geen verbinding'
    : syncing
      ? 'Bezig met versturen'
      : blocked === 'server'
        ? 'De server nam dit niet aan'
        : blocked === 'offline'
          ? 'Het verzoek kwam niet aan'
          // Queued, and no attempt measured yet. States the fact and stops:
          // claiming a cause here is what the old wording got wrong.
          : 'Nog niet verstuurd';

  return (
    // A named region: it reports the state of the connection and the queue, so
    // it should be addressable rather than an anonymous strip of text.
    <section aria-label="Verbinding" className="mt-3 space-y-2">
      {queued > 0 || !online ? (
        <div className="recess px-3 py-2">
          {/* The state changes with no reload — while the app sits open the
              queue drains, stalls and drains again — so it is announced. */}
          <div className="flex items-center justify-between gap-3" role="status">
            <span className="label">{state}</span>
            <span className="value text-[13px]">
              {queued === 0
                ? 'alles verstuurd'
                : queued === 1
                  ? '1 in de wachtrij'
                  : `${queued} in de wachtrij`}
            </span>
          </div>

          {/* Offered whenever the queue is standing still and there is a
              network to try it on. */}
          {online && !syncing && queued > 0 ? (
            <div className="mt-1.5">
              <button
                type="button"
                onClick={() => void retry()}
                className="label-button label underline underline-offset-2"
              >
                Nu opnieuw proberen
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {failures.map((failure) => (
        <div key={failure.id} className="recess px-3 py-2">
          <p className="text-[12px]" style={{ color: 'var(--signal-text)' }} role="alert">
            {/* Name what was lost, then why. A bare error hides which one it was. */}
            {failure.title}: {failure.message}
          </p>
          {/* Dismissing is not closing a notice: the write is already out of
              the queue, so this is the last place it exists. */}
          <p className="mt-1 text-[12px]" style={{ color: 'var(--muted)' }}>
            Dit is niet opgeslagen en staat nergens anders meer.
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-4">
            {failure.signIn ? (
              <a href="/login" className="label-button label underline underline-offset-2">
                Naar het inlogscherm
              </a>
            ) : null}
            {failure.item ? (
              <button
                type="button"
                onClick={() => void retryFailure(failure.id)}
                className="label-button label underline underline-offset-2"
              >
                Opnieuw proberen
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => dismissFailure(failure.id)}
              aria-label={`Weggooien, ${failure.title}`}
              className="label-button label underline underline-offset-2"
              style={{ color: 'var(--signal-text)' }}
            >
              Weggooien
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}

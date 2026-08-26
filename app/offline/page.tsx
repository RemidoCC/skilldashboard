import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Geen verbinding — Skill Unit' };

/**
 * The shell the worker falls back to when a page is wanted that was never
 * cached. States what happened and what still works, rather than apologising.
 */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
      <div className="screen px-4 py-5">
        <h1 className="label" style={{ color: 'var(--screen-muted)' }}>
          Geen verbinding
        </h1>
        <p className="mt-2 text-[13px]" style={{ color: 'var(--screen-ink)' }}>
          Dit scherm stond nog niet op het toestel. Wat je al bekeken hebt blijft
          beschikbaar, en wat je aftekent wordt bewaard en verstuurd zodra er weer
          verbinding is.
        </p>
      </div>

      <div className="recess mt-4 p-3">
        <p className="text-[13px]">
          Ga terug naar Vandaag, of probeer het opnieuw als je weer bereik hebt.
        </p>
        <div className="mt-3 flex justify-end">
          <a
            href="/vandaag"
            className="raised flex h-12 items-center px-5 text-[13px]"
            style={{ background: 'var(--signal-fill)', color: 'var(--on-signal)' }}
          >
            Naar Vandaag
          </a>
        </div>
      </div>
    </main>
  );
}

/** The unit's nameplate: what this is, and where you are in the cycle. */
export function Header({ seasonLabel }: { seasonLabel: string | null }) {
  return (
    <header className="flex items-baseline justify-between gap-3 pt-1">
      <h1 className="label-lg label" style={{ color: 'var(--ink)' }}>
        Skill Unit
      </h1>
      {seasonLabel ? (
        <span className="label" style={{ color: 'var(--muted)' }}>
          {seasonLabel}
        </span>
      ) : null}
    </header>
  );
}

/**
 * The unit's nameplate: what this is, where you are, and where in the cycle.
 *
 * The screen name is the h1. All three screens used to carry the same one —
 * "Skill Unit" — so navigating by heading told you nothing about which screen
 * you had landed on.
 */
export function Header({ screen, seasonLabel }: { screen: string; seasonLabel?: string | null }) {
  return (
    <header className="flex items-baseline justify-between gap-3 pt-1">
      <div className="flex items-baseline gap-2">
        <h1 className="label-lg label" style={{ color: 'var(--ink)' }}>
          {screen}
        </h1>
        <span className="label">Skill Unit</span>
      </div>
      {seasonLabel ? (
        <span className="label" style={{ color: 'var(--muted)' }}>
          {seasonLabel}
        </span>
      ) : null}
    </header>
  );
}

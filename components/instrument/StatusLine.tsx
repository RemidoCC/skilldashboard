/**
 * The readings the display is showing, all of them at once.
 *
 * These used to rotate: one line every six seconds, for as long as the app was
 * open. Three things were wrong with that. It is auto-updating content past
 * five seconds with no way to pause it (WCAG 2.2.2). The `aria-live` it needed
 * interrupted a screen reader every six seconds, forever. And an instrument
 * that hides two thirds of its readings on a timer is not reporting: on the
 * measured screen, "Gezondheid staat twaalf dagen stil" — the worst number
 * there — was invisible two thirds of the time, and there was no way to hold
 * it.
 *
 * So they stack. Nothing moves, nothing is announced twice, and the reading
 * you least want to see is as permanent as the one you do.
 */
export function StatusLine({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;

  return (
    <ul className="space-y-1">
      {lines.map((line) => (
        <li key={line} className="text-[12px] leading-snug" style={{ color: 'var(--screen-ink)' }}>
          {line}
        </li>
      ))}
    </ul>
  );
}

import type { SkillTrajectory } from '@/lib/domain/trajectory';

const WIDTH = 100;
const HEIGHT = 28;

/**
 * One skill's level over the window, as a small multiple.
 *
 * A step line rather than a curve: a level is a whole number that changes on a
 * day, and smoothing it would suggest a continuity that is not there. Each
 * chart is scaled to its own skill, with the range printed beside it, because
 * a shared axis would flatten a young skill into a straight line.
 */
export function Sparkline({ trajectory }: { trajectory: SkillTrajectory }) {
  const levels = trajectory.points.map((p) => p.level);
  const low = Math.min(...levels);
  const high = Math.max(...levels);
  const span = Math.max(high - low, 1);

  const step = trajectory.points.length > 1 ? WIDTH / (trajectory.points.length - 1) : WIDTH;
  const y = (level: number) => HEIGHT - 2 - ((level - low) / span) * (HEIGHT - 4);

  // Horizontal to the next day, then vertical on the day it changed.
  let path = `M 0 ${y(levels[0]).toFixed(2)}`;
  for (let i = 1; i < levels.length; i += 1) {
    const x = (i * step).toFixed(2);
    path += ` L ${x} ${y(levels[i - 1]).toFixed(2)} L ${x} ${y(levels[i]).toFixed(2)}`;
  }

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className="h-7 w-full"
      role="img"
      aria-label={`${trajectory.name}: van niveau ${trajectory.from} naar ${trajectory.to}`}
    >
      {/* Baseline, so a flat line still reads as a measurement. */}
      <line
        x1={0}
        y1={HEIGHT - 2}
        x2={WIDTH}
        y2={HEIGHT - 2}
        stroke="var(--tick-off)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={path}
        fill="none"
        stroke="var(--ink)"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

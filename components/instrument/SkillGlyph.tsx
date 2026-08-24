import type { SkillGlyph as GlyphName } from '@/lib/domain/types';

/**
 * The fixed set of marks a skill can carry. Geometric, drawn on a 24-unit
 * grid, no emoji anywhere. New skills pick from this set.
 */
const PATHS: Record<GlyphName, React.ReactNode> = {
  square: <rect x={5} y={5} width={14} height={14} />,
  diamond: <path d="M12 3.5 20.5 12 12 20.5 3.5 12Z" />,
  ring: <circle cx={12} cy={12} r={7} />,
  wave: <path d="M3 14c2.5 0 2.5-4 5-4s2.5 4 5 4 2.5-4 5-4 2.5 4 5 4" fill="none" />,
  triangle: <path d="M12 4 20 19H4Z" />,
  cross: <path d="M10.5 4h3v6.5H20v3h-6.5V20h-3v-6.5H4v-3h6.5Z" />,
  hexagon: <path d="M12 3.5 19.4 7.75v8.5L12 20.5 4.6 16.25v-8.5Z" />,
  bars: (
    <>
      <rect x={4} y={13} width={3.6} height={7} />
      <rect x={10.2} y={8} width={3.6} height={12} />
      <rect x={16.4} y={4} width={3.6} height={16} />
    </>
  ),
};

interface Props {
  name: GlyphName;
  size?: number;
  className?: string;
  title?: string;
}

export function SkillGlyph({ name, size = 16, className, title }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      style={{ display: 'block', flexShrink: 0 }}
    >
      {title ? <title>{title}</title> : null}
      {PATHS[name]}
    </svg>
  );
}

import React from "react";

/**
 * TradingView-style line-art icons for the drawing toolbar. Thin strokes with
 * small endpoint dots, matching TV's aesthetic more closely than generic icons.
 */
type IconProps = { className?: string };

function Svg({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
    >
      {children}
    </svg>
  );
}

// Hollow anchor circle (like TradingView). Filled with the panel background so
// the line underneath is covered, leaving a clean ring. Drawn after the lines.
const Dot = ({ cx, cy }: { cx: number; cy: number }) => (
  <circle cx={cx} cy={cy} r={2.7} fill="var(--color-tv-panel)" stroke="currentColor" strokeWidth={1.3} />
);

export const TrendLineToolIcon = (p: IconProps) => (
  <Svg {...p}>
    <line x1="5" y1="19" x2="19" y2="5" />
    <Dot cx={5} cy={19} />
    <Dot cx={19} cy={5} />
  </Svg>
);

export const RayToolIcon = (p: IconProps) => (
  <Svg {...p}>
    <line x1="5" y1="19" x2="21" y2="3" />
    <Dot cx={5} cy={19} />
  </Svg>
);

export const ExtendedLineToolIcon = (p: IconProps) => (
  <Svg {...p}>
    <line x1="3" y1="21" x2="21" y2="3" />
    <Dot cx={9} cy={15} />
    <Dot cx={15} cy={9} />
  </Svg>
);

export const HLineToolIcon = (p: IconProps) => (
  <Svg {...p}>
    <line x1="3" y1="12" x2="21" y2="12" />
    <Dot cx={12} cy={12} />
  </Svg>
);

export const HRayToolIcon = (p: IconProps) => (
  <Svg {...p}>
    <line x1="6" y1="12" x2="21" y2="12" />
    <Dot cx={6} cy={12} />
  </Svg>
);

export const VLineToolIcon = (p: IconProps) => (
  <Svg {...p}>
    <line x1="12" y1="3" x2="12" y2="21" />
    <Dot cx={12} cy={12} />
  </Svg>
);

export const CrossLineToolIcon = (p: IconProps) => (
  <Svg {...p}>
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="12" y1="3" x2="12" y2="21" />
    <Dot cx={12} cy={12} />
  </Svg>
);

export const ArrowToolIcon = (p: IconProps) => (
  <Svg {...p}>
    <line x1="5" y1="19" x2="18" y2="6" />
    <path d="M18 6 L12.5 7 M18 6 L17 11.5" />
    <Dot cx={5} cy={19} />
  </Svg>
);

export const ParallelChannelToolIcon = (p: IconProps) => (
  <Svg {...p}>
    <line x1="4" y1="14" x2="18" y2="4" />
    <line x1="6" y1="20" x2="20" y2="10" />
    <Dot cx={4} cy={14} />
    <Dot cx={18} cy={4} />
  </Svg>
);

export const PitchforkToolIcon = (p: IconProps) => (
  <Svg {...p}>
    <line x1="4" y1="5" x2="4" y2="19" />
    <line x1="4" y1="12" x2="21" y2="12" />
    <line x1="4" y1="5" x2="21" y2="5" />
    <line x1="4" y1="19" x2="21" y2="19" />
    <Dot cx={4} cy={5} />
    <Dot cx={4} cy={19} />
  </Svg>
);

export const FibRetraceToolIcon = (p: IconProps) => (
  <Svg {...p}>
    <line x1="4" y1="6" x2="20" y2="6" />
    <line x1="4" y1="11" x2="20" y2="11" />
    <line x1="4" y1="16" x2="20" y2="16" />
    <line x1="6" y1="4" x2="18" y2="18" opacity={0.5} />
  </Svg>
);

export const FibExtToolIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20 L10 8 L14 14" opacity={0.6} />
    <line x1="10" y1="6" x2="21" y2="6" />
    <line x1="10" y1="11" x2="21" y2="11" />
    <line x1="10" y1="16" x2="21" y2="16" />
  </Svg>
);

export const XabcdToolIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 18 L9 7 L13 16 L17 6 L20 14" />
  </Svg>
);

export const PriceRangeToolIcon = (p: IconProps) => (
  <Svg {...p}>
    <line x1="12" y1="4" x2="12" y2="20" />
    <path d="M8 7 L12 4 L16 7" />
    <path d="M8 17 L12 20 L16 17" />
  </Svg>
);

export const DateRangeToolIcon = (p: IconProps) => (
  <Svg {...p}>
    <line x1="4" y1="12" x2="20" y2="12" />
    <path d="M7 8 L4 12 L7 16" />
    <path d="M17 8 L20 12 L17 16" />
  </Svg>
);

export const RectangleToolIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="7" width="16" height="10" rx="0.5" />
  </Svg>
);

export const BrushToolIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 18 C7 12, 10 12, 12 15 S17 18, 20 6" />
  </Svg>
);

export const HighlighterToolIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 17 L14 8" strokeWidth={4} opacity={0.55} />
    <path d="M14 8 L18 4 L20 6 L16 10 Z" />
  </Svg>
);

export const TextToolIcon = (p: IconProps) => (
  <Svg {...p}>
    <line x1="6" y1="6" x2="18" y2="6" />
    <line x1="12" y1="6" x2="12" y2="19" />
  </Svg>
);

export const CalloutToolIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="5" width="16" height="10" rx="2" />
    <path d="M9 15 L8 20 L13 15" />
  </Svg>
);

export const MeasureToolIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="8" width="18" height="8" rx="1" transform="rotate(-20 12 12)" />
    <path d="M8 8 l1 2 M12 7 l1 2 M16 6 l1 2" />
  </Svg>
);

// Small filled anchor dot used only by the position icons (kept as they were
// before the hollow-ring change, which the user preferred here).
const SmallDot = ({ cx, cy }: { cx: number; cy: number }) => (
  <circle cx={cx} cy={cy} r={1.7} fill="currentColor" stroke="none" />
);

export const LongPositionToolIcon = (p: IconProps) => (
  <Svg {...p}>
    {/* Reward (target) zone on top, faintly filled */}
    <rect x="6" y="4" width="14" height="8" fill="currentColor" stroke="none" opacity={0.16} />
    <rect x="6" y="4" width="14" height="13" rx="0.5" />
    {/* Entry line */}
    <line x1="6" y1="12" x2="20" y2="12" strokeWidth={1.9} />
    <SmallDot cx={6} cy={4} />
    <SmallDot cx={6} cy={12} />
    <SmallDot cx={6} cy={17} />
  </Svg>
);

export const ShortPositionToolIcon = (p: IconProps) => (
  <Svg {...p}>
    {/* Reward (target) zone on the bottom for a short */}
    <rect x="6" y="9" width="14" height="8" fill="currentColor" stroke="none" opacity={0.16} />
    <rect x="6" y="4" width="14" height="13" rx="0.5" />
    <line x1="6" y1="9" x2="20" y2="9" strokeWidth={1.9} />
    <SmallDot cx={6} cy={4} />
    <SmallDot cx={6} cy={9} />
    <SmallDot cx={6} cy={17} />
  </Svg>
);

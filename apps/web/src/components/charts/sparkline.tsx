'use client';

import { useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

export interface SparkPoint {
  label: string;
  value: number;
  /** Optional status, used to tint the marker for that day. */
  status?: string;
  color?: string;
}

/**
 * Single-series trend line.
 *
 * One series means no legend box — the card title names it. A crosshair
 * plus tooltip is shipped by default: an SVG chart in a browser *is*
 * interactive, and hover is how a reader gets the exact value without
 * printing a number on every point.
 */
export function Sparkline({
  points,
  height = 64,
  formatValue = (value) => String(value),
  className,
  color = 'rgb(var(--series-1))',
  showArea = true,
}: {
  points: SparkPoint[];
  height?: number;
  formatValue?: (value: number) => string;
  className?: string;
  color?: string;
  showArea?: boolean;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const VIEW_W = 300;
  const PAD_Y = 6;

  const geometry = useMemo(() => {
    if (points.length === 0) return null;
    const values = points.map((p) => p.value);
    const rawMax = Math.max(...values);
    const rawMin = Math.min(...values);
    // A line is not obliged to start at zero, and forcing it to did real
    // damage here: a 7.5–9h working day against a 0h floor drew a flat slab
    // with no visible day-to-day movement. Pad the data range instead and
    // let the crosshair tooltip carry the absolute value.
    const spread = rawMax - rawMin;
    const pad = spread > 0 ? spread * 0.35 : Math.max(rawMax * 0.15, 0.5);
    const max = rawMax + pad;
    const min = Math.max(0, rawMin - pad);
    const range = max - min || 1;

    const x = (index: number) =>
      points.length === 1 ? VIEW_W / 2 : (index / (points.length - 1)) * VIEW_W;
    const y = (value: number) =>
      height - PAD_Y - ((value - min) / range) * (height - PAD_Y * 2);

    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.value)}`).join(' ');
    const area = `${line} L${x(points.length - 1)},${height} L${x(0)},${height} Z`;

    return { x, y, line, area, max, min };
  }, [points, height]);

  if (!geometry) {
    return (
      <div
        className={cn('flex items-center justify-center text-xs text-ink-muted', className)}
        style={{ height }}
      >
        No data for this period
      </div>
    );
  }

  const active = hoverIndex !== null ? points[hoverIndex] : null;

  function handleMove(event: React.MouseEvent<HTMLDivElement>) {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return;
    const ratio = (event.clientX - box.left) / box.width;
    const index = Math.round(ratio * (points.length - 1));
    setHoverIndex(Math.max(0, Math.min(points.length - 1, index)));
  }

  return (
    <div
      ref={containerRef}
      className={cn('relative', className)}
      onMouseMove={handleMove}
      onMouseLeave={() => setHoverIndex(null)}
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={`Trend across ${points.length} days`}
      >
        {showArea ? (
          <>
            <defs>
              <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.18" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={geometry.area} fill="url(#spark-fill)" />
          </>
        ) : null}

        {/* 2px stroke, per the mark spec. */}
        <path
          d={geometry.line}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {hoverIndex !== null ? (
          <>
            <line
              x1={geometry.x(hoverIndex)}
              y1={0}
              x2={geometry.x(hoverIndex)}
              y2={height}
              stroke="rgb(var(--axis))"
              strokeWidth="1"
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
            {/* A 2px surface ring keeps the marker legible over the line. */}
            <circle
              cx={geometry.x(hoverIndex)}
              cy={geometry.y(points[hoverIndex].value)}
              r="4.5"
              fill={points[hoverIndex].color ?? color}
              stroke="rgb(var(--surface))"
              strokeWidth="2"
            />
          </>
        ) : null}
      </svg>

      {active ? (
        <div
          className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 -translate-y-full
                     whitespace-nowrap rounded-md border border-line bg-surface px-2 py-1
                     text-2xs shadow-raised"
          style={{ left: `${(hoverIndex! / Math.max(1, points.length - 1)) * 100}%` }}
        >
          <span className="font-medium text-ink">{formatValue(active.value)}</span>
          <span className="ml-1.5 text-ink-muted">{active.label}</span>
        </div>
      ) : null}
    </div>
  );
}

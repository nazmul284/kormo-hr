'use client';

import { useState } from 'react';

import { cn } from '@/lib/utils';

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  /** CSS colour. Attendance states use the reserved status tokens. */
  color: string;
  icon?: React.ReactNode;
}

/**
 * Part-to-whole donut.
 *
 * Hand-written SVG rather than a chart library so the 2px surface gap
 * between adjacent fills and the rounded data-ends are exact. The centre
 * carries the headline number, and the legend direct-labels every value —
 * which is also the relief that lets sub-3:1 fills be used at all.
 */
export function Donut({
  slices,
  heroValue,
  heroLabel,
  size = 152,
  thickness = 12,
  className,
  emptyLabel = 'No data yet',
}: {
  slices: DonutSlice[];
  heroValue?: string;
  heroLabel?: string;
  size?: number;
  thickness?: number;
  className?: string;
  emptyLabel?: string;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  // A 2px visual gap, expressed in arc length.
  const GAP_PX = 2;

  if (total <= 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center', className)} style={{ height: size }}>
        <svg width={size} height={size} role="img" aria-label={emptyLabel}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgb(var(--line))"
            strokeWidth={thickness}
          />
        </svg>
        <p className="mt-2 text-xs text-ink-muted">{emptyLabel}</p>
      </div>
    );
  }

  let offset = 0;
  const arcs = slices
    .filter((slice) => slice.value > 0)
    .map((slice) => {
      const fraction = slice.value / total;
      const length = fraction * circumference;
      // Never let the gap eat a whole tiny slice.
      const visible = Math.max(length - GAP_PX, Math.min(length, 1));
      const arc = {
        ...slice,
        fraction,
        dashArray: `${visible} ${circumference - visible}`,
        dashOffset: -offset,
      };
      offset += length;
      return arc;
    });

  // Resolved from `arcs`, not `slices`: only the arc carries the computed
  // fraction that the centre label needs.
  const active = hovered ? arcs.find((arc) => arc.key === hovered) : undefined;

  return (
    <div className={cn('flex flex-col items-center', className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          // Start at 12 o'clock and run clockwise.
          className="-rotate-90"
          role="img"
          aria-label={`${heroLabel ?? 'Breakdown'}: ${slices
            .map((s) => `${s.label} ${s.value}`)
            .join(', ')}`}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgb(var(--surface-sunken))"
            strokeWidth={thickness}
          />
          {arcs.map((arc) => (
            <circle
              key={arc.key}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={arc.color}
              strokeWidth={hovered === arc.key ? thickness + 2 : thickness}
              strokeDasharray={arc.dashArray}
              strokeDashoffset={arc.dashOffset}
              strokeLinecap="round"
              className="cursor-pointer transition-[stroke-width,opacity] duration-150"
              opacity={hovered && hovered !== arc.key ? 0.35 : 1}
              onMouseEnter={() => setHovered(arc.key)}
              onMouseLeave={() => setHovered(null)}
            />
          ))}
        </svg>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {active ? (
            <>
              <span className="text-2xl font-semibold tracking-tight text-ink tabular">
                {Math.round(active.fraction * 1000) / 10}%
              </span>
              <span className="mt-0.5 max-w-[70%] text-center text-2xs font-medium text-ink-secondary">
                {active.label}
              </span>
            </>
          ) : (
            <>
              <span className="text-2xl font-semibold tracking-tight text-ink tabular">
                {heroValue ?? total}
              </span>
              {heroLabel ? (
                <span className="mt-0.5 text-2xs font-medium uppercase tracking-wide text-ink-muted">
                  {heroLabel}
                </span>
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* Legend is always present, and direct-labels every value. */}
      <ul className="mt-4 w-full space-y-1.5">
        {slices.map((slice) => (
          <li
            key={slice.key}
            className={cn(
              'flex items-center gap-2 rounded-md px-1.5 py-1 text-xs transition-colors',
              hovered === slice.key ? 'bg-surface-sunken' : '',
            )}
            onMouseEnter={() => setHovered(slice.key)}
            onMouseLeave={() => setHovered(null)}
          >
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: slice.color }}
            />
            <span className="flex min-w-0 flex-1 items-center gap-1 truncate text-ink-secondary">
              {slice.icon}
              {slice.label}
            </span>
            <span className="shrink-0 font-medium text-ink tabular">
              {total > 0 ? `${Math.round((slice.value / total) * 1000) / 10}%` : '—'}
            </span>
            <span className="w-8 shrink-0 text-right text-ink-muted tabular">{slice.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

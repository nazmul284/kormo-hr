'use client';

import { useState } from 'react';

import { cn } from '@/lib/utils';

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  secondary?: string;
  color?: string;
}

/**
 * Horizontal bar chart for ranked magnitude ("top 20 customers").
 *
 * Horizontal because the labels are names — long text on a vertical
 * axis forces rotated tick labels, which are slower to read. Bars carry
 * a single hue: rank is the ordering, not an identity, so colouring each
 * bar differently would imply categories that do not exist.
 */
export function RankedBars({
  data,
  formatValue = (value) => value.toLocaleString('en-US'),
  maxRows,
  className,
  color = 'rgb(var(--series-1))',
  emptyLabel = 'Nothing to show for this period',
}: {
  data: BarDatum[];
  formatValue?: (value: number) => string;
  maxRows?: number;
  className?: string;
  color?: string;
  emptyLabel?: string;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  if (data.length === 0) {
    return <p className={cn('py-6 text-center text-xs text-ink-muted', className)}>{emptyLabel}</p>;
  }

  const rows = maxRows ? data.slice(0, maxRows) : data;
  const max = Math.max(...rows.map((row) => row.value), 1);

  return (
    <ul className={cn('space-y-2', className)}>
      {rows.map((row, index) => {
        const pct = (row.value / max) * 100;
        const isHovered = hovered === row.key;
        return (
          <li
            key={row.key}
            className="group"
            onMouseEnter={() => setHovered(row.key)}
            onMouseLeave={() => setHovered(null)}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-baseline gap-1.5 text-xs text-ink-secondary">
                <span className="w-4 shrink-0 text-right text-2xs text-ink-muted tabular">
                  {index + 1}
                </span>
                <span className="truncate" title={row.label}>
                  {row.label}
                </span>
              </span>
              <span className="shrink-0 text-xs font-medium text-ink tabular">
                {formatValue(row.value)}
                {row.secondary ? (
                  <span className="ml-1.5 font-normal text-ink-muted">{row.secondary}</span>
                ) : null}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
              {/* Rounded data-end, anchored to the baseline. */}
              <div
                className="h-full rounded-full transition-[width,opacity] duration-200"
                style={{
                  width: `${Math.max(pct, 1.5)}%`,
                  backgroundColor: row.color ?? color,
                  opacity: hovered && !isHovered ? 0.5 : 1,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Vertical column chart for a short time series (daily visit trend,
 * monthly meal counts). Columns get a 2px surface gap between them.
 */
export function ColumnChart({
  data,
  height = 120,
  formatValue = (value) => value.toLocaleString('en-US'),
  className,
  color = 'rgb(var(--series-1))',
  emptyLabel = 'No data for this period',
}: {
  data: BarDatum[];
  height?: number;
  formatValue?: (value: number) => string;
  className?: string;
  color?: string;
  emptyLabel?: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (data.length === 0) {
    return <p className={cn('py-6 text-center text-xs text-ink-muted', className)}>{emptyLabel}</p>;
  }

  const max = Math.max(...data.map((datum) => datum.value), 1);
  const active = hovered !== null ? data[hovered] : null;

  return (
    <div className={cn('relative', className)}>
      {active ? (
        <div className="absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap
                        rounded-md border border-line bg-surface px-2 py-1 text-2xs shadow-raised">
          <span className="font-medium text-ink">{formatValue(active.value)}</span>
          <span className="ml-1.5 text-ink-muted">{active.label}</span>
        </div>
      ) : null}

      <div
        className="flex items-end gap-0.5"
        style={{ height }}
        onMouseLeave={() => setHovered(null)}
      >
        {data.map((datum, index) => (
          <button
            key={datum.key}
            type="button"
            // Hit target spans the full column height, not just the bar.
            className="group relative flex h-full flex-1 items-end justify-center"
            onMouseEnter={() => setHovered(index)}
            aria-label={`${datum.label}: ${formatValue(datum.value)}`}
          >
            {/*
              Capped width, so a short series does not become a row of slabs.
              With eight columns and no cap each bar grew past 180px, which
              reads as a block of colour rather than a mark — and the 4px
              rounded data-end disappeared at that width.
            */}
            <span
              className="w-full max-w-[52px] rounded-t-[4px] transition-[opacity] duration-150"
              style={{
                height: `${Math.max((datum.value / max) * 100, datum.value > 0 ? 3 : 0)}%`,
                backgroundColor: datum.color ?? color,
                opacity: hovered !== null && hovered !== index ? 0.45 : 1,
              }}
            />
          </button>
        ))}
      </div>

      <div className="mt-1.5 flex gap-0.5">
        {data.map((datum, index) => (
          <span
            key={datum.key}
            className={cn(
              'flex-1 truncate text-center text-2xs',
              // Only label every nth tick when the series is dense.
              data.length > 16 && index % 4 !== 0 ? 'invisible' : 'text-ink-muted',
            )}
          >
            {datum.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Stacked proportion bar (leave entitled vs consumed, clearance
 * progress). Segments are separated by a 2px surface gap.
 */
export function ProportionBar({
  segments,
  total,
  height = 8,
  className,
}: {
  segments: { key: string; label: string; value: number; color: string }[];
  total: number;
  height?: number;
  className?: string;
}) {
  const safeTotal = Math.max(total, 1);

  return (
    <div
      className={cn('flex w-full overflow-hidden rounded-full bg-surface-sunken', className)}
      style={{ height }}
      role="img"
      aria-label={segments.map((s) => `${s.label}: ${s.value} of ${total}`).join(', ')}
    >
      {segments
        .filter((segment) => segment.value > 0)
        .map((segment, index) => (
          <div
            key={segment.key}
            title={`${segment.label}: ${segment.value}`}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${(segment.value / safeTotal) * 100}%`,
              backgroundColor: segment.color,
              // 2px surface gap between adjacent fills.
              marginLeft: index > 0 ? 2 : 0,
            }}
          />
        ))}
    </div>
  );
}

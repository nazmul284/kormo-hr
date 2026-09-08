import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * A single headline number.
 *
 * Deliberately not a chart: one value has no shape to show, and a
 * one-bar bar chart is the classic way to make a number harder to read.
 */
export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  delta,
  tone = 'neutral',
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  /** Percentage change; sign decides the arrow, `goodWhenUp` the colour. */
  delta?: { value: number; goodWhenUp?: boolean; label?: string };
  tone?: 'neutral' | 'brand' | 'good' | 'warning' | 'critical';
  className?: string;
}) {
  const toneRing = {
    neutral: 'text-ink-muted bg-surface-sunken ring-line',
    brand: 'text-brand bg-brand-subtle ring-brand/20',
    good: 'text-good-ink bg-good-subtle ring-good/20',
    warning: 'text-serious bg-warning-subtle ring-warning/25',
    critical: 'text-critical-ink bg-critical-subtle ring-critical/20',
  }[tone];

  const DeltaIcon =
    delta === undefined ? null : delta.value > 0 ? ArrowUpRight : delta.value < 0 ? ArrowDownRight : Minus;
  // "Good when up" is explicit: attrition rising is bad, headcount rising is not.
  const deltaGood =
    delta === undefined || delta.value === 0
      ? null
      : (delta.value > 0) === (delta.goodWhenUp !== false);

  return (
    <div className={cn('card p-4', className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-ink-secondary">{label}</p>
        {Icon ? (
          <span
            className={cn(
              'inline-flex size-7 shrink-0 items-center justify-center rounded-md ring-1',
              toneRing,
            )}
          >
            <Icon className="size-3.5" aria-hidden />
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-2xl font-semibold tracking-tight text-ink">{value}</p>

      <div className="mt-1 flex items-center gap-2">
        {delta !== undefined && DeltaIcon ? (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-xs font-medium',
              deltaGood === null
                ? 'text-ink-muted'
                : deltaGood
                  ? 'text-good-ink'
                  : 'text-critical-ink',
            )}
          >
            <DeltaIcon className="size-3" aria-hidden />
            {Math.abs(delta.value).toFixed(1)}%
            {delta.label ? <span className="text-ink-muted"> {delta.label}</span> : null}
          </span>
        ) : null}
        {hint ? <p className="text-xs text-ink-muted">{hint}</p> : null}
      </div>
    </div>
  );
}

/** Compact metric row for inside a card. */
export function MetricRow({
  items,
  className,
}: {
  items: { label: string; value: string | number; tone?: 'good' | 'warning' | 'critical' | 'brand' }[];
  className?: string;
}) {
  return (
    <dl className={cn('grid gap-px overflow-hidden rounded-lg bg-line', className)}
        style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 4)}, minmax(0, 1fr))` }}>
      {items.map((item) => (
        <div key={item.label} className="bg-surface px-3 py-2.5">
          <dt className="truncate text-2xs font-medium uppercase tracking-wide text-ink-muted">
            {item.label}
          </dt>
          <dd
            className={cn(
              'mt-0.5 text-lg font-semibold tabular',
              item.tone === 'good' ? 'text-good-ink'
              : item.tone === 'warning' ? 'text-serious'
              : item.tone === 'critical' ? 'text-critical-ink'
              : item.tone === 'brand' ? 'text-brand'
              : 'text-ink',
            )}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

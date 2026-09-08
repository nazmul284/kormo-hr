'use client';

import { useId } from 'react';

import { cn } from '@/lib/utils';

/**
 * The Kormo mark, inline so it inherits the app font and needs no
 * network request. The stem reads as a person; the ascending teal arm is
 * the growth chevron.
 *
 * The gradient id is per-instance. With a fixed id, two marks on one page
 * shared it, and if the first happened to sit in a `display: none` subtree
 * — as it does on the login screen below `lg` — the browser resolved
 * `url(#…)` to a definition it was not rendering and the tile lost its fill.
 */
export function LogoMark({ className, size = 32 }: { className?: string; size?: number }) {
  const tileId = `kormo-tile-${useId()}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={cn('shrink-0', className)}
      role="img"
      aria-label="Kormo HR"
    >
      <defs>
        <linearGradient id={tileId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6366F1" />
          <stop offset="55%" stopColor="#4F46E5" />
          <stop offset="100%" stopColor="#3730A3" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#${tileId})`} />
      <rect x="16" y="15" width="7.5" height="34" rx="3.75" fill="#FFFFFF" />
      <path d="M27.5 32 L46 16" fill="none" stroke="#5EEAD4" strokeWidth="7.5" strokeLinecap="round" />
      <path d="M27.5 32 L46 48" fill="none" stroke="#FFFFFF" strokeWidth="7.5" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ className, showTagline = false }: { className?: string; showTagline?: boolean }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <LogoMark size={32} />
      <span className="min-w-0">
        <span className="block truncate text-base font-semibold leading-none tracking-tight text-ink">
          Kormo<span className="text-brand"> HR</span>
        </span>
        {showTagline ? (
          <span className="mt-1 block truncate text-2xs uppercase tracking-[0.18em] text-ink-muted">
            People Operations
          </span>
        ) : null}
      </span>
    </span>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

/** Route-driven tabs — each tab is a real URL, so tabs are linkable. */
export function LinkTabs({
  tabs,
  className,
}: {
  tabs: { label: string; href: string; count?: number; exact?: boolean }[];
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <div className={cn('scroll-x border-b border-line', className)}>
      <nav className="flex min-w-max gap-1" aria-label="Tabs">
        {tabs.map((tab) => {
          const active = tab.exact
            ? pathname === tab.href
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-sm '
                + 'font-medium transition-colors',
                active
                  ? 'text-brand after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 '
                    + 'after:rounded-full after:bg-brand'
                  : 'text-ink-secondary hover:text-ink',
              )}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 ? (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-px text-2xs font-semibold tabular',
                    active ? 'bg-brand/12 text-brand' : 'bg-surface-sunken text-ink-secondary',
                  )}
                >
                  {tab.count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/** Local, non-routed tabs for panels inside a page. */
export function SegmentedTabs<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'md',
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; count?: number }[];
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex max-w-full items-center gap-0.5 rounded-lg border border-line bg-surface-sunken p-0.5',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors',
              size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm',
              active
                ? 'bg-surface text-ink shadow-sm'
                : 'text-ink-secondary hover:text-ink',
            )}
          >
            {option.label}
            {option.count !== undefined && option.count > 0 ? (
              <span className="rounded-full bg-brand/12 px-1.5 text-2xs font-semibold text-brand tabular">
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

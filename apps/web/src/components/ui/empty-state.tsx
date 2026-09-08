import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Empty states say *why* the list is empty and what to do next. A bare
 * "No data" leaves the user unable to tell a filter from a permission
 * problem from a genuinely empty month.
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
  tone = 'neutral',
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  tone?: 'neutral' | 'good' | 'warning';
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 py-12 text-center',
        className,
      )}
    >
      <span
        className={cn(
          'mb-3 inline-flex size-11 items-center justify-center rounded-full ring-1',
          tone === 'good'
            ? 'bg-good-subtle text-good-ink ring-good/20'
            : tone === 'warning'
              ? 'bg-warning-subtle text-serious ring-warning/25'
              : 'bg-surface-sunken text-ink-muted ring-line',
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="text-sm font-medium text-ink">{title}</p>
      {description ? (
        <p className="mt-1 max-w-md text-sm text-ink-secondary">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Fragment } from 'react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonTable } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string;
  header: string;
  /** Right-align numbers; they read faster in a column. */
  align?: 'left' | 'right' | 'center';
  width?: string;
  render: (row: T, index: number) => React.ReactNode;
  /** Hide on small screens rather than squeezing every column in. */
  hideBelow?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * The table used across the app.
 *
 * Wide content scrolls inside its own container — the page body never
 * scrolls sideways. A sticky header keeps the column meaning visible
 * through a long month of attendance rows.
 */
export function DataTable<T>({
  columns,
  rows,
  keyOf,
  loading = false,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  emptyAction,
  meta,
  onPageChange,
  footer,
  rowClassName,
  className,
  maxHeight,
}: {
  columns: Column<T>[];
  rows: T[];
  keyOf: (row: T, index: number) => string | number;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  meta?: { page: number; pageSize: number; total: number; totalPages: number };
  onPageChange?: (page: number) => void;
  footer?: React.ReactNode;
  rowClassName?: (row: T) => string | undefined;
  className?: string;
  maxHeight?: string;
}) {
  if (loading) return <SkeletonTable cols={Math.min(columns.length, 7)} />;

  if (rows.length === 0) {
    return (
      <div className={cn('card', className)}>
        <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
      </div>
    );
  }

  const hideClass = {
    sm: 'hidden sm:table-cell',
    md: 'hidden md:table-cell',
    lg: 'hidden lg:table-cell',
  };

  return (
    <div className={cn('card overflow-hidden', className)}>
      <div className="overflow-x-auto" style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}>
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  style={column.width ? { width: column.width } : undefined}
                  className={cn(
                    column.align === 'right' && 'text-right',
                    column.align === 'center' && 'text-center',
                    column.hideBelow && hideClass[column.hideBelow],
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={keyOf(row, index)} className={rowClassName?.(row)}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      column.align === 'right' && 'text-right tabular',
                      column.align === 'center' && 'text-center',
                      column.hideBelow && hideClass[column.hideBelow],
                      column.className,
                    )}
                  >
                    {column.render(row, index)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {footer ? <tfoot className="bg-surface-sunken font-medium text-ink">{footer}</tfoot> : null}
        </table>
      </div>

      {meta && meta.totalPages > 1 && onPageChange ? (
        <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2.5">
          <p className="text-xs text-ink-muted tabular">
            {(meta.page - 1) * meta.pageSize + 1}–
            {Math.min(meta.page * meta.pageSize, meta.total)} of {meta.total.toLocaleString('en-US')}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="secondary"
              size="icon-sm"
              disabled={meta.page <= 1}
              onClick={() => onPageChange(meta.page - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft />
            </Button>
            <span className="px-2 text-xs text-ink-secondary tabular">
              {meta.page} / {meta.totalPages}
            </span>
            <Button
              variant="secondary"
              size="icon-sm"
              disabled={meta.page >= meta.totalPages}
              onClick={() => onPageChange(meta.page + 1)}
              aria-label="Next page"
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Label/value pairs — the profile tabs are built from these. */
export function DetailList({
  items,
  columns = 2,
  className,
}: {
  items: { label: string; value: React.ReactNode; span?: boolean }[];
  columns?: 1 | 2 | 3;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        'grid gap-x-6 gap-y-4',
        columns === 1 ? 'grid-cols-1' : columns === 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2',
        className,
      )}
    >
      {items.map((item, index) => (
        <div key={`${item.label}-${index}`} className={item.span ? 'sm:col-span-full' : undefined}>
          <dt className="text-2xs font-medium uppercase tracking-wide text-ink-muted">
            {item.label}
          </dt>
          <dd className="mt-1 break-words text-sm text-ink">
            {item.value === null || item.value === undefined || item.value === '' ? (
              <span className="text-ink-muted">—</span>
            ) : (
              item.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Filter bar: one row above the content, per the interaction spec. */
export function FilterBar({
  children,
  className,
  actions,
}: {
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-end justify-between gap-3 rounded-card border border-line bg-surface p-3',
        className,
      )}
    >
      <div className="flex flex-wrap items-end gap-2">{children}</div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

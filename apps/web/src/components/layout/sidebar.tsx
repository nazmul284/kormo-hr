'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { LogoMark, Wordmark } from './logo';
import { useSession } from '@/lib/session';
import { visibleNav } from '@/lib/nav';
import { cn } from '@/lib/utils';

export function Sidebar({
  collapsed,
  onToggle,
  badges,
  onNavigate,
}: {
  collapsed: boolean;
  onToggle: () => void;
  badges?: Record<string, number>;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { user } = useSession();

  const sections = useMemo(
    () => visibleNav(user?.permissions ?? [], user?.features ?? {}),
    [user?.permissions, user?.features],
  );

  // Groups start open when the current route is inside them.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setOpenGroups((current) => {
      const next = { ...current };
      for (const section of sections) {
        for (const item of section.items) {
          if (item.children?.some((child) => pathname === child.href || pathname.startsWith(`${child.href}/`))) {
            next[item.href] = true;
          }
        }
      }
      return next;
    });
  }, [pathname, sections]);

  return (
    <div className="flex h-full flex-col bg-surface">
      <div
        className={cn(
          'flex h-14 shrink-0 items-center border-b border-line',
          collapsed ? 'justify-center px-2' : 'justify-between px-4',
        )}
      >
        {collapsed ? (
          <Link href="/dashboard" aria-label="Kormo HR — dashboard">
            <LogoMark size={28} />
          </Link>
        ) : (
          <>
            <Link href="/dashboard" className="min-w-0">
              <Wordmark />
            </Link>
            <button
              type="button"
              onClick={onToggle}
              className="hidden rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface-sunken
                         hover:text-ink lg:block"
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose className="size-4" />
            </button>
          </>
        )}
      </div>

      {collapsed ? (
        <button
          type="button"
          onClick={onToggle}
          className="mx-auto mt-2 rounded-md p-1.5 text-ink-muted transition-colors
                     hover:bg-surface-sunken hover:text-ink"
          aria-label="Expand sidebar"
        >
          <PanelLeftOpen className="size-4" />
        </button>
      ) : null}

      <nav className="no-scrollbar scroll-fade-b flex-1 overflow-y-auto px-2 py-3" aria-label="Main">
        {sections.map((section) => (
          <div key={section.title} className="mb-3.5 last:mb-0">
            {!collapsed ? (
              <p className="eyebrow px-2.5 pb-1.5">
                {section.title}
              </p>
            ) : (
              <div className="mx-auto mb-2 h-px w-6 bg-line" aria-hidden />
            )}

            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const hasChildren = (item.children?.length ?? 0) > 0;
                const isActive = hasChildren
                  ? item.children!.some(
                      (child) => pathname === child.href || pathname.startsWith(`${child.href}/`),
                    )
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
                const isOpen = openGroups[item.href] ?? false;
                const badgeCount = item.badge ? badges?.[item.badge] ?? 0 : 0;
                const childBadgeTotal =
                  item.children?.reduce(
                    (sum, child) => sum + (child.badge ? badges?.[child.badge] ?? 0 : 0),
                    0,
                  ) ?? 0;
                const totalBadge = badgeCount + childBadgeTotal;

                if (collapsed) {
                  return (
                    <li key={item.href}>
                      <Link
                        href={hasChildren ? item.children![0].href : item.href}
                        onClick={onNavigate}
                        title={item.label}
                        className={cn(
                          'relative mx-auto flex size-9 items-center justify-center rounded-lg transition-colors',
                          isActive
                            ? 'bg-brand-subtle text-brand'
                            : 'text-ink-secondary hover:bg-surface-sunken hover:text-ink',
                        )}
                      >
                        <Icon className="size-4" aria-hidden />
                        {totalBadge > 0 ? (
                          <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center
                                           rounded-full bg-brand text-[9px] font-bold text-white">
                            {totalBadge > 9 ? '9+' : totalBadge}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                }

                return (
                  <li key={item.href}>
                    {hasChildren ? (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setOpenGroups((current) => ({ ...current, [item.href]: !isOpen }))
                          }
                          aria-expanded={isOpen}
                          className={cn(
                            'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                            isActive
                              ? 'text-brand'
                              : 'text-ink-secondary hover:bg-surface-sunken hover:text-ink',
                          )}
                        >
                          <Icon className="size-4 shrink-0" aria-hidden />
                          <span className="flex-1 truncate text-left">{item.label}</span>
                          {totalBadge > 0 ? (
                            <span className="rounded-full bg-brand/12 px-1.5 text-2xs font-semibold text-brand-ink tabular">
                              {totalBadge}
                            </span>
                          ) : null}
                          <ChevronDown
                            className={cn('size-3.5 shrink-0 transition-transform', isOpen && 'rotate-180')}
                            aria-hidden
                          />
                        </button>

                        {isOpen ? (
                          <ul className="ml-4 mt-0.5 space-y-0.5 border-l border-line pl-2">
                            {item.children!.map((child) => {
                              const childActive =
                                pathname === child.href || pathname.startsWith(`${child.href}/`);
                              const count = child.badge ? badges?.[child.badge] ?? 0 : 0;
                              return (
                                <li key={child.href}>
                                  <Link
                                    href={child.href}
                                    onClick={onNavigate}
                                    aria-current={childActive ? 'page' : undefined}
                                    className={cn(
                                      'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                                      childActive
                                        ? 'bg-brand-subtle font-medium text-brand'
                                        : 'text-ink-secondary hover:bg-surface-sunken hover:text-ink',
                                    )}
                                  >
                                    <span className="flex-1 truncate">{child.label}</span>
                                    {count > 0 ? (
                                      <span className="rounded-full bg-brand/12 px-1.5 text-2xs font-semibold text-brand-ink tabular">
                                        {count}
                                      </span>
                                    ) : null}
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>
                        ) : null}
                      </>
                    ) : (
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={isActive ? 'page' : undefined}
                        className={cn(
                          'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-brand-subtle text-brand'
                            : 'text-ink-secondary hover:bg-surface-sunken hover:text-ink',
                        )}
                      >
                        <Icon className="size-4 shrink-0" aria-hidden />
                        <span className="flex-1 truncate">{item.label}</span>
                        {totalBadge > 0 ? (
                          <span className="rounded-full bg-brand/12 px-1.5 text-2xs font-semibold text-brand-ink tabular">
                            {totalBadge}
                          </span>
                        ) : null}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {!collapsed ? (
        <div className="shrink-0 border-t border-line px-4 py-3">
          <p className="text-2xs leading-relaxed text-ink-muted">
            Kormo HR © {new Date().getFullYear()}
            <br />
            <span className="text-ink-muted/70">{user?.company.name ?? ''}</span>
          </p>
        </div>
      ) : null}
    </div>
  );
}

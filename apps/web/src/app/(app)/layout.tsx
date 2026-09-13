'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { Sidebar } from '@/components/layout/sidebar';
import { DemoBar } from '@/components/layout/demo-bar';
import { Topbar } from '@/components/layout/topbar';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

const COLLAPSE_KEY = 'kormo-sidebar-collapsed';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useSession();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === 'true');
    } catch {
      // Blocked storage — the expanded default is fine.
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(COLLAPSE_KEY, String(next));
      } catch {
        // Non-fatal.
      }
      return next;
    });
  }

  // Sidebar badge counts come from the dashboard aggregate, which the
  // dashboard page itself also reads — one cached query serves both.
  const { data: dashboard } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<{ pendingApprovals: Record<string, number> }>('/dashboard'),
    enabled: Boolean(user),
    staleTime: 60_000,
  });

  /*
   * While the session resolves, show the *shape* of the app rather than a
   * bare centred spinner: the layout does not shift when the real content
   * lands, and the `.skeleton` markers make "still loading" detectable by
   * the screenshot harness instead of silently passing as a rendered page.
   */
  if (isLoading && !user) {
    return (
      <div className="flex min-h-screen bg-page">
        <aside className="hidden w-60 shrink-0 border-r border-line bg-surface p-4 lg:block">
          <div className="skeleton h-8 w-36" />
          <div className="mt-6 space-y-2">
            {Array.from({ length: 10 }).map((_, index) => (
              <div key={index} className="skeleton h-7" />
            ))}
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-14 items-center gap-3 border-b border-line bg-surface px-4">
            <div className="skeleton h-9 w-64 rounded-lg" />
            <div className="ml-auto skeleton size-9 rounded-lg" />
          </div>
          <main className="flex-1 space-y-4 px-5 py-6">
            <div className="skeleton h-8 w-72" />
            <div className="grid gap-4 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="skeleton h-48 rounded-card" />
              ))}
            </div>
          </main>
        </div>
        <span className="sr-only" role="status">
          Loading your workspace
        </span>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-page">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'sticky top-0 hidden h-screen shrink-0 border-r border-line transition-[width] duration-200 lg:block',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        <Sidebar
          collapsed={collapsed}
          onToggle={toggleCollapsed}
          badges={dashboard?.pendingApprovals}
        />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          />
          <div className="absolute inset-y-0 left-0 w-64 animate-slide-up border-r border-line shadow-pop">
            <Sidebar
              collapsed={false}
              onToggle={() => setMobileOpen(false)}
              badges={dashboard?.pendingApprovals}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Renders nothing outside the published demo. */}
        <DemoBar />
        <Topbar onOpenMobileNav={() => setMobileOpen(true)} />
        <main className="min-w-0 flex-1 px-3 py-4 sm:px-5 sm:py-6">
          <div className="mx-auto w-full max-w-[1600px] space-y-5">{children}</div>
        </main>
      </div>
    </div>
  );
}

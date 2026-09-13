'use client';

import { Coffee, Github, Info } from 'lucide-react';

import { DEMO_MODE, currentDemoRole, setDemoRole } from '@/lib/demo';
import { cn } from '@/lib/utils';

/**
 * Roles the visitor can switch between, in the order they are worth
 * looking at: widest scope first, so someone clicking through meets the
 * most capable screen before the most limited one.
 *
 * These are the bundles `scripts/capture-demo.mjs` records. Adding one
 * here without recording it produces a role whose every page is empty.
 */
const ROLES = [
  { key: 'md', label: 'Director' },
  { key: 'hr', label: 'HR' },
  { key: 'manager', label: 'Manager' },
  { key: 'payroll', label: 'Payroll' },
  { key: 'field', label: 'Field' },
  { key: 'employee', label: 'Employee' },
];

/**
 * The bar across the top of the published demo.
 *
 * It says three things, in the order a visitor needs them: this is a
 * demo, here is how to see a different role, and here is the source. The
 * role switch is a full reload rather than a client-side state change —
 * every cached query belongs to the previous role's bundle, and dropping
 * the whole cache is more honest than invalidating it query by query and
 * hoping none was missed.
 */
export function DemoBar() {
  if (!DEMO_MODE) return null;

  const active = currentDemoRole();

  function switchTo(role: string) {
    if (role === active) return;
    setDemoRole(role);
    window.location.reload();
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-surface-sunken px-4 py-2">
      <span className="flex items-center gap-1.5 text-2xs font-medium text-ink-secondary">
        <Info className="size-3.5 shrink-0 text-brand" aria-hidden />
        Read-only demo
        <span className="hidden text-ink-muted sm:inline">· generated data, no real people</span>
      </span>

      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="View as role">
        {ROLES.map((role) => (
          <button
            key={role.key}
            type="button"
            onClick={() => switchTo(role.key)}
            aria-pressed={role.key === active}
            className={cn(
              'rounded-md px-2 py-1 text-2xs font-medium transition-colors',
              role.key === active
                ? 'bg-brand text-white'
                : 'text-ink-secondary hover:bg-surface hover:text-ink',
            )}
          >
            {role.label}
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <a
          href="https://github.com/nazmul284/kormo-hr"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-2xs font-medium text-ink-secondary hover:text-ink"
        >
          <Github className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">Source</span>
        </a>
        <a
          href="https://buymeacoffee.com/heynazmul"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-2xs font-medium text-ink-secondary hover:text-ink"
        >
          <Coffee className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">Sponsor</span>
        </a>
      </div>
    </div>
  );
}

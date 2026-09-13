'use client';

import { useMutation } from '@tanstack/react-query';
import {
  AlertCircle, ArrowRight, Building2, CalendarCheck, Eye, EyeOff, Fingerprint,
  Landmark, Lock, Receipt, ShieldCheck, Target, Umbrella, User,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useRef, useState } from 'react';

import { LogoMark } from '@/components/layout/logo';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { Button } from '@/components/ui/button';
import { ApiError, api } from '@/lib/api';
import { DEMO_MODE, setDemoRole } from '@/lib/demo';
import type { SessionUser } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * The showcase panel is permanently dark — it is a brand surface, not a
 * themed one — so its colours are written literally instead of through the
 * design tokens, which flip with the user's theme. These are the dark steps
 * of the same validated series the app uses.
 */
const PANEL = {
  base: '#141334',
  glow: '#4F46E5',
  accent: '#5EEAD4',
  hairline: 'rgba(255,255,255,0.10)',
  glass: 'rgba(255,255,255,0.055)',
  ink: 'rgba(255,255,255,0.94)',
  inkSoft: 'rgba(226,228,255,0.78)',
  // 0.52 composited to 3.97:1 over the panel — under AA for the 12px meta
  // lines it is used on. 0.66 measures 5.64:1.
  inkFaint: 'rgba(199,204,255,0.66)',
};

/** A day in the product, in the order an employee actually meets it. */
const TIMELINE = [
  {
    icon: Fingerprint,
    title: 'Clocked in at 09:44',
    meta: 'General shift · Head Office',
    hue: '#2DBE8A',
  },
  {
    icon: Umbrella,
    title: 'Casual leave approved',
    meta: '2 days · balance now 8 of 10',
    hue: '#C98500',
  },
  {
    icon: Receipt,
    title: 'August payslip ready',
    // Deliberately currency-free: the sign-in page renders before there
    // is a session, so there is no tenant yet to know what to render it in.
    meta: 'Net pay confirmed, tax deducted at source',
    hue: '#818CF8',
  },
  {
    icon: Target,
    title: 'Q3 goal moved to 72%',
    meta: 'Your manager left a review note',
    hue: '#D96D97',
  },
];

const PILLARS = [
  { icon: CalendarCheck, label: 'Offer letter to clearance letter' },
  { icon: Landmark, label: 'Progressive tax slabs, six country packs' },
  { icon: Building2, label: 'Many companies, one sign-in' },
];

/**
 * Demo roles, ordered widest scope first so the reader meets the most
 * capable account before the most limited one. The chip colour comes from
 * the categorical series, which is why no two adjacent roles look alike.
 */
const DEMO_ACCOUNTS = [
  { username: 'md', initials: 'MD', label: 'Managing Director', hint: 'Everything', hue: 'rgb(var(--series-1))' },
  { username: 'hr.admin', initials: 'HR', label: 'Head of HR', hint: 'Company-wide', hue: 'rgb(var(--series-5))' },
  { username: 'manager', initials: 'LM', label: 'Line manager', hint: 'Approval inbox', hue: 'rgb(var(--series-3))' },
  { username: 'payroll', initials: 'PR', label: 'Payroll officer', hint: 'Payroll & tax', hue: 'rgb(var(--series-4))' },
  { username: 'field', initials: 'FF', label: 'Field force', hint: 'Visits & tracking', hue: 'rgb(var(--series-2))' },
  { username: 'employee', initials: 'EM', label: 'Employee', hint: 'Self-service', hue: 'rgb(var(--ink-muted))' },
];

const DEMO_PASSWORD = 'Kormo@123';

// ── the brand half ────────────────────────────────────────────────────

function ShowcasePanel() {
  return (
    <aside
      className="relative hidden flex-col justify-between overflow-hidden p-10 xl:p-12 lg:flex"
      style={{ backgroundColor: PANEL.base, color: PANEL.ink }}
    >
      {/* Two soft glows and a hairline dot grid: enough depth that the panel
          is not a flat slab, faint enough that nothing on it has to fight. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            `radial-gradient(60% 55% at 12% 8%, ${PANEL.accent}2E, transparent 70%),`
            + `radial-gradient(65% 60% at 88% 92%, ${PANEL.glow}59, transparent 72%)`,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
          maskImage: 'radial-gradient(120% 100% at 50% 0%, black 25%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(120% 100% at 50% 0%, black 25%, transparent 75%)',
        }}
      />

      <div className="relative flex items-center gap-3">
        <LogoMark size={34} />
        <span className="text-lg font-semibold tracking-tight">
          Kormo<span style={{ color: PANEL.accent }}> HR</span>
        </span>
      </div>

      <div className="relative max-w-lg">
        <h1 className="text-4xl font-semibold leading-[1.08]">
          Every person,
          <br />
          every process,
          <br />
          <span style={{ color: PANEL.accent }}>one place.</span>
        </h1>
        <p className="mt-5 text-base leading-relaxed" style={{ color: PANEL.inkSoft }}>
          Attendance, leave, payroll and income tax, goals, field visits and exit —
          for every company, in any country, under one roof.
        </p>

        {/* The product, shown rather than claimed. */}
        <ul
          className="mt-9 space-y-px overflow-hidden rounded-2xl border backdrop-blur-sm"
          style={{ borderColor: PANEL.hairline, backgroundColor: PANEL.glass }}
        >
          {TIMELINE.map((entry) => {
            const Icon = entry.icon;
            return (
              <li
                key={entry.title}
                className="flex items-center gap-3.5 px-4 py-3.5"
                style={{ boxShadow: `inset 0 -1px 0 ${PANEL.hairline}` }}
              >
                <span
                  aria-hidden
                  className="grid size-9 shrink-0 place-items-center rounded-xl"
                  style={{ backgroundColor: `${entry.hue}26`, color: entry.hue }}
                >
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{entry.title}</span>
                  <span className="block truncate text-xs" style={{ color: PANEL.inkFaint }}>
                    {entry.meta}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="relative">
        <ul className="flex flex-wrap gap-x-6 gap-y-2">
          {PILLARS.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <li
                key={pillar.label}
                className="flex items-center gap-2 text-xs"
                style={{ color: PANEL.inkFaint }}
              >
                <Icon className="size-3.5 shrink-0" aria-hidden />
                {pillar.label}
              </li>
            );
          })}
        </ul>
        <p className="mt-5 text-2xs" style={{ color: PANEL.inkFaint }}>
          Kormo HR © {new Date().getFullYear()}
        </p>
      </div>
    </aside>
  );
}

// ── the form half ─────────────────────────────────────────────────────

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/dashboard';

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

  const login = useMutation({
    mutationFn: () =>
      api.post<{ user: SessionUser; mustChangePassword: boolean }>('/auth/login', {
        identifier,
        password,
      }),
    onSuccess: () => {
      // Hard navigation so the middleware sees the fresh cookies and the
      // session query starts clean.
      window.location.href = next.startsWith('/') ? next : '/dashboard';
    },
  });

  const error = login.error instanceof ApiError ? login.error.message : null;
  const canSubmit = identifier.trim().length > 0 && password.length > 0;

  function pick(username: string) {
    /*
     * In the static demo there is no server to authenticate against —
     * choosing a role selects which recorded fixture bundle the app reads
     * from, and goes straight in. Filling a password field that can never
     * be checked would be theatre.
     */
    if (DEMO_MODE) {
      setDemoRole(username);
      window.location.href = next.startsWith('/') ? next : '/dashboard';
      return;
    }

    setIdentifier(username);
    setPassword(DEMO_PASSWORD);
    setPicked(username);
    login.reset();
    // Filling the form should hand the keyboard straight to the next step.
    requestAnimationFrame(() => submitRef.current?.focus());
  }

  return (
    <div className="relative flex flex-col justify-center bg-page px-5 py-10 sm:px-8">
      {/* A breath of brand at the top edge. Without it the dark theme puts a
          near-black rectangle beside a rich panel and the two halves stop
          looking like one page. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b
                   from-brand/[0.07] to-transparent"
      />

      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="relative mx-auto w-full max-w-[25rem]">
        <div className="flex items-center gap-2.5 lg:hidden">
          <LogoMark size={30} />
          <span className="text-base font-semibold tracking-tight text-ink">
            Kormo<span className="text-brand"> HR</span>
          </span>
        </div>

        <div className="mt-8 lg:mt-0">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">
            {DEMO_MODE ? 'Pick a role' : 'Welcome back'}
          </h2>
          <p className="mt-1.5 text-sm text-ink-secondary">
            {DEMO_MODE
              ? 'This is a read-only tour of the product. Choose whose screen you want to see — each role lands on genuinely different work.'
              : 'Sign in with your username, official email, or employee ID.'}
          </p>
        </div>

        {/*
          * The static demo has no server to authenticate against, so the
          * credential form is not rendered at all. Showing a disabled one
          * would invite people to try it and wonder what they got wrong.
          */}
        {DEMO_MODE ? null : (
        <form
          className="mt-7 space-y-3.5"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) login.mutate();
          }}
        >
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-secondary">
              Username, email or employee ID
            </span>
            <span className="relative block">
              <User
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
                aria-hidden
              />
              <input
                id="identifier"
                name="identifier"
                autoComplete="username"
                autoFocus
                required
                value={identifier}
                onChange={(event) => {
                  setIdentifier(event.target.value);
                  setPicked(null);
                }}
                placeholder="md"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'login-error' : undefined}
                className="h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-3 text-sm text-ink
                           shadow-sm transition-[border-color,box-shadow] placeholder:text-ink-muted
                           focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/12"
              />
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-secondary">Password</span>
            <span className="relative block">
              <Lock
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
                aria-hidden
              />
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                // Caps Lock is the single most common cause of a "wrong
                // password" that is not a wrong password.
                onKeyUp={(event) => setCapsLock(event.getModifierState?.('CapsLock') ?? false)}
                onBlur={() => setCapsLock(false)}
                placeholder="Enter your password"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'login-error' : undefined}
                className="h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-11 text-sm text-ink
                           shadow-sm transition-[border-color,box-shadow] placeholder:text-ink-muted
                           focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/12"
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center
                           rounded-lg text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </span>
            {capsLock ? (
              <span className="mt-1.5 flex items-center gap-1.5 text-2xs text-warning-ink">
                <AlertCircle className="size-3 shrink-0" aria-hidden />
                Caps Lock is on
              </span>
            ) : null}
          </label>

          {error ? (
            <p
              id="login-error"
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-critical/25 bg-critical-subtle
                         px-3 py-2.5 text-sm text-critical-ink"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{error}</span>
            </p>
          ) : null}

          <Button
            ref={submitRef}
            type="submit"
            size="lg"
            className="mt-1 h-11 w-full rounded-xl text-sm"
            loading={login.isPending}
            disabled={!canSubmit}
          >
            {login.isPending ? 'Signing in' : 'Sign in'}
            {!login.isPending ? <ArrowRight /> : null}
          </Button>
        </form>
        )}

        {/* Demo credentials, so the seeded roles are actually reachable. */}
        <div className={DEMO_MODE ? 'mt-7' : 'mt-9'}>
          {DEMO_MODE ? null : (
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-line" aria-hidden />
              <span className="eyebrow">Or open a demo role</span>
              <span className="h-px flex-1 bg-line" aria-hidden />
            </div>
          )}

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.username}
                type="button"
                onClick={() => pick(account.username)}
                aria-pressed={picked === account.username}
                className={cn(
                  'flex items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors',
                  picked === account.username
                    ? 'border-brand bg-brand-subtle'
                    : 'border-line bg-surface hover:border-line-strong hover:bg-surface-sunken',
                )}
              >
                <span
                  aria-hidden
                  className="grid size-7 shrink-0 place-items-center rounded-lg text-2xs font-semibold text-white"
                  style={{ backgroundColor: account.hue }}
                >
                  {account.initials}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium text-ink">{account.label}</span>
                  <span className="block truncate text-2xs text-ink-muted">{account.hint}</span>
                </span>
              </button>
            ))}
          </div>

          {DEMO_MODE ? (
            <p className="mt-3 flex items-start gap-1.5 text-2xs text-ink-muted">
              <ShieldCheck className="mt-px size-3.5 shrink-0" aria-hidden />
              <span>
                Everything here is generated demo data — no real people, and every
                phone number is from a range reserved for fiction. Approvals and
                edits are disabled;{' '}
                <a
                  className="font-medium text-brand underline underline-offset-2"
                  href="https://github.com/nazmul284/kormo-hr#quick-start"
                  target="_blank"
                  rel="noreferrer"
                >
                  run it locally
                </a>{' '}
                to try the write paths.
              </span>
            </p>
          ) : (
            <p className="mt-3 flex items-center gap-1.5 text-2xs text-ink-muted">
              <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
              Every demo account uses the password
              <code className="rounded-md bg-surface-sunken px-1.5 py-0.5 font-mono text-ink-secondary">
                {DEMO_PASSWORD}
              </code>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
      <ShowcasePanel />
      <Suspense fallback={<div className="bg-page" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}

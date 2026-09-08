# Architecture

## Shape

A **modular monolith** behind a single origin. Not microservices: the modules here share
one transactional database and are constantly consistent with each other — approving leave
must move a balance *and* stamp attendance rows in one transaction. Splitting that across
services would buy deployment independence at the cost of the correctness the domain needs.

```
Browser
   │  same origin, first-party cookies
   ▼
Next.js 14 (:3000) ── /api/* rewrite ──▶ NestJS (:4000)
   · App Router, RSC shell                 · 18 feature modules
   · TanStack Query cache                  · Prisma 6 ──▶ PostgreSQL 16
   · Tailwind design tokens                · Redis (cache, queues)
   · middleware route guard                · MinIO (S3-compatible)
                     │
              packages/shared
     tax engine · leave maths · permission keys
```

## Why the API is proxied onto the app's origin

The system being replaced served its API from `:46002`. Every browser request to a
different port is cross-origin, so each one is preceded by a CORS preflight `OPTIONS` —
paid on every call, on a dashboard that makes many.

Proxying `/api` through Next removes it entirely: the browser only ever talks to
`localhost:3000`, so no preflight is issued. It also means the auth cookies are
first-party `sameSite=lax` rather than third-party cookies, which browsers increasingly
block outright.

The CORS allowlist still exists for direct API consumers (mobile app, integrations), with
`maxAge: 86400` so even those cache the preflight for a day instead of per request.

---

## Authentication and authorisation

### Two tokens, both httpOnly

| | Lifetime | Purpose |
|---|---|---|
| `kormo_at` | 15 min | Access. Verified per request. |
| `kormo_rt` | 7 days | Refresh. Rotates on every use. |

Only the SHA-256 hash of a refresh token is persisted, so a database leak yields no live
sessions. Each token carries a `familyId` grouping every rotation of one login, and a
`replacedById` pointer.

**Reuse detection:** presenting a token that has already been rotated means it leaked or
was replayed. The whole family is revoked and the user must sign in again. Without
`replacedById` this is undetectable, which is the entire reason it is stored.

The client coalesces refreshes: a dashboard firing eight parallel requests that all 401
would otherwise kick off eight competing rotations and trip the reuse detection on itself.
`refreshSession()` in `lib/api.ts` shares one in-flight promise.

### The four guards, in order

```
ThrottlerGuard   → rate limits (10 sign-ins/min/IP)
JwtAuthGuard     → authenticates, then loads the principal FROM THE DATABASE
PermissionsGuard → enforces @RequirePermissions()
FeatureGuard     → enforces @RequireFeature() tenant flags
```

`JwtAuthGuard` re-reads roles, permissions, cross-company grants and feature flags on
**every request** rather than trusting JWT claims. A permission HR revokes takes effect at
once. The cost is one indexed query per request; the alternative is a window during which
a revoked permission still works.

### Row-level visibility lives in one file

`common/utils/scope.ts` is the only place that decides who can see whom:

- `resolveScope` maps the caller's permissions to `self` / `team` / `all`
- `employeeScopeWhere` turns that into a Prisma `where`
- `collectSubordinateIds` walks the reporting tree **breadth-first, one query per level**,
  with a visited set — so a bad data cycle (A reports to B reports to A) terminates
  instead of hanging the request
- `assertCanViewEmployee` throws rather than silently narrowing, so a UI bug surfaces as
  a 403 instead of a confusingly empty page

Every list endpoint funnels through these. That is deliberate: "who can see whom" drifting
between modules is precisely how row-level leaks happen in HR systems.

`all` is still tenant-bounded — it never means across companies the caller has no grant for.

### Salary is separately gated

`SALARY_READ` is its own permission. A line manager can open a report's profile without
seeing their pay. Payslips go further: either it is yours, or you hold `PAYSLIP_READ_ALL`
— being someone's manager is deliberately not enough.

---

## `packages/shared` — logic that must not diverge

Three things live here because two copies of them would be a bug:

**The tax engine.** Pure functions over plain numbers: no Prisma types, no ambient clock,
no I/O. The API, a payroll worker and a browser preview all produce byte-identical
results. It is the most consequential arithmetic in the system, so it is the most testable.

**Leave-day maths.** The form previews "leave days vs calendar days" live while the user
types; the server recomputes on submit. If those disagreed, employees would silently lose
days. The preview endpoint is a thin wrapper over the very same function the validator
calls.

**Permission keys and attendance formatting.** Shared so a typo is a compile error, and so
the exported XLSX and the on-screen grid render identical strings — an auditor comparing
the two should never see a discrepancy.

Consumed as a built package (`tsc` → `dist`) by both apps: Next transpiles it,
Nest imports the output.

---

## Data model

78 models. Field names follow the brief's observed API shape so the API stays a drop-in
replacement; physical columns are snake_case via `@map`.

**Tenancy** is row-level, not schema-per-tenant. `company_id` on every scoped table, plus
`employee_company_access` for shared-services staff who legitimately span companies.
Schema-per-tenant would make a cross-company HR query — which shared-services staff do
daily — a fan-out across schemas.

**Denormalised shift snapshots.** `attendance` stores the shift name and times it was
judged against, not just a foreign key. A roster re-cut months later must not retroactively
change whether someone was late in March.

**Append-only histories.** `salary_history` and `promotion_history` are never mutated. The
tax engine segments the fiscal year on `effective_from`, so rewriting history would change
a past year's tax.

**Inline request sub-state on attendance.** `send_edit_request`, `is_accepted_by_lm`,
`updated_in_time` and friends live on the attendance row *as well as* in
`attendance_edit_request`. This mirrors the reference system so the monthly grid renders
from one query instead of a join per row.

**Fractional decimals throughout leave.** `Decimal(6,2)`, not integers — pro-rated accrual
produces balances like 8.56 days, and half-days are real.

---

## Frontend

### Rendering

Client components with TanStack Query, not server components fetching per page. The app is
overwhelmingly authenticated, interactive, filter-heavy screens; a shared client cache
means navigating between attendance and leave does not refetch the session, the nav badges
or the department list. The dashboard aggregate is one query consumed by both the page and
the sidebar badges.

### Design tokens

Every colour is a CSS custom property as an `R G B` triple, so Tailwind can apply opacity.
Light is the base; dark redefines only what changes, under **both** the OS media query and
an explicit `[data-theme]` stamp — so a manual toggle wins in either direction. No
component contains a raw hex.

Dark mode is *selected*, not an automatic flip: each chart hue is re-stepped for the dark
surface and validated as a set.

### Charts

Hand-written SVG for the donut and sparkline, so the 2px surface gap between fills and the
4px rounded data-ends are exact. Recharts is not used; the shapes needed are simple enough
that a library costs bundle size and control without buying anything.

The palette was validated, not chosen by eye — see `docs/DECISIONS.md` §2. Status states
(present/late/absent) use reserved status colours with an icon and a label, never colour
alone; two of those hues sit below 3:1 on the light surface, so the label *is* the
accessibility channel.

### Route guarding

`middleware.ts` checks only for the *presence* of the refresh cookie and redirects. It
deliberately does not validate it — cheap edge redirects keep signed-out users off app
routes, and the API remains the actual boundary since it re-verifies everything.

---

## Async work

Report exports create the job row first and run the build detached, so a 20,000-row payroll
register never blocks a request. The client polls the job, then downloads. Artefacts carry
an `expiresAt` and are swept.

For a single-process deployment this is enough. The BullMQ/Redis dependency is in place for
the point at which exports should move to a separate worker process — the job model already
has the status, progress, error and expiry columns that needs.

---

## Verification strategy

Four layers, each catching what the layer below cannot:

| Layer | Catches |
|---|---|
| `packages/shared` unit tests | Arithmetic. 49 assertions pinning the tax engine to a live statement, plus leave/attendance edge cases. |
| `scripts/api-smoke.sh` | Route wiring and **authorisation boundaries** — 118 checks across 7 roles, asserting 403s and 400s as carefully as 200s. |
| `scripts/workflow-test.sh` | Write paths and their **side effects**: does approving leave actually move the balance and stamp attendance? Idempotent. |
| `scripts/screenshot.mjs` | The real browser over 34 routes. Fails on console errors, failed requests, 4xx/5xx, and pages that render but stay empty. |

The screenshot harness waits for **data**, not a fixed delay. An earlier version slept
1200ms and silently captured loading skeletons on four routes — a check that passes while
showing nothing. It now polls until no skeletons remain *and* an `<h1>` exists, and reports
a route that never settles.

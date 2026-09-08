<div align="center">

<img src="brand/png/lockup-1072.png" alt="Kormo HR" width="380">

**Multi-tenant HRMS for the full employee lifecycle — onboarding through clearance.**

Built for Bangladeshi payroll and labour rules: NBR income tax, Friday–Saturday weekends,
lakh/crore money formatting, and the Bangladesh Labour Act's leave and overtime provisions.

</div>

---

## What it is

*Kormo* (কর্ম — *work, deeds*) is a people-operations platform covering eighteen modules
behind one permission model:

| | Module | Highlights |
|---|---|---|
| 👤 | **Profile** | 8 tabs, computed service length, self-service change requests routed to HR |
| 🧭 | **Directory & org tree** | Employee and department trees that expand one level at a time |
| ⏱ | **Attendance** | Monthly grid (IT/OT/LT/BT/TH/OTH), correction workflow, break-time detail |
| 🔁 | **Shift & roster** | Rotating patterns, conditional weekends, shift exchange with two-party consent |
| ⏰ | **Overtime & comp-off** | Requests, approvals, comp-off credited to a real leave balance |
| 🌴 | **Leave** | Live "leave days vs calendar days" preview, pro-rated fractional accrual, carry-forward, Bradford factor |
| 📅 | **Holidays** | Gazetted Bangladesh calendar, per-location overrides, optional religious observances |
| 💵 | **Payroll** | Runs with a state machine, payslips with the full earning/deduction ledger |
| 🧾 | **Tax** | Bangladesh NBR engine — versioned, date-effective, per taxpayer category |
| 🎯 | **Performance** | Goal cycles with weight validation, cascading goals, two-stage review |
| ✅ | **Job confirmation** | Probation scorecard; confirming flips employment status |
| 🗺 | **Field force** | Customer visits with GPS verification, consent-gated location tracking |
| 🚀 | **Onboarding** | Four-lane checklist (Employee · HR · IT · Manager) with blockers |
| 🚪 | **E-resignation** | Notice-period arithmetic, sequential approvals, department clearance, exit interview |
| 🚪 | **Room booking** | Day/week/month grid, conflict detection, recurring series |
| 🥗 | **Food** | Subsidised meal programme, rotating menu, cut-off-aware cancellation |
| 🛟 | **Help desk** | Category-routed tickets |
| 📊 | **Reports** | Async XLSX exports with presigned-style download |

---

## Quick start

**Prerequisites:** Node 20+, Docker (for Postgres, Redis and MinIO).

```bash
git clone <this repo> && cd hrms
cp .env.example .env

npm run bootstrap     # install → start containers → push schema → seed demo data
npm run dev           # API on :4000, web on :3000
```

Open **http://localhost:3000** and sign in. API reference at
**http://localhost:4000/api/docs**.

### Sharing it on your network

Both servers already bind to every interface, so anyone on the same network can reach it
at your machine's LAN address — no configuration change needed:

```bash
# print the shareable URL
echo "http://$(ipconfig getifaddr "$(route -n get default | awk '/interface/{print $2}')"):3000"   # macOS
echo "http://$(hostname -I | awk '{print $1}'):3000"                                                # Linux
```

The browser only ever talks to port 3000 — the API is proxied through it — so a single
port is all you need to open. Auth cookies are host-only, so they work over an IP
address unchanged.

One caveat worth knowing: cookies are sent without the `Secure` flag over plain HTTP
(`COOKIE_SECURE=false` in `.env`). That is fine on a trusted LAN for a demo, but put it
behind HTTPS and set `COOKIE_SECURE=true` before exposing it any further.

### Demo accounts

Every account uses the password **`Kormo@123`**. Each one is seeded with real work
waiting, so the role is actually demonstrable rather than an empty screen.

| Username | Role | What it shows |
|---|---|---|
| `employee` | Employee | Pure self-service. Pinned salary and no declared investment, so its tax statement is stable across reseeds. |
| `manager` | Line manager | A populated approval inbox: leave, attendance corrections, overtime, comp-off |
| `hr.admin` | Head of HR | Company-wide views, profile change requests, resignation approvals, clearance |
| `payroll` | Payroll manager | Payroll runs, register, company-wide tax position |
| `field` | Field force | Customer visits and GPS tracking with consent |
| `admin` | IT administrator | Onboarding IT lane, help desk, audit trail |
| `md` | Managing Director | Everything, across both seeded companies |

### What the seed contains

~25,000 rows of coherent, deterministic demo data — 64 employees across 12 departments
in 2 companies, 8 months of attendance, 8 payroll runs, 3,000 customer visits with GPS
breadcrumbs, and a resignation at every stage of the workflow. It is generated from a
seeded PRNG, so a reset reproduces the same dataset byte for byte.

The demo tenant is fictional (*Shurjo Pharma Ltd*) and its identity is configuration, not
code — set `SEED_COMPANY_NAME`, `SEED_COMPANY_ALIAS` and `SEED_COMPANY_DOMAIN` in `.env`
and reseed to rename it. Seeded email addresses use the reserved `.example` TLD, so none
of them can reach a real inbox.

---

## Architecture

```
┌──────────────────────── same origin (:3000) ────────────────────────┐
│                                                                      │
│  Next.js 14 App Router          /api/*  ──rewrite──▶  NestJS :4000  │
│  · TanStack Query                                     · Prisma 6     │
│  · httpOnly cookie auth                               · PostgreSQL 16│
│  · Tailwind design tokens                             · Redis, MinIO │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                     packages/shared — framework-agnostic
                     tax engine · leave maths · permissions
```

**Why the API is proxied onto the app's own origin:** the system this replaces served
its API from a non-standard port, which made every request cross-origin and paid for a
CORS preflight before it. Same-origin removes that round trip and lets the auth cookies
be first-party `sameSite=lax`.

**`packages/shared` holds the logic that must not diverge.** The leave-day calculation
runs in the browser to preview "leave days vs calendar days" *and* on the server to
validate the submission — from one implementation, so the two can never disagree and
quietly cost someone a day.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design, and
[`docs/DECISIONS.md`](docs/DECISIONS.md) for what was deliberately done differently
from the system being replaced.

---

## The tax engine

Bangladesh NBR income tax is the highest-value module, so it is a pure, unit-tested
function with **nothing hardcoded** — slabs, the exemption divisor, the investment
allowance and the rebate percentages all live in the database, versioned per fiscal
year and per taxpayer category (general, female, senior citizen, disabled, gazetted
freedom fighter, third gender).

```
1  gross timeline    segment the FY on salary-effective dates
2  earning breakup   Basic 50% · House 30% · Conveyance 10% · Medical 10% + bonus
3  non-taxable       min(totalEarning ÷ 3, 500,000)
4  taxable           totalEarning − nonTaxable
5  slabs             progressive first-N-taka ladder
6  rebate            10% of (20% of taxable)
7  liability         totalTax − rebate − AIT, floored at the NBR minimum
8  paid to date      deduction-at-source ledger
9  monthly           remaining ÷ months left in the fiscal year
```

The engine is pinned by tests to an independently verified NBR worked example, so a
refactor that moves any figure by a single taka fails the build:

```
earning 1,105,000 → non-taxable 368,334 → taxable 736,666
→ tax 35,499 → rebate 14,733 → liability 20,766
```

Those are the test fixture's numbers, not the demo tenant's. The seeded `employee`
account earns ৳92,000/month, and its statement works out to:

```
earning 1,196,000 → non-taxable 398,667 → taxable 797,333
→ tax 44,599 → rebate 15,946 → liability 28,653  (৳2,388/month)
```

Rounding is *not* uniform (non-taxable ceils, tax and rebate floor, the monthly
instalment rounds half-up) because the NBR statement lands on specific integers and a
naive `round()` drifts by a taka — which shows up as a payslip that will not reconcile.

```bash
npm run test -w @kormo/shared     # 49 assertions, including every edge case
```

---

## Verification

```bash
npm run test              # shared domain logic (tax, leave maths, attendance)
npm run verify:api        # 118 endpoint checks across 7 roles, incl. 403/400/401 boundaries
npm run verify:workflow   # 18 end-to-end write-path assertions with side-effect checks
npm run verify:ui         # drives real Chrome over 34 routes, screenshots each, fails on console errors
npm run typecheck         # API + web
npm run build             # production build of all three packages
```

`verify:workflow` asserts the things that actually matter: applying for leave *holds*
the balance so it cannot be double-spent, an overlap is refused with a specific message,
an employee cannot approve their own request, and a manager's approval moves the balance
**and** stamps the attendance rows. It cleans up after itself, so it is repeatable.

`verify:ui` waits for data rather than a fixed delay — a fixed sleep silently
screenshots loading skeletons, which is a check that passes while showing nothing.

---

## Security

| | |
|---|---|
| **Tokens** | httpOnly cookies, never browser storage — a stored token is exfiltratable by any XSS |
| **Refresh** | Rotating, with reuse detection: presenting an already-rotated token revokes the whole session family |
| **Authorisation** | Permissions are re-read from the database on **every request**. The client's cached permission set is a rendering hint only |
| **Row-level scope** | One `resolveScope`/`employeeScopeWhere` helper decides "who can see whom", so visibility cannot drift between modules |
| **Mass assignment** | Self-service profile edits write only through an explicit column whitelist |
| **Salary** | Gated on its own permission — seeing a report's profile deliberately does not imply seeing their pay |
| **Enumeration** | Login and password-reset run constant-time and never reveal whether an account exists |
| **Rate limits** | 10 sign-in attempts per minute per IP |
| **Id validation** | Route params are pattern-checked, so `/employees/undefined` is an honest 400 |
| **Audit** | Append-only trail on approvals, payroll locks and salary changes |
| **Location tracking** | Explicit consent with timestamps on both transitions, a working-hours window, and a retention limit |

---

## Repository layout

```
apps/
  api/                    NestJS modular monolith
    prisma/
      schema.prisma       78 models
      seed/               deterministic demo-data generator
    src/
      common/             config, guards, scope helpers, serialisation
      modules/            18 feature modules
  web/                    Next.js 14 App Router — 35 pages
    src/
      app/(app)/          the authenticated shell and every route
      components/         ui primitives, charts, layout, dashboard widgets
      lib/                api client, session, nav, design utilities
packages/
  shared/                 tax engine, leave maths, permission keys — with tests
brand/                    logo (SVG + raster), favicon, wordmark
infra/                    docker-compose for Postgres, Redis, MinIO
scripts/                  verification harnesses
docs/                     architecture and decision records
```

---

## Licence

Private. Kormo HR © 2026.

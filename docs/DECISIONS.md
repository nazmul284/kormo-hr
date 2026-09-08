# Decisions

The brief included a reverse-engineered analysis of the system being replaced, along
with a list of weaknesses not to copy. This records what was done instead, and why —
plus the places where this build deliberately diverges from the brief.

---

## 1. Weaknesses in the reference system, and the fix

### HashRouter → real history routing

The reference SPA used `#/dashboard`, `#/myProfile/549`. A fragment never reaches the
server, so SSR, deep-link analytics and per-route metadata are all impossible.

**Here:** Next.js App Router with real paths. Every route is server-renderable, linkable
and individually code-split.

### API on port `:46002` → same-origin proxy

Serving the API from a different port makes every request cross-origin, so the browser
sends a CORS preflight `OPTIONS` before *each* call — roughly doubling perceived latency
on a chatty dashboard.

**Here:** Next.js rewrites `/api/*` to the backend, so the browser only ever talks to its
own origin. No preflight is issued at all. The CORS allowlist still exists for direct API
clients, with `maxAge: 86400` so even those cache the preflight for a day.

### Token in `localStorage` → httpOnly cookies with rotation

A token in `localStorage` is readable by any injected script. The reference system kept
its bearer token *and* a cached permission blob there.

**Here:** both tokens are httpOnly cookies. The access token lasts 15 minutes; refresh
tokens rotate on every use and only their SHA-256 hash is stored, so a database leak
yields no live sessions. Presenting an already-rotated token is treated as a leak and
revokes the entire token family — see `TokenService.rotateRefreshToken`.

### Client-cached permissions → server re-authorisation on every request

The reference system cached `additional-access` client-side and trusted it.

**Here:** `SessionService.loadPrincipal` re-reads roles, permissions, tenant grants and
feature flags from the database on **every single request**. A permission revoked by HR
takes effect immediately rather than whenever the token happens to expire. The client
receives the permission list purely to decide what to *render*; it is never the
authorisation boundary. Both the API and the UI say so in comments, because this is
exactly the kind of thing that gets "optimised" back into a bug.

### N+1 avatar fetches → initials, and lazy tree expansion

The reference org-tree page fired roughly forty separate `/img/*` requests.

**Here:** avatars are rendered as initials from a deterministic palette — zero requests.
A real photo is only fetched when one exists. The org tree also expands one level at a
time (`?maxLevel=`, with `hasChildren` per node) instead of dumping the whole hierarchy.

### `GET /undefined` and `GET /null` → validated route params

The reference system built URLs from unvalidated client state and fired live requests to
`/undefined`, which returned 503.

**Here:** `ParseBigIntPipe` and `ParseIntIdPipe` pattern-check every id param, so a bad
id is an honest `400` with a readable message. The `/profile/[id]` page guards the same
way client-side and renders an explanation rather than a failed request. Both are covered
by the smoke test.

### Hot-linked third-party asset → everything self-hosted

The reference UI loaded an icon from `findicons.com`, which 503'd.

**Here:** the logo is inline SVG, icons come from a bundled library, and there are no
runtime third-party asset requests. The only external requests are OpenStreetMap tiles
on the two map routes, which is inherent to using a tile map.

### xhr-polling every 25s → targeted polling

The reference system fell back to SockJS xhr-polling, hitting
`/userNotification/.../xhr` every 25 seconds per open tab.

**Here:** the notification bell polls one small count endpoint once a minute, and live
tracking polls only while that tab is open. A WebSocket gateway is wired into the API for
push, but polling a cheap count is the honest default rather than holding a connection
open for every signed-in tab. See "Not built" below.

---

## 2. Deliberate divergences from the brief

### `bigserial` employee ids were kept, with a serialisation boundary

The brief's DDL specifies `bigserial`. JavaScript `BigInt` does not survive
`JSON.stringify`, and `bigint === number` is silently false — a real bug source.

Rather than quietly switching to `int`, the type was kept and the friction handled at one
place: a `SerializeInterceptor` normalises BigInt and Prisma `Decimal` on every response,
so a newly added field can never leak a `{s,e,d}` Decimal blob or throw on serialisation.

### PDF generation uses `pdfkit`, not Puppeteer

The brief suggests Puppeteer for PDF. That pulls a ~200 MB Chromium download into every
install and every CI run. `pdfkit` is pure JavaScript and adequate for payslips and tax
statements, which are tabular documents rather than rendered web pages.

### Report exports are XLSX only, for now

`exceljs` covers the register, ledger and directory exports that finance and HR actually
use. The job model, status polling, expiry and download flow are all in place, so adding
a PDF renderer is a new branch in `ReportsService.buildDataset`, not a new subsystem.

### The rebate formula follows the reference system, not current NBR law

The brief's worked example computes `allowable = 20% × taxable` and
`rebate = 10% × allowable`. Current NBR law is a three-way minimum (3% of taxable income,
15% of actual investment, or a hard cap).

The defaults reproduce the brief so the numbers match a live statement — but both
percentages are **database columns**, per fiscal year and per category. Correcting to
current law is an `UPDATE`, not a code change. This is called out in
`bd-presets.ts` so nobody mistakes the default for a claim about the law.

### Chart palette was re-derived, not copied

The brief lists per-leave-type colours (casual orange, sick purple, and so on) and those
are kept as *entity* colours — a leave type keeps its identity everywhere.

For charts, the palette was rebuilt around the brand indigo and **validated** rather than
eyeballed: lightness band, chroma floor, colour-vision-deficiency separation and contrast,
in both light and dark mode, against the app's actual surfaces. All 720 orderings of a
seven-hue set were enumerated; none cleared the CVD gate, because red and green were
forced adjacent. The set was cut to five, and red/green reserved exclusively for *status*
— which is what they mean anyway. Present/late/absent are states, not categories, so they
wear status colours with an icon and a label, never colour alone.

### Attendance is not partitioned yet

The brief calls for `PARTITION BY RANGE(date)` on the attendance table. The schema is
written for it and the intent is documented on the model, but Prisma cannot express
declarative partitioning, so it would need a raw migration. At 14,000 seeded rows it
would be premature; the indexes that matter (`[companyId, date]`, `[date, status]`,
`[employeeId, date]`) are in place.

---

## 3. Things worth knowing about the implementation

### Leave-day maths exists exactly once

The form previews "leave days vs calendar days" live while the user types, and the server
recomputes on submit. If those two implementations ever diverged, employees would silently
lose days. `computeLeaveDays` therefore lives in `packages/shared` and is called from both
sides — the preview endpoint is a thin wrapper over the same function the validator uses.

### Leave balance is held, not just checked

Applying for leave increments a `pendingCount` **inside the same transaction** that creates
the request. Checking the balance and then writing would let two requests submitted at the
same moment both pass and overdraw the entitlement.

### Approving leave writes through to attendance

An approval moves the balance from pending to consumed *and* stamps the attendance rows for
the range as `LEAVE`, skipping weekends and holidays. Without that, the monthly grid and
payroll would disagree with the decision the manager just made.

### Rejections require a reason

The shared decision dialog will not submit a rejection without a note. An unexplained
rejection is the most common complaint about approval workflows, and the person on the
other end has no way to ask.

### Consent for location tracking is real, not a checkbox

Nobody is tracked by default. The employee turns it on themselves and can withdraw it at
any time; both transitions are timestamped. Points outside the configured working-hours
window are discarded, sessions are purged after a retention period, and the overview
screen **lists the people who have not consented** rather than silently omitting them from
the map — a manager looking at a map with someone missing should know why.

### Empty states explain themselves

"You are not enrolled in a goal cycle yet" instead of a blank list; "No holidays published
for 2028" instead of "No data". A bare empty list leaves the user unable to tell a filter
from a permission problem from a genuinely empty month.

### The demo data is guaranteed, not just random

Random distribution left the hand-placed `manager` login with an empty approval inbox — the
one thing that account exists to demonstrate. A final seed step guarantees each demo role
has representative work waiting, without disturbing the statistical shape of the rest.

---

## 4. Not built

Stated plainly rather than implied:

- **A separate admin/HR back-office console.** The brief notes the reference admin app was
  unreachable from the analysed role. Administrative capability is present here as
  permission-gated routes inside the same app (`/company`, payroll runs, tax configuration,
  onboarding templates) rather than a second front end.
- **Employee/company CRUD write endpoints.** Reads, workflows and approvals are complete;
  creating and editing employee master data is designed for (permissions, DTOs and the
  audit trail all exist) but the write endpoints are not implemented.
- **The realtime gateway is wired, not used.** `@nestjs/websockets` is installed and the
  module is registered, but no events are emitted yet — the UI polls. Swapping the bell and
  the tracking map to push is a contained change.
- **File uploads.** Document paths are stored and rendered throughout, and an
  S3/MinIO-compatible bucket is provisioned, but the upload endpoint and thumbnail worker
  are not implemented; the seed writes plausible paths.
- **Email/SMS delivery.** Password-reset tokens are generated and stored correctly; in
  development the token is logged rather than sent. A real transport belongs behind an
  outbound queue.
- **Bengali localisation.** The UI is English throughout, with Bangladeshi conventions
  (lakh/crore grouping, ৳, Fri–Sat weekend, July fiscal year) applied where they affect
  correctness rather than only presentation.

# Seeding demo data

The seed generates a complete, coherent company — about 23,000 rows across
every module — from a deterministic PRNG. Reset it and you get the same
dataset byte for byte, which is what makes screenshots, documentation and the
verification harnesses possible.

```bash
npm run db:seed
```

That truncates every table and rebuilds from scratch. It takes about a minute.

---

## What you get

64 employees across 12 departments in 2 companies, with:

| | |
|---|---|
| **Attendance** | ~14,700 rows — eight months, with late arrivals, breaks and corrections |
| **Leave** | 320 requests across every status, with balances that reconcile |
| **Payroll** | 8 runs, ~460 payslips with the full earning/deduction ledger |
| **Tax** | ~120 statements, two fiscal years, every filing category |
| **Performance** | 287 goals across cycles, with reviews at each stage |
| **Field force** | 2,400 customer visits with GPS breadcrumbs |
| **Lifecycle** | Onboarding in progress, and a resignation at every stage |

Every demo account is seeded with *real work waiting* — `manager` opens onto a
populated approval inbox, not an empty screen.

---

## Accounts

Every account uses the password **`Kormo@123`**.

| Username | Role | What it shows |
|---|---|---|
| `md` | Managing Director | Everything, across both companies |
| `hr.admin` | Head of HR | Company-wide views, change requests, clearance |
| `manager` | Line manager | Approval inbox: leave, corrections, overtime, comp-off |
| `payroll` | Payroll manager | Runs, register, company-wide tax position |
| `employee` | Employee | Pure self-service |
| `field` | Field force | Customer visits, GPS tracking with consent |
| `admin` | IT administrator | Onboarding IT lane, help desk, audit trail |

Names come from the country pack, so `md` is a different (but stable) person
in each. The **usernames never change** — everything in the docs and tests
refers to accounts by username for exactly that reason.

---

## Configuration

All optional. Set them in `.env` or inline.

### Country

```bash
SEED_COUNTRY=US npm run db:seed
```

`INTL` (default), `US`, `GB`, `IN`, `AE`, `BD`. This switches currency,
weekend, holidays, tax rules, names, addresses, banks and identifier formats
in one move. See [LOCALIZATION.md](LOCALIZATION.md).

### Company identity

```bash
SEED_COMPANY_NAME="Acme Health Ltd"
SEED_COMPANY_ALIAS="acme"
SEED_COMPANY_DOMAIN="acme.example"
SEED_COMPANY_TAG_PREFIX="AHL"          # employee tags: AHL-101, AHL-102…
SEED_SECOND_COMPANY_NAME="Acme Logistics Ltd"
SEED_SECOND_COMPANY_ALIAS="acme-logistics"
```

Mail domains should stay under the reserved `.example` TLD so a seeded address
can never reach a real inbox.

### Size and clock

```bash
SEED_EMPLOYEE_COUNT=64      # headcount in the primary company
SEED_TODAY=2026-09-13       # pin "today" — CI uses this so a pack cannot
                            # pass only because of the date it ran on
SEED_DEFAULT_PASSWORD=...   # the shared demo password
```

Pinning `SEED_TODAY` is the difference between a reproducible dataset and one
that drifts: attendance, payroll periods and the tax year are all anchored to
it.

---

## Determinism

The PRNG is seeded with a constant, so:

- Employee 42 has the same attendance on every reset
- The `employee` account's salary is **pinned** rather than taken from the
  designation table, so its tax statement is stable and the docs can quote
  concrete figures for it
- Demo account names come from the pack by index, not at random

If you need a *different* dataset, change the country or the headcount — do
not reach for randomness.

---

## Everything in it is fictional

This matters because the repository is public and the data ends up in forks,
screenshots and bug reports.

- **Phone numbers** come from ranges reserved for fiction (Ofcom's
  `07700 900xxx`, the NANP's `555-01xx`) or an all-zero subscriber body no
  operator issues. None can ring anyone.
- **National IDs and tax references** are structurally invalid by
  construction — a seeded Aadhaar starts `0000`, which no real one does.
- **Email addresses** use the reserved `.example` TLD.
- **Companies, banks, universities and previous employers** are invented.

If something looks too close to a real organisation, that is a bug worth
reporting.

---

## Resetting

```bash
npm run db:seed      # truncate and regenerate — the usual one
npm run db:reset     # drop and replay migrations, no seed
npm run infra:nuke   # destroy the containers and their volumes
```

`db:seed` truncates with `RESTART IDENTITY CASCADE` in a single statement, so
IDs stay stable between runs and foreign-key ordering never matters mid-way.
You do not need a migration reset to reseed.

---

## Troubleshooting

**`taxStatements 0` in the summary.** The salary scale for your country pack
puts the whole workforce under the tax threshold. See
[LOCALIZATION.md](LOCALIZATION.md#salaryscale).

**`Unique constraint failed on (company_id, code)`.** Two salary components
share a code — usually a pack declaring a `TRANSPORT` earning head, which
collides with the fixed transport subsidy. Use `CONVEYANCE`.

**`No demo data pack for country "XX"`.** The runtime pack exists but the demo
pool does not. Both halves are required; see
[LOCALIZATION.md](LOCALIZATION.md).

**Seed hangs or the database refuses connections.** `npm run infra:up`, then
`node scripts/wait-for-db.mjs`. On macOS, Docker Desktop must be running —
`docker info` should succeed.

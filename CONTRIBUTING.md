# Contributing to Kormo HR

Thanks for taking a look. This document covers how to get it running, what the
project cares about, and the one contribution that is most wanted.

---

## Get it running

```bash
git clone https://github.com/nazmul284/kormo-hr.git && cd kormo-hr
cp .env.example .env
npm run bootstrap     # install → containers → schema → seed
npm run dev           # API :4000, web :3000
```

Sign in at <http://localhost:3000> as `md` / `Kormo@123`. If anything in that
sequence fails, that is a bug worth reporting — the bootstrap is meant to work
on a clean machine with only Node 22+ and Docker.

---

## Before you open a pull request

```bash
npm run typecheck     # API + web
npm run test          # shared domain logic — tax, leave maths, attendance
npm run verify:api    # 120 checks across 7 roles — statuses, 403/401 boundaries, bodies
npm run verify:workflow  # 18 end-to-end write-path assertions
```

All four must pass. CI runs the same commands, so there are no surprises.

`npm run verify:ui` drives real Chrome over 34 routes and fails on a console
error. It needs a browser, so CI does not run it — but run it yourself if you
touched the front end.

---

## The contribution that is most wanted: a country pack

The product ships six ([International](packages/shared/src/locale/packs/international.ts),
US, UK, India, UAE, Bangladesh). Adding a seventh is two files and no changes
anywhere else — that is the whole design.

1. **`packages/shared/src/locale/packs/<country>.ts`** — currency and its
   grouping, weekend days, timezone, public holidays, tax slabs, and the
   formats for phone numbers and national IDs.
2. **`apps/api/prisma/seed/packs/<country>.ts`** — demo pools: names, cities,
   banks, universities, previous employers.
3. Register both in the respective `registry.ts` / `index.ts`.

Then `SEED_COUNTRY=XX npm run db:seed` and look at the result.

[docs/LOCALIZATION.md](docs/LOCALIZATION.md) walks through it properly,
including what each field means and how the tax engine consumes it.

**Two rules for a pack, and they are not negotiable:**

- **Every generated phone number and identifier must be provably fake.** Use
  your regulator's reserved fiction range if it publishes one (Ofcom's
  `07700 900xxx`, the NANP's `555-01xx`); otherwise use an all-zero
  subscriber body no operator issues. This repository is public and its seed
  data ends up in forks, screenshots and bug reports. A "realistic" number is
  a stranger's phone ringing.
- **Invent every organisation.** No real banks, universities or employers.

Tax figures are best-effort and labelled illustrative — they live in the
database precisely so a payroll officer can correct them without touching
code. Do not represent a pack as filing-grade.

---

## What the code cares about

Read an existing module before writing a new one; the conventions are visible
and consistent. The ones worth stating outright:

- **Domain logic that both sides need lives in `packages/shared`.** The leave
  day calculation runs in the browser to preview "leave days vs calendar days"
  *and* on the server to validate the submission. One implementation, so the
  two can never disagree and quietly cost someone a day.
- **Authorisation is re-read from the database on every request.** The
  client's permission set is a rendering hint. Never gate on it server-side.
- **Nothing branches on a country code outside `locale/packs/`.** If you find
  yourself writing `if (country === 'XX')`, the pack is missing a field — add
  the field.
- **Comments explain *why*.** The code already says what. A comment that
  restates the line above it is noise; one that records the bug that made the
  line necessary is worth keeping.
- **Money is `Decimal` in the database and rounded deliberately.** The tax
  engine's rounding is not uniform and that is on purpose — read the note at
  the top of `packages/shared/src/tax/engine.ts` before changing any of it.

---

## Commits and branches

Branch off `main`. Conventional-commit prefixes (`feat:`, `fix:`, `docs:`,
`refactor:`, `test:`, `chore:`) are appreciated but not enforced.

A good pull request says what changed and why, and mentions anything you
deliberately did not do. A screenshot for anything visual saves a review round
trip.

---

## Reporting bugs

Include the country pack you seeded with (`SEED_COUNTRY`), the demo account you
were signed in as, and what you expected instead. If it is a data problem, the
seed is deterministic — say which employee or which month and it will
reproduce exactly.

Security problems go through [SECURITY.md](SECURITY.md), not the issue tracker.

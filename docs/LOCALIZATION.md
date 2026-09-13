# Country packs

Everything that differs between one country's HR setup and another's lives in
a **country pack**. Six ship with the project; adding a seventh is two files
and no changes anywhere else.

That constraint is the design. **Nothing outside `locale/packs/` may branch on
a country code.** If you find yourself writing `if (country === 'XX')`, the
pack is missing a field — add the field.

---

## What ships

| Code | Country | Currency | Weekend | Tax year | Income tax |
|---|---|---|---|---|---|
| `INTL` | International *(default)* | USD, 3-digit grouping | Sat–Sun | January | Illustrative 5-band |
| `US` | United States | USD | Sat–Sun | January | Federal, 4 filing statuses |
| `GB` | United Kingdom | GBP | Sat–Sun | April | HMRC, personal allowance |
| `IN` | India | INR, lakh/crore | Sat–Sun | April | New regime, 7 bands |
| `AE` | United Arab Emirates | AED | Sat–Sun | January | None — a nil statement |
| `BD` | Bangladesh | BDT, lakh/crore | **Fri–Sat** | July | NBR, rebate + minimum tax |

`INTL` is the default and is deliberately placeless: round numbers, a neutral
holiday calendar, and a fictional city. It is what you evaluate with and what
you fork.

Switch with one variable:

```bash
SEED_COUNTRY=IN npm run db:seed
```

---

## The two halves of a pack

### 1. Runtime rules — `packages/shared/src/locale/packs/<country>.ts`

Loaded by the API and shipped to the browser with the session. Keep it small;
it travels to every client.

```ts
export const KENYA: CountryPack = {
  code: 'KE',
  name: 'Kenya',
  flag: '🇰🇪',
  timezone: 'Africa/Nairobi',
  locale: 'en-KE',
  currency: { code: 'KES', symbol: 'KSh ', locale: 'en-KE', grouping: 'western', decimals: 2 },
  weekendDays: [6, 0],              // 0 = Sunday … 6 = Saturday
  workWeekLabel: 'Monday – Friday',
  phone:      { dialCode: '254', pattern: '700 000 0##', reservedBy: '…', example: '…' },
  nationalId: { label: 'National ID', pattern: '0000####', reservedBy: '…', example: '…' },
  taxId:      { label: 'KRA PIN',     pattern: 'A0000#####A', reservedBy: '…', example: '…' },
  tax: { /* see below */ },
  holidays: { 2026: [{ name: 'Jamhuri Day', start: '2026-12-12' }] },
  bankTransferTypes: [{ code: 'EFT', label: 'Electronic funds transfer' }],
};
```

Register it in `packages/shared/src/locale/registry.ts`.

### 2. Demo pools — `apps/api/prisma/seed/packs/<country>.ts`

Only ever read by the seed script, which is why it is separate: there is no
reason for a few thousand names to reach anyone's browser.

Names, neighbourhoods, regions, secondary cities with real coordinates, banks,
universities, previous employers, customer chains, and a `salaryScale`.

Register it in `apps/api/prisma/seed/packs/index.ts`.

---

## `salaryScale`

One designation table drives every country. It is written in Bangladeshi taka
(scale `1`) because that is where it came from; every other pack multiplies it.

```ts
salaryScale: 0.05,   // 450,000 BDT for an MD → 22,500 USD/month
```

Get this roughly right. It is not cosmetic — `isTaxApplicable` and the meal
subsidy are both derived from it, so a scale that is an order of magnitude out
puts the entire seeded workforce under the tax threshold and the tax module
renders empty. `npm run db:seed` prints `taxStatements` in its summary; if that
is `0`, your scale is wrong.

---

## The tax pack

The engine (`packages/shared/src/tax/engine.ts`) is country-agnostic. It takes
a config and returns a computation. A pack's job is to build that config.

### Exemption shape

Two shapes, never both:

```ts
// Flat standard deduction — most of the world.
nonTaxableFlat: 15_000,

// Proportional, capped — South Asia. Used when nonTaxableFlat is absent.
nonTaxableDivisor: 3,
nonTaxableCap: 500_000,
```

The UI reads which one is set and labels the line accordingly, so the person
checking their payslip sees "Standard deduction — flat $15,000" or "Non-taxable
allowance — lesser of one third of earnings or ৳500,000".

### Bands

`slabAmount` is the **width** of the band, not a cumulative ceiling. `null`
means "everything still remaining".

```ts
slabs: [
  { seq: 1, slabAmount: 24_000, rate: 0,  label: 'First 24,000 @ 0%' },
  { seq: 2, slabAmount: 8_333,  rate: 25, label: 'Next 8,333 @ 25%' },
  { seq: 3, slabAmount: null,   rate: 30, label: 'On the balance @ 30%' },
]
```

### Filing categories

Declare only the ones your country actually distinguishes. `GENERAL` is the one
every pack has.

```ts
categories: ['GENERAL', 'SENIOR_CITIZEN', 'NON_RESIDENT'],
categoryLabels: { GENERAL: 'Resident individual', /* … */ },
```

The API picks a category from HR data where a country grants the relief
automatically (age, gender). **Marital filing statuses are never inferred** —
the system does not know whether someone files jointly or separately, and
guessing produces a confidently wrong tax figure. They are for a payroll
officer to set.

### No income tax?

Ship a single zero-rate band rather than `tax: null` — see the UAE pack. The
module stays switched on and produces a statement that reads "nil", which is
more useful to a payroll officer than a page that vanished.

### Earning components

`pctOfGross` must total 100. Countries that do not split pay declare one head:

```ts
earningComponents: [{ code: 'BASIC', label: 'Base Salary', pctOfGross: 100 }],
```

The payslip schema carries four columns (basic / house rent / conveyance /
medical). `splitGross()` maps component codes onto them — `HOUSE_RENT`, `HRA`
and `HOUSING` land in house rent; `CONVEYANCE` and `TRANSPORT` in conveyance;
`MEDICAL` in medical; anything unrecognised folds into basic so the four
columns always sum back to gross. **`TRANSPORT` is taken** by the fixed
company-wide transport subsidy — use `CONVEYANCE` for a percentage head.

---

## Fictional numbers — the one hard rule

**Every generated phone number and identifier must be provably fake.**

This repository is public. Its seed data ends up in forks, screenshots and bug
reports. A "realistic" phone number is a stranger's phone ringing at 3am
because somebody cloned a demo.

Use your regulator's reserved fiction range where one is published:

| Country | Range | Reserved by |
|---|---|---|
| US | `555-0100` – `555-0199` | NANP, reserved for fictional use |
| UK | `07700 900000` – `900999` | Ofcom, for drama and documentation |
| INTL | `+99 …` | ITU — country code `99` is unassigned |

Where none exists (India, Bangladesh, UAE), use an **all-zero subscriber body**
that no operator allocates, and say so in `reservedBy`.

Identifiers use the same idea — make them structurally invalid:

- Aadhaar never begins with `0` or `1` → pattern starts `0000`
- A US SSN is never issued in the `900`–`999` area range
- A Bangladeshi NID never begins with `0`

The generator template is `#` for a digit, `A` for an uppercase letter, and
everything else literal.

**Invent every organisation** too. Banks, universities and previous employers
in the demo pools are all fictional. If one is too close to a real
institution, that is a bug worth reporting.

---

## Tax figures are illustrative

Every pack's figures are labelled illustrative and none is filing-grade. They
live in the **database**, not the code, precisely so a payroll officer can
correct them for their own fiscal year without touching TypeScript — add a new
`TaxConfig` row rather than editing last year's.

Do not represent a pack as authoritative, and do not file a tax return with it.

---

## Checklist

- [ ] `packages/shared/src/locale/packs/<country>.ts`, registered in `registry.ts`
- [ ] `apps/api/prisma/seed/packs/<country>.ts`, registered in `index.ts`
- [ ] `salaryScale` set — `taxStatements` in the seed summary is non-zero
- [ ] Every phone number and identifier is from a fictional range
- [ ] Every organisation name is invented
- [ ] `SEED_COUNTRY=XX npm run db:seed` completes
- [ ] Sign in and look at the dashboard, a payslip and the tax statement
- [ ] Added to the matrix in `.github/workflows/ci.yml` and the table above

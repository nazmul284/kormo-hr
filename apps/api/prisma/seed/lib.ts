import { PrismaClient } from '@prisma/client';
import { fictionalPhone, fromTemplate, getCountryPack } from '@kormo/shared';

import { getDemoPack } from './packs';

export const prisma = new PrismaClient({ log: ['warn', 'error'] });

/**
 * Deterministic PRNG (mulberry32). The seed data must be reproducible:
 * a demo where "employee 42" has different attendance on every reset is
 * impossible to write documentation or screenshots against.
 */
export function makeRng(seed = 0x4b6f726d) {
  let a = seed >>> 0;
  return function rng(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rng = makeRng();

export const randInt = (min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min;
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
export const pickN = <T>(arr: readonly T[], n: number): T[] => {
  const pool = [...arr];
  const out: T[] = [];
  while (out.length < n && pool.length > 0) {
    out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return out;
};
export const chance = (pct: number) => rng() * 100 < pct;
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ── country packs ─────────────────────────────────────────────────────

/**
 * The country being seeded. One env var switches the entire dataset:
 * currency, weekend, holidays, tax slabs, names, addresses, banks and
 * identifier formats all follow from it.
 *
 *   SEED_COUNTRY=US npm run db:seed
 *
 * `INTL` is a deliberately placeless default — see
 * packages/shared/src/locale/packs/international.ts.
 */
export const SEED_COUNTRY = (process.env.SEED_COUNTRY ?? 'INTL').toUpperCase();

/** Runtime rules: currency, weekend, holidays, tax, identifier formats. */
export const PACK = getCountryPack(SEED_COUNTRY);
/** Demo pools: names, addresses, banks, universities, employers. */
export const DEMO = getDemoPack(SEED_COUNTRY);

export const BLOOD_GROUPS = ['A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG'] as const;

// ── fictional identifiers ─────────────────────────────────────────────
//
// Every generated contact detail is drawn from a block that provably
// cannot belong to a real person — a regulator-reserved fiction range
// where one is published, an all-zero body where none is. This repository
// is public and its seed data ends up in forks and screenshots; a
// "realistic" phone number here is somebody's phone ringing.

/** A fictional phone number in E.164 form, e.g. "+99 0100000142". */
export function phone(): string {
  return fictionalPhone(PACK.phone, rng);
}

/** A structurally-invalid national ID in the pack's local format. */
export function nationalId(): string {
  return fromTemplate(PACK.nationalId.pattern, rng);
}

/** A structurally-invalid taxpayer reference in the pack's local format. */
export function taxId(): string {
  return fromTemplate(PACK.taxId.pattern, rng);
}

// ── money ─────────────────────────────────────────────────────────────

/**
 * Converts a figure from the shared salary table into the pack's currency.
 *
 * Rounded to the nearest hundred so payslips do not read as though
 * someone was paid 17,483.62 a month — salary bands are round numbers
 * everywhere, and an un-rounded one is the first thing that makes seeded
 * data look seeded.
 */
export function salary(baseline: number): number {
  return Math.round((baseline * DEMO.salaryScale) / 100) * 100;
}

/**
 * Splits a gross figure into the four statutory heads the payslip schema
 * carries, using the country pack's own percentages.
 *
 * The schema pins four columns (basic / house rent / conveyance /
 * medical) because that is the split Bangladeshi payroll needs and the
 * payslip renders. Packs whose country does not split pay at all — the
 * US and UK — declare a single 100% Basic head and land everything in
 * `basic`, which is the honest answer rather than an invented breakdown.
 *
 * A component code the mapping does not recognise folds into `basic`, so
 * the four columns always sum back to gross. Adding a head to a pack can
 * therefore never silently lose money off a payslip.
 */
export function splitGross(gross: number): {
  basic: number; houseRent: number; conveyance: number; medical: number;
} {
  const out = { basic: 0, houseRent: 0, conveyance: 0, medical: 0 };
  const components = PACK.tax?.earningComponents ?? [{ code: 'BASIC', label: 'Basic', pctOfGross: 100 }];

  for (const component of components) {
    const amount = round2((gross * component.pctOfGross) / 100);
    switch (component.code) {
      case 'HOUSE_RENT': case 'HRA': case 'HOUSING': out.houseRent += amount; break;
      case 'CONVEYANCE': case 'TRANSPORT': out.conveyance += amount; break;
      case 'MEDICAL': out.medical += amount; break;
      default: out.basic += amount; break;
    }
  }

  // Percentages that do not land on whole units leave a unit of dust;
  // give it to basic so the four columns reconcile against gross exactly.
  const drift = round2(gross - (out.basic + out.houseRent + out.conveyance + out.medical));
  out.basic = round2(out.basic + drift);
  return out;
}

// ── date helpers (all UTC-noon anchored, so no DST/tz drift) ──────────
export const MS_DAY = 86_400_000;

export function d(iso: string): Date {
  const [y, m, day] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, day ?? 1, 12));
}

export function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, n: number): Date {
  return new Date(date.getTime() + n * MS_DAY);
}

export function addMonths(date: Date, n: number): Date {
  const r = new Date(date.getTime());
  r.setUTCMonth(r.getUTCMonth() + n);
  return r;
}

export function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12));
}

export function endOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12));
}

export function eachDay(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  for (let t = from.getTime(); t <= to.getTime(); t += MS_DAY) out.push(new Date(t));
  return out;
}

/**
 * The tenant timezone's offset from UTC, in minutes, at a given instant.
 *
 * Computed per-date rather than taken as a constant because half the
 * packs ship a timezone that observes DST: a fixed offset would shift
 * every clock-in by an hour for half the seeded year, which reads as a
 * fleet-wide late-arrival spike in the attendance grid.
 */
export function tzOffsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get('year'), get('month') - 1, get('day'),
    get('hour') % 24, get('minute'), get('second'),
  );
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** Builds a Date at a given HH:mm local time on a given day, in the tenant's timezone. */
export function atTime(day: Date, hhmm: string, jitterMinutes = 0): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const minutes = h * 60 + m + jitterMinutes;
  const midnightUtc = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
  // Probe the offset on the day itself so a DST transition is respected.
  const offset = tzOffsetMinutes(PACK.timezone, new Date(midnightUtc));
  return new Date(midnightUtc + (minutes - offset) * 60_000);
}

/** Weekend per the seeded country's pack — Sat/Sun in most, Fri/Sat in Bangladesh. */
export const isWeekend = (date: Date) => PACK.weekendDays.includes(date.getUTCDay());

/** "TODAY" for the whole seed run — one fixed clock keeps data coherent. */
export const TODAY = d(process.env.SEED_TODAY ?? new Date().toISOString().slice(0, 10));

// ── console ──────────────────────────────────────────────────────────
let step = 0;
export function log(message: string, detail?: string | number) {
  step += 1;
  const num = String(step).padStart(2, '0');
  console.log(
    `  \x1b[36m${num}\x1b[0m ${message}${detail !== undefined ? ` \x1b[2m→ ${detail}\x1b[0m` : ''}`,
  );
}

export function section(title: string) {
  console.log(`\n\x1b[1m\x1b[35m${title}\x1b[0m`);
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/(^\.|\.$)/g, '');
}

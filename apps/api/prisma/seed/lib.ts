import { PrismaClient } from '@prisma/client';

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

/** Builds a Date at a given HH:mm on a given day, in Asia/Dhaka (UTC+6). */
export function atTime(day: Date, hhmm: string, jitterMinutes = 0): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const minutes = h * 60 + m + jitterMinutes;
  // Dhaka is UTC+6, so subtract the offset to store the correct instant.
  return new Date(
    Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 0, 0, 0) +
      (minutes - 360) * 60_000,
  );
}

export const isWeekendBd = (date: Date) => [5, 6].includes(date.getUTCDay()); // Fri, Sat

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

// ── Bangladeshi name pools ────────────────────────────────────────────
export const MALE_FIRST = [
  'Nazmul', 'Tanvir', 'Rakib', 'Sajjad', 'Imran', 'Mahfuz', 'Shahriar', 'Arif',
  'Farhan', 'Rashed', 'Sabbir', 'Zahid', 'Ashiqur', 'Mizanur', 'Kamrul', 'Rifat',
  'Naimul', 'Tahmid', 'Sazid', 'Mehedi', 'Asif', 'Rezaul', 'Shakib', 'Anisur',
  'Jubayer', 'Redwan', 'Towhid', 'Golam', 'Masud', 'Sohel', 'Ariful', 'Nurul',
];

export const FEMALE_FIRST = [
  'Nusrat', 'Tahmina', 'Sadia', 'Farzana', 'Rumana', 'Sabrina', 'Ishrat', 'Maliha',
  'Nabila', 'Sumaiya', 'Tasnim', 'Afsana', 'Jannatul', 'Mahmuda', 'Shireen', 'Rubaiya',
  'Anika', 'Samira', 'Fahmida', 'Noshin', 'Raisa', 'Sharmin', 'Tania', 'Lubna',
];

export const SURNAMES = [
  'Hossain', 'Rahman', 'Islam', 'Ahmed', 'Chowdhury', 'Karim', 'Akter', 'Khatun',
  'Uddin', 'Alam', 'Haque', 'Sarker', 'Mia', 'Bhuiyan', 'Talukder', 'Molla',
  'Siddique', 'Mahmud', 'Kabir', 'Hasan', 'Jahan', 'Sultana', 'Begum', 'Mondal',
  'Barua', 'Das', 'Roy', 'Saha', 'Dutta', 'Ghosh',
];

export const DHAKA_AREAS = [
  'Banani', 'Gulshan', 'Dhanmondi', 'Uttara', 'Mirpur', 'Mohammadpur', 'Bashundhara R/A',
  'Badda', 'Rampura', 'Motijheel', 'Tejgaon', 'Khilgaon', 'Shyamoli', 'Malibagh',
];

export const DISTRICTS = [
  'Dhaka', 'Chattogram', 'Sylhet', 'Rajshahi', 'Khulna', 'Barishal', 'Rangpur',
  'Mymensingh', 'Cumilla', 'Narayanganj', 'Gazipur', 'Bogura', 'Jessore', 'Noakhali',
];

export const BANKS = [
  { name: 'Eastern Bank PLC', branches: ['Gulshan', 'Banani', 'Motijheel'], txn: 'EBLACT' },
  { name: 'BRAC Bank PLC', branches: ['Gulshan', 'Uttara', 'Dhanmondi'], txn: 'BEFTN' },
  { name: 'City Bank PLC', branches: ['Gulshan Avenue', 'Mirpur'], txn: 'BEFTN' },
  { name: 'Dutch-Bangla Bank PLC', branches: ['Banani', 'Motijheel'], txn: 'BEFTN' },
  { name: 'Islami Bank Bangladesh PLC', branches: ['Dilkusha', 'Uttara'], txn: 'BEFTN' },
];

export const RELIGIONS = ['Islam', 'Islam', 'Islam', 'Islam', 'Hinduism', 'Buddhism', 'Christianity'];

export const BLOOD_GROUPS = ['A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG'] as const;

export const UNIVERSITIES = [
  'University of Dhaka', 'BUET', 'North South University', 'BRAC University',
  'Jahangirnagar University', 'University of Chittagong', 'AIUB', 'IUT',
  'Rajshahi University', 'East West University', 'Khulna University', 'SUST',
];

export const DEGREES = [
  { degree: 'BSc in Computer Science & Engineering', major: 'CSE' },
  { degree: 'BBA', major: 'Finance' },
  { degree: 'BBA', major: 'Marketing' },
  { degree: 'MBA', major: 'Human Resource Management' },
  { degree: 'BSc in Pharmacy', major: 'Pharmacy' },
  { degree: 'MSc in Statistics', major: 'Statistics' },
  { degree: 'BA in English', major: 'English Literature' },
  { degree: 'BSc in Electrical & Electronic Engineering', major: 'EEE' },
];

export const PREV_EMPLOYERS = [
  'Grameenphone Ltd', 'bKash Limited', 'Robi Axiata', 'Square Pharmaceuticals',
  'BRAC', 'Beximco Pharmaceuticals', 'Pathao', 'ShopUp', 'Chaldal', 'Daraz Bangladesh',
  'Therap BD', 'Samsung R&D Bangladesh', 'Augmedix', 'Enosis Solutions',
];

/** 11-digit Bangladeshi mobile number in an operator-plausible range. */
export function bdPhone(): string {
  const prefix = pick(['013', '014', '015', '016', '017', '018', '019']);
  return `${prefix}${String(randInt(10_000_000, 99_999_999))}`;
}

export function nid(): string {
  return String(randInt(1_000_000_000, 9_999_999_999));
}

export function tin(): string {
  return String(randInt(100_000_000_000, 999_999_999_999));
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/(^\.|\.$)/g, '');
}

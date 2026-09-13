import type { TaxConfigInput, TaxpayerCategory } from '../../tax/types';
import type { CountryPack, HolidaySpec } from '../types';

/**
 * India.
 *
 * The new-regime slab structure, which is the default for most salaried
 * filers. Chapter VI-A deductions largely do not apply under it, so the
 * investment rebate is zero here; a tenant that files under the old
 * regime would add a second pack rather than branch inside this one.
 */

const STANDARD_DEDUCTION = 75_000;

const BANDS: { width: number | null; rate: number }[] = [
  { width: 400_000, rate: 0 },
  { width: 400_000, rate: 5 },
  { width: 400_000, rate: 10 },
  { width: 400_000, rate: 15 },
  { width: 400_000, rate: 20 },
  { width: 400_000, rate: 25 },
  { width: null, rate: 30 },
];

function buildConfig(
  fiscalYear: string,
  category: TaxpayerCategory = 'GENERAL',
): TaxConfigInput {
  // Senior citizens keep a wider free band under the resident schedule.
  const firstBand = category === 'SENIOR_CITIZEN' ? 500_000 : 400_000;
  return {
    fiscalYear,
    category,
    nonTaxableFlat: category === 'NON_RESIDENT' ? 0 : STANDARD_DEDUCTION,
    nonTaxableDivisor: 3,
    nonTaxableCap: 0,
    investmentAllowancePct: 0,
    rebatePct: 0,
    minimumTax: 0,
    slabs: BANDS.map((b, i) => {
      const width = i === 0 ? firstBand : b.width;
      return {
        seq: i + 1,
        slabAmount: width,
        rate: b.rate,
        label: width === null
          ? `On the balance @ ${b.rate}%`
          : `${i === 0 ? 'First' : 'Next'} ${width.toLocaleString('en-IN')} @ ${b.rate}%`,
      };
    }),
  };
}

/**
 * Central government holidays only. India's state-level calendars differ
 * substantially, which is exactly what the per-location holiday override
 * in the holiday module is for. Festival dates are lunisolar and are
 * listed per year rather than computed.
 */
const FESTIVALS: Record<number, HolidaySpec[]> = {
  2025: [
    { name: 'Holi', start: '2025-03-14', religion: 'Hinduism' },
    { name: 'Eid-ul-Fitr', start: '2025-03-31', religion: 'Islam' },
    { name: 'Eid-ul-Adha', start: '2025-06-07', religion: 'Islam' },
    { name: 'Raksha Bandhan', start: '2025-08-09', religion: 'Hinduism', optional: true },
    { name: 'Janmashtami', start: '2025-08-16', religion: 'Hinduism' },
    { name: 'Dussehra', start: '2025-10-02', religion: 'Hinduism' },
    { name: 'Diwali', start: '2025-10-20', end: '2025-10-21', religion: 'Hinduism' },
  ],
  2026: [
    { name: 'Holi', start: '2026-03-04', religion: 'Hinduism' },
    { name: 'Eid-ul-Fitr', start: '2026-03-21', religion: 'Islam' },
    { name: 'Eid-ul-Adha', start: '2026-05-28', religion: 'Islam' },
    { name: 'Raksha Bandhan', start: '2026-08-28', religion: 'Hinduism', optional: true },
    { name: 'Janmashtami', start: '2026-09-04', religion: 'Hinduism' },
    { name: 'Dussehra', start: '2026-10-20', religion: 'Hinduism' },
    { name: 'Diwali', start: '2026-11-08', end: '2026-11-09', religion: 'Hinduism' },
  ],
  2027: [
    { name: 'Holi', start: '2027-03-22', religion: 'Hinduism' },
    { name: 'Eid-ul-Fitr', start: '2027-03-11', religion: 'Islam' },
    { name: 'Eid-ul-Adha', start: '2027-05-17', religion: 'Islam' },
    { name: 'Janmashtami', start: '2027-08-25', religion: 'Hinduism' },
    { name: 'Dussehra', start: '2027-10-09', religion: 'Hinduism' },
    { name: 'Diwali', start: '2027-10-29', end: '2027-10-30', religion: 'Hinduism' },
  ],
};

function holidaysFor(year: number): HolidaySpec[] {
  return [
    { name: 'Republic Day', start: `${year}-01-26` },
    ...(FESTIVALS[year] ?? []),
    { name: 'Independence Day', start: `${year}-08-15` },
    { name: 'Gandhi Jayanti', start: `${year}-10-02` },
    { name: 'Christmas Day', start: `${year}-12-25`, religion: 'Christianity' },
  ].sort((a, b) => a.start.localeCompare(b.start));
}

export const INDIA: CountryPack = {
  code: 'IN',
  name: 'India',
  flag: '🇮🇳',
  timezone: 'Asia/Kolkata',
  locale: 'en-IN',
  currency: { code: 'INR', symbol: '₹', locale: 'en-IN', grouping: 'indian', decimals: 2 },
  weekendDays: [6, 0],
  workWeekLabel: 'Monday – Friday',
  phone: {
    dialCode: '91',
    pattern: '90000 000##',
    reservedBy: 'TRAI publishes no fictional range, so the pack uses an all-zero subscriber body that no operator allocates.',
    example: '+91 90000 00042',
  },
  nationalId: {
    label: 'Aadhaar Number',
    pattern: '0000 #### ####',
    reservedBy: 'A real Aadhaar never begins with 0 or 1 — the leading zeros make these structurally invalid.',
    example: '0000 4821 9930',
  },
  taxId: {
    label: 'PAN',
    pattern: 'AAAAA####A',
    reservedBy: 'Randomised across the full alphanumeric space and never validated against the NSDL checksum.',
    example: 'ABCDE1234F',
  },
  tax: {
    earningComponents: [
      { code: 'BASIC', label: 'Basic Salary', pctOfGross: 50 },
      { code: 'HRA', label: 'House Rent Allowance', pctOfGross: 25 },
      { code: 'MEDICAL', label: 'Medical Allowance', pctOfGross: 15 },
      { code: 'CONVEYANCE', label: 'Conveyance Allowance', pctOfGross: 10 },
    ],
    categories: ['GENERAL', 'SENIOR_CITIZEN', 'NON_RESIDENT'],
    categoryLabels: {
      GENERAL: 'Resident individual',
      SENIOR_CITIZEN: 'Senior citizen (60+)',
      NON_RESIDENT: 'Non-resident',
    },
    fiscalYearStartMonth: 4,
    authority: 'Income Tax Department, new regime (illustrative)',
    buildConfig,
  },
  holidays: Object.fromEntries(
    [2024, 2025, 2026, 2027, 2028].map((y) => [y, holidaysFor(y)]),
  ),
  bankTransferTypes: [
    { code: 'NEFT', label: 'NEFT — National Electronic Funds Transfer' },
    { code: 'IMPS', label: 'IMPS — Immediate Payment Service' },
    { code: 'RTGS', label: 'RTGS — Real Time Gross Settlement' },
    { code: 'UPI', label: 'UPI transfer' },
    { code: 'CASH', label: 'Cash disbursement' },
  ],
};

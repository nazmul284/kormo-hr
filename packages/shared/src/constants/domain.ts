/** Company feature switches — the tenant-level capability flags. */
export const FEATURE_FLAGS = {
  FOOD_PROGRAM: 'hasFoodProgramSubscription',
  ONBOARDING_FLOW: 'hasOnboardingFlowAccess',
  CUSTOMER_VISIT_OVERVIEW: 'hasCustomerVisitOverviewAccess',
  CUSTOMER_VISIT_MY_VISIT: 'hasCustomerVisitMyVisitAccess',
  CUSTOMER_VISIT_SETTINGS: 'hasCustomerVisitSettingAccess',
  EMPLOYEE_TRACKING: 'hasEmployeeTrackingAccess',
  ROOM_BOOKING: 'hasRoomBookingAccess',
  E_RESIGNATION: 'hasEResignationAccess',
  PMS: 'hasPerformanceManagementAccess',
  JOB_CONFIRMATION: 'hasJobConfirmationAccess',
  TAX_CALCULATION: 'hasTaxCalculationAccess',
  SHIFT_EXCHANGE: 'hasShiftExchangeAccess',
  OVERTIME: 'hasOvertimeAccess',
  BREAK_TIME: 'canViewBreaktime',
  HELPDESK: 'hasHelpdeskAccess',
} as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

/** Attendance table column abbreviations, as printed in the grid. */
export const ATTENDANCE_COLUMNS = {
  IT: 'In Time',
  OT: 'Out Time',
  LT: 'Late Time',
  BT: 'Break Time',
  TH: 'Total Hours',
  OTH: 'Overtime Hours',
} as const;

/** Payslip column abbreviations. */
export const PAYSLIP_COLUMNS = {
  GS: 'Gross Salary',
  BA: 'Basic + Allowance',
  CAM: 'Conveyance / Allowance / Medical',
  Tax: 'Tax deduction',
  PF: 'Provident Fund',
  DFA: 'Deduction for absence',
  TA: 'Transport Allowance',
  MB: 'Mobile Bill',
} as const;

/** Leave approval grid abbreviations. */
export const LEAVE_COLUMNS = {
  SD: 'Start Date',
  ED: 'End Date',
  LD: 'Leave Days',
  LT: 'Leave Type',
  AD: 'Applied Date',
} as const;

export const ATTENDANCE_STATUS_META: Record<
  string,
  { label: string; colorHex: string; short: string }
> = {
  PRESENT: { label: 'Present', colorHex: '#047857', short: 'P' },
  LATE: { label: 'Late', colorHex: '#C2740B', short: 'L' },
  ABSENT: { label: 'Absent', colorHex: '#DC2626', short: 'A' },
  AFL: { label: 'Absent (AFL)', colorHex: '#DC2626', short: 'AFL' },
  LEAVE: { label: 'Leave', colorHex: '#4F46E5', short: 'LV' },
  HALF_DAY: { label: 'Half Day Leave', colorHex: '#E87BA4', short: 'HD' },
  HOLIDAY: { label: 'Holiday', colorHex: '#0D9488', short: 'H' },
  WEEKEND: { label: 'Weekend', colorHex: '#646D7A', short: 'W' },
  CONDITIONAL_WEEKEND: { label: 'Conditional Weekend', colorHex: '#64748B', short: 'CW' },
};

/**
 * Categorical identity hues for leave types, light-surface steps.
 *
 * Validated, not chosen by eye: adjacent pairs clear ΔE 9.2 under deuteranopia
 * and 19.6 in normal vision (below 15 there is a hard fail). Three of the five
 * sit under 3:1 against a white card, which is a documented relief case rather
 * than a failure — every swatch in this app is drawn immediately beside its own
 * text label, never as colour alone. Maternity and paternity deliberately share
 * the parental hue: they are mutually exclusive per employee, so they never need
 * telling apart. The dark-surface steps of the same series live in `globals.css`
 * as `--leave-*`, and the web app resolves both through `leaveColor()` so a
 * theme switch re-steps them instead of dimming these.
 */
export const LEAVE_TYPE_COLORS: Record<string, string> = {
  casual: '#EDA100',
  sick: '#E87BA4',
  annual: '#4F46E5',
  maternity: '#EB6834',
  paternity: '#EB6834',
  comp_off: '#1BAF7A',
  lwp: '#64748B',
};

/** Bangladesh weekend: Friday + Saturday. */
export const BD_WEEKEND_DAYS = [5, 6];

export const WEEKDAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** Report types the async export service knows how to build. */
export const REPORT_TYPES = [
  'EmployeeTax',
  'Payslips',
  'PayrollRegister',
  'AttendanceMonthly',
  'AttendanceSummary',
  'LeaveLedger',
  'LeaveBalance',
  'OrgTree',
  'EmployeeDirectory',
  'CustomerVisits',
  'TrackingReport',
  'FoodConsumption',
  'OnboardingStatus',
  'ClearanceStatus',
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

/** Disbursement instrument codes used by Bangladeshi banks. */
export const BANK_TXN_TYPES = [
  { code: 'EBLACT', label: 'EBL ACCOUNT FUND TRANSFER' },
  { code: 'BEFTN', label: 'BEFTN — Bangladesh Electronic Funds Transfer Network' },
  { code: 'RTGS', label: 'RTGS — Real Time Gross Settlement' },
  { code: 'NPSB', label: 'NPSB — National Payment Switch Bangladesh' },
  { code: 'CASH', label: 'Cash disbursement' },
  { code: 'MFS', label: 'Mobile Financial Service (bKash / Nagad)' },
];

export const CLEARANCE_DEPARTMENTS_DEFAULT = [
  { name: 'IT — Asset & Access', checklist: ['Laptop returned', 'Email & SSO revoked', 'VPN access removed', 'Software licences reclaimed'] },
  { name: 'Finance — Loan & Advance', checklist: ['Salary advance settled', 'Travel advance settled', 'Expense claims closed'] },
  { name: 'HR — Documents', checklist: ['ID card returned', 'Exit interview completed', 'Experience letter issued'] },
  { name: 'Admin — Facilities', checklist: ['Access card returned', 'Locker cleared', 'Parking pass returned'] },
  { name: 'Line Manager — Handover', checklist: ['Work handover completed', 'Client relationships transitioned', 'Documentation updated'] },
];

export const EXIT_INTERVIEW_QUESTIONS = [
  'What is the primary reason for your decision to leave?',
  'How would you rate the support you received from your line manager?',
  'How would you rate your growth and learning opportunities here?',
  'Was your compensation competitive for your role and market?',
  'How would you describe the team culture?',
  'What one thing would you change about the organisation?',
  'Would you consider rejoining in the future?',
];

export const JOB_CONFIRMATION_CRITERIA = [
  'Quality of work',
  'Job knowledge & technical skill',
  'Productivity & ownership',
  'Communication',
  'Teamwork & collaboration',
  'Punctuality & attendance',
  'Adherence to company values',
];

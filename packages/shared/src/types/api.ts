/** Envelope every list endpoint returns. */
export interface Paginated<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiError {
  statusCode: number;
  message: string | string[];
  error?: string;
  /** Correlation id echoed in the `x-request-id` response header. */
  requestId?: string;
}

/** The identity + capability blob returned by `GET /auth/me`. */
export interface SessionUser {
  id: number;
  employeeVisibleId: string;
  username: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  officialEmail?: string | null;
  officialContact?: string | null;
  avatarUrl?: string | null;
  designation?: string | null;
  department?: string | null;
  company: { id: number; name: string; alias: string };
  location?: { id: number; name: string } | null;
  joiningDate: string;
  lastLoginAt?: string | null;
  isLineManager: boolean;
  directReportCount: number;
  roles: string[];
  /** UI hints only — the server re-authorises every request. */
  permissions: string[];
  features: Record<string, boolean>;
  accessibleCompanies: { id: number; name: string; alias: string }[];
}

export interface LoginResponse {
  user: SessionUser;
  /** Seconds until the access token expires; the client refreshes ahead of it. */
  expiresIn: number;
}

export interface DashboardSummary {
  identity: SessionUser;
  attendance: {
    month: number;
    year: number;
    onTimePct: number;
    latePct: number;
    absentPct: number;
    presentDays: number;
    lateDays: number;
    absentDays: number;
    workingDays: number;
    trend: { date: string; workMinutes: number }[];
  };
  currentWeek: {
    totalWorkMinutes: number;
    averageWorkMinutes: number;
    averageLateMinutes: number;
  };
  leaveBalances: {
    leaveTypeId: number;
    key: string;
    label: string;
    colorHex: string;
    entitled: number;
    remaining: number;
    consumed: number;
  }[];
  bradford: { score: number; band: string; spellCount: number; totalDays: number };
  notices: { id: number; title: string; body: string; publishAt: string; isPinned: boolean }[];
  birthdaysToday: { id: number; fullName: string; designation?: string | null; avatarUrl?: string | null }[];
  anniversaries: {
    id: number;
    fullName: string;
    designation?: string | null;
    avatarUrl?: string | null;
    years: number;
    joiningDate: string;
  }[];
  policies: { id: number; title: string; version: string; effectiveFrom: string; isLatest: boolean }[];
  pendingApprovals: {
    leave: number;
    attendance: number;
    overtime: number;
    compensation: number;
    shiftExchange: number;
    resignation: number;
    clearance: number;
    total: number;
  };
  calendar: {
    date: string;
    status: string | null;
    isWeekend: boolean;
    isHoliday: boolean;
    holidayName?: string;
  }[];
}

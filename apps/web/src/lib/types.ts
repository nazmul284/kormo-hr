/** Shapes the UI relies on. Kept narrow: only what components read. */

export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface SessionUser {
  id: number;
  employeeVisibleId: string;
  username: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  officialEmail: string | null;
  officialContact: string | null;
  avatarUrl: string | null;
  designation: string | null;
  designationGrade: string | null;
  department: string | null;
  departmentId: number | null;
  company: { id: number; name: string; alias: string };
  location: { id: number; name: string } | null;
  joiningDate: string;
  serviceLength: string;
  lastLoginAt: string | null;
  isLineManager: boolean;
  directReportCount: number;
  roles: string[];
  permissions: string[];
  features: Record<string, boolean>;
  accessibleCompanies: { id: number; name: string; alias: string }[];
}

export interface EmployeeSummary {
  id: number;
  employeeVisibleId: string;
  fullName: string;
  initials: string;
  officialEmail: string | null;
  email: string;
  officialContact: string | null;
  thumbnailsPath01: string | null;
  designation: { name: string } | null;
  department: { id: number; name: string } | null;
  company: { id: number; name: string; alias: string };
  location: { id: number; name: string } | null;
  joiningDate?: string;
  employmentStatus?: string;
  isLineManager?: boolean;
  lineManager?: { id: number; firstName: string; lastName: string } | null;
}

export type AttendanceStatus =
  | 'PRESENT' | 'LATE' | 'ABSENT' | 'AFL' | 'LEAVE' | 'HALF_DAY'
  | 'HOLIDAY' | 'WEEKEND' | 'CONDITIONAL_WEEKEND';

export interface AttendanceDay {
  sn: number;
  id: number;
  date: string;
  day: string;
  shiftName: string | null;
  inTime: string;
  outTime: string;
  lateTime: string;
  breakTime: string | null;
  totalHours: string;
  overtimeHours: string;
  status: AttendanceStatus;
  lateTimeMinutes: number;
  totalWorkMinutes: number;
  isEdited: boolean;
  needsCorrection: boolean;
  compensationLeaveApplicable: boolean;
  editRequest: { id: number; status: string; reason: string } | null;
}

export interface AttendanceMonth {
  month: number;
  year: number;
  days: AttendanceDay[];
  summary: {
    total: number; present: number; late: number; halfDayLeave: number;
    absent: number; leave: number; afl: number; holiday: number;
    weekend: number; conditionalWeekend: number; workingDays: number;
    totalWorkMinutes: number; totalLateMinutes: number; totalOvertimeMinutes: number;
  };
  capabilities: { canViewBreaktime: boolean; canRequestEdit: boolean };
}

export interface LeaveBalance {
  leaveTypeId: number;
  key: string;
  label: string;
  colorHex: string;
  entitled: number;
  remaining: number;
  consumed: number;
  pending: number;
  carriedForward: number;
  available: number;
  isPaid: boolean;
}

export interface DashboardData {
  identity: SessionUser & { employeeSince: string };
  attendance: {
    month: number; year: number;
    onTimePct: number; latePct: number; absentPct: number;
    presentDays: number; lateDays: number; absentDays: number;
    leaveDays: number; workingDays: number;
    trend: { date: string; workMinutes: number; status: string }[];
  };
  notices: { id: number; title: string; body: string; publishAt: string; isPinned: boolean }[];
  leaveBalances: LeaveBalance[];
  bradford: { score: number; band: string; spellCount: number; totalDays: number };
  calendar: {
    date: string; status: AttendanceStatus | null; isWeekend: boolean;
    isHoliday: boolean; holidayName?: string; isToday: boolean; isFuture: boolean;
  }[];
  currentWeek: {
    weekStart: string; weekEnd: string; daysWorked: number;
    totalWorkMinutes: number; averageWorkMinutes: number; averageLateMinutes: number;
    totalWorkHourLabel: string; averageWorkHourLabel: string; averageLateTimeLabel: string;
  };
  birthdaysToday: {
    id: number; fullName: string; initials: string;
    designation: string | null; avatarUrl: string | null; dayOfMonth: number; isToday: boolean;
  }[];
  anniversaries: {
    id: number; fullName: string; initials: string; designation: string | null;
    avatarUrl: string | null; joiningDate: string; years: number; isToday: boolean;
  }[];
  policies: {
    id: number; title: string; version: string; effectiveFrom: string;
    isLatest: boolean; category: string | null;
  }[];
  pendingApprovals: {
    leave: number; attendance: number; overtime: number; compensation: number;
    shiftExchange: number; resignation: number; clearance: number;
    profileChange: number; jobConfirmation: number; total: number;
  };
  unreadNotifications: number;
  upcomingHoliday: {
    name: string; startDate: string; endDate: string; duration: number;
  } | null;
  myOnboardingTasks: number;
}

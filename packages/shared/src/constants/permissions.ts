/**
 * Flat permission keys. The client caches the granted set to decide what
 * to *render*; it is never the authorisation boundary — every API route
 * re-checks server-side. (The system being replaced cached a permission
 * blob in localStorage and trusted it, which is exactly the mistake this
 * split avoids.)
 */
export const PERMISSIONS = {
  // profile & directory
  EMPLOYEE_READ_SELF: 'employee.read.self',
  EMPLOYEE_READ_TEAM: 'employee.read.team',
  EMPLOYEE_READ_ALL: 'employee.read.all',
  EMPLOYEE_WRITE: 'employee.write',
  EMPLOYEE_CREATE: 'employee.create',
  EMPLOYEE_DIRECTORY: 'employee.directory',
  EMPLOYEE_HIERARCHY: 'employee.hierarchy',
  PROFILE_CHANGE_REQUEST: 'profile.change_request',
  PROFILE_CHANGE_APPROVE: 'profile.change_request.approve',

  // attendance
  ATTENDANCE_READ_SELF: 'attendance.read.self',
  ATTENDANCE_READ_TEAM: 'attendance.read.team',
  ATTENDANCE_READ_ALL: 'attendance.read.all',
  ATTENDANCE_EDIT_REQUEST: 'attendance.edit_request',
  ATTENDANCE_EDIT_APPROVE: 'attendance.edit_request.approve',
  ATTENDANCE_OVERRIDE: 'attendance.override',
  ATTENDANCE_VIEW_BREAKTIME: 'attendance.view_breaktime',
  ROSTER_READ: 'roster.read',
  ROSTER_WRITE: 'roster.write',
  SHIFT_EXCHANGE_APPROVE: 'shift_exchange.approve',
  OVERTIME_REQUEST: 'overtime.request',
  OVERTIME_APPROVE: 'overtime.approve',
  COMPENSATION_REQUEST: 'compensation.request',
  COMPENSATION_APPROVE: 'compensation.approve',

  // leave
  LEAVE_APPLY: 'leave.apply',
  LEAVE_READ_TEAM: 'leave.read.team',
  LEAVE_READ_ALL: 'leave.read.all',
  LEAVE_APPROVE: 'leave.approve',
  LEAVE_POLICY_WRITE: 'leave.policy.write',
  LEAVE_BRADFORD: 'leave.bradford',
  HOLIDAY_WRITE: 'holiday.write',

  // payroll & tax
  PAYSLIP_READ_SELF: 'payslip.read.self',
  PAYSLIP_READ_ALL: 'payslip.read.all',
  PAYROLL_RUN: 'payroll.run',
  PAYROLL_APPROVE: 'payroll.approve',
  SALARY_READ: 'salary.read',
  SALARY_WRITE: 'salary.write',
  TAX_READ_SELF: 'tax.read.self',
  TAX_READ_ALL: 'tax.read.all',
  TAX_CONFIG_WRITE: 'tax.config.write',

  // performance
  GOAL_WRITE_SELF: 'goal.write.self',
  GOAL_READ_TEAM: 'goal.read.team',
  GOAL_REVIEW: 'goal.review',
  GOAL_CYCLE_WRITE: 'goal_cycle.write',
  CONFIRMATION_REVIEW: 'confirmation.review',

  // field force
  VISIT_CREATE: 'visit.create',
  VISIT_READ_SELF: 'visit.read.self',
  VISIT_READ_ALL: 'visit.read.all',
  VISIT_SETTINGS: 'visit.settings',
  TRACKING_READ_TEAM: 'tracking.read.team',
  TRACKING_READ_ALL: 'tracking.read.all',
  TRACKING_CONFIGURE: 'tracking.configure',

  // lifecycle
  ONBOARDING_READ: 'onboarding.read',
  ONBOARDING_TASK_ACTION: 'onboarding.task.action',
  ONBOARDING_TEMPLATE_WRITE: 'onboarding.template.write',
  RESIGNATION_SUBMIT: 'resignation.submit',
  RESIGNATION_APPROVE: 'resignation.approve',
  CLEARANCE_ACTION: 'clearance.action',
  EXIT_INTERVIEW: 'exit_interview.conduct',

  // workplace
  FOOD_SUBSCRIBE: 'food.subscribe',
  FOOD_MANAGE: 'food.manage',
  BOOKING_CREATE: 'booking.create',
  BOOKING_MANAGE: 'booking.manage',
  NOTICE_WRITE: 'notice.write',
  POLICY_WRITE: 'policy.write',
  HELPDESK_RAISE: 'helpdesk.raise',
  HELPDESK_RESOLVE: 'helpdesk.resolve',

  // platform
  REPORT_GENERATE: 'report.generate',
  COMPANY_WRITE: 'company.write',
  ROLE_WRITE: 'role.write',
  AUDIT_READ: 'audit.read',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Everything an ordinary employee can do for themselves. */
export const SELF_SERVICE_PERMISSIONS: Permission[] = [
  PERMISSIONS.EMPLOYEE_READ_SELF,
  PERMISSIONS.EMPLOYEE_DIRECTORY,
  PERMISSIONS.EMPLOYEE_HIERARCHY,
  PERMISSIONS.PROFILE_CHANGE_REQUEST,
  PERMISSIONS.ATTENDANCE_READ_SELF,
  PERMISSIONS.ATTENDANCE_EDIT_REQUEST,
  PERMISSIONS.ROSTER_READ,
  PERMISSIONS.OVERTIME_REQUEST,
  PERMISSIONS.COMPENSATION_REQUEST,
  PERMISSIONS.LEAVE_APPLY,
  PERMISSIONS.PAYSLIP_READ_SELF,
  PERMISSIONS.TAX_READ_SELF,
  PERMISSIONS.GOAL_WRITE_SELF,
  PERMISSIONS.FOOD_SUBSCRIBE,
  PERMISSIONS.BOOKING_CREATE,
  PERMISSIONS.HELPDESK_RAISE,
  PERMISSIONS.RESIGNATION_SUBMIT,
  PERMISSIONS.ONBOARDING_TASK_ACTION,
  PERMISSIONS.VISIT_READ_SELF,
];

/** Added on top of self-service for anyone with direct reports. */
export const LINE_MANAGER_PERMISSIONS: Permission[] = [
  PERMISSIONS.EMPLOYEE_READ_TEAM,
  PERMISSIONS.ATTENDANCE_READ_TEAM,
  PERMISSIONS.ATTENDANCE_EDIT_APPROVE,
  PERMISSIONS.SHIFT_EXCHANGE_APPROVE,
  PERMISSIONS.OVERTIME_APPROVE,
  PERMISSIONS.COMPENSATION_APPROVE,
  PERMISSIONS.LEAVE_READ_TEAM,
  PERMISSIONS.LEAVE_APPROVE,
  PERMISSIONS.LEAVE_BRADFORD,
  PERMISSIONS.GOAL_READ_TEAM,
  PERMISSIONS.GOAL_REVIEW,
  PERMISSIONS.CONFIRMATION_REVIEW,
  PERMISSIONS.RESIGNATION_APPROVE,
  PERMISSIONS.CLEARANCE_ACTION,
  PERMISSIONS.ONBOARDING_READ,
  PERMISSIONS.TRACKING_READ_TEAM,
  PERMISSIONS.VISIT_READ_ALL,
  PERMISSIONS.REPORT_GENERATE,
];

export const HR_ADMIN_PERMISSIONS: Permission[] = [
  ...LINE_MANAGER_PERMISSIONS,
  PERMISSIONS.EMPLOYEE_READ_ALL,
  PERMISSIONS.EMPLOYEE_WRITE,
  PERMISSIONS.EMPLOYEE_CREATE,
  PERMISSIONS.PROFILE_CHANGE_APPROVE,
  PERMISSIONS.ATTENDANCE_READ_ALL,
  PERMISSIONS.ATTENDANCE_OVERRIDE,
  PERMISSIONS.ATTENDANCE_VIEW_BREAKTIME,
  PERMISSIONS.ROSTER_WRITE,
  PERMISSIONS.LEAVE_READ_ALL,
  PERMISSIONS.LEAVE_POLICY_WRITE,
  PERMISSIONS.HOLIDAY_WRITE,
  PERMISSIONS.SALARY_READ,
  PERMISSIONS.GOAL_CYCLE_WRITE,
  PERMISSIONS.ONBOARDING_TEMPLATE_WRITE,
  PERMISSIONS.EXIT_INTERVIEW,
  PERMISSIONS.FOOD_MANAGE,
  PERMISSIONS.BOOKING_MANAGE,
  PERMISSIONS.NOTICE_WRITE,
  PERMISSIONS.POLICY_WRITE,
  PERMISSIONS.HELPDESK_RESOLVE,
  PERMISSIONS.TRACKING_READ_ALL,
  PERMISSIONS.TRACKING_CONFIGURE,
  PERMISSIONS.VISIT_SETTINGS,
];

export const PAYROLL_ADMIN_PERMISSIONS: Permission[] = [
  PERMISSIONS.EMPLOYEE_READ_ALL,
  PERMISSIONS.PAYSLIP_READ_ALL,
  PERMISSIONS.PAYROLL_RUN,
  PERMISSIONS.PAYROLL_APPROVE,
  PERMISSIONS.SALARY_READ,
  PERMISSIONS.SALARY_WRITE,
  PERMISSIONS.TAX_READ_ALL,
  PERMISSIONS.TAX_CONFIG_WRITE,
  PERMISSIONS.REPORT_GENERATE,
  PERMISSIONS.AUDIT_READ,
];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

export const SYSTEM_ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  HR_ADMIN: 'HR_ADMIN',
  PAYROLL_ADMIN: 'PAYROLL_ADMIN',
  LINE_MANAGER: 'LINE_MANAGER',
  EMPLOYEE: 'EMPLOYEE',
  IT_ADMIN: 'IT_ADMIN',
  FIELD_FORCE: 'FIELD_FORCE',
} as const;

export type SystemRole = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];

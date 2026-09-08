/**
 * Sub-navigation tab sets.
 *
 * These live here rather than beside their pages because a Next.js App
 * Router page module may only export `default` and a fixed set of
 * framework names — exporting a constant from a page is a type error.
 */
export const ATTENDANCE_TABS = [
  { label: 'My Attendance', href: '/attendance', exact: true },
  { label: 'Approval Inbox', href: '/attendance/approvals' },
  { label: 'Shift Calendar', href: '/attendance/shift-calendar' },
  { label: 'Overtime', href: '/attendance/overtime' },
  { label: 'Compensatory Off', href: '/attendance/compensation' },
];

export const LEAVE_TABS = [
  { label: 'Apply & My Requests', href: '/leave', exact: true },
  { label: 'Approval Inbox', href: '/leave/approval' },
  { label: 'My Leave Report', href: '/leave/report' },
  { label: 'Co-Workers on Leave', href: '/leave/colleagues' },
];

export const PMS_TABS = [
  { label: 'My Goals', href: '/performance', exact: true },
  { label: 'My Team Goals', href: '/performance/team' },
  { label: 'Job Confirmation', href: '/performance/job-confirmation' },
];

export const FIELD_TABS = [
  { label: 'Customer Visits', href: '/field-force/visits', exact: true },
  { label: 'Employee Tracking', href: '/field-force/tracking' },
];

export const RESIGNATION_TABS = [
  { label: 'Send e-Resignation', href: '/resignation', exact: true },
  { label: 'Approvals', href: '/resignation/approvals' },
  { label: 'Clearance', href: '/resignation/clearance' },
];

export const COMPANY_TABS = [
  { label: 'Overview', href: '/company', exact: true },
  { label: 'Notices', href: '/company/notices' },
  { label: 'Policies', href: '/company/policies' },
  { label: 'Change requests', href: '/company/change-requests' },
];

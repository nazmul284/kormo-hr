import type { LucideIcon } from 'lucide-react';
import {
  BadgeDollarSign, Building2, CalendarDays, CalendarClock, ClipboardList, Contact,
  DoorOpen, FileSpreadsheet, GaugeCircle, Goal, LayoutDashboard, LifeBuoy, LogOut,
  MapPinned, Network, Receipt, Salad, ShieldCheck, Umbrella, UserCircle, UserPlus,
} from 'lucide-react';

import { PERMISSIONS, FEATURE_FLAGS } from '@kormo/shared';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Any one of these permissions is enough to see the item. */
  permissions?: string[];
  /** The tenant feature flag that must be on. */
  feature?: string;
  /** Badge key from the dashboard's pendingApprovals block. */
  badge?: string;
  children?: { label: string; href: string; permissions?: string[]; badge?: string }[];
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/**
 * The sidebar. Items are filtered by permission and tenant feature flag,
 * which is a *rendering* decision only — the API re-authorises every call
 * regardless of what the nav chose to show.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { label: 'My Profile', href: '/profile', icon: UserCircle },
      {
        label: 'Co-Workers',
        href: '/directory',
        icon: Contact,
        permissions: [PERMISSIONS.EMPLOYEE_DIRECTORY],
      },
      {
        label: 'Organization Tree',
        href: '/org-chart',
        icon: Network,
        permissions: [PERMISSIONS.EMPLOYEE_HIERARCHY],
      },
    ],
  },
  {
    title: 'Time & Attendance',
    items: [
      {
        label: 'Attendance',
        href: '/attendance',
        icon: CalendarClock,
        children: [
          { label: 'My Attendance', href: '/attendance' },
          {
            label: 'Approval Inbox',
            href: '/attendance/approvals',
            permissions: [PERMISSIONS.ATTENDANCE_EDIT_APPROVE, PERMISSIONS.ATTENDANCE_OVERRIDE],
            badge: 'attendance',
          },
          { label: 'Shift Calendar', href: '/attendance/shift-calendar', permissions: [PERMISSIONS.ROSTER_READ] },
          { label: 'Overtime', href: '/attendance/overtime', permissions: [PERMISSIONS.OVERTIME_REQUEST] },
          { label: 'Compensatory Off', href: '/attendance/compensation', permissions: [PERMISSIONS.COMPENSATION_REQUEST] },
        ],
      },
      {
        label: 'Leaves',
        href: '/leave',
        icon: Umbrella,
        children: [
          { label: 'Apply & My Requests', href: '/leave' },
          { label: 'Approval Inbox', href: '/leave/approval', permissions: [PERMISSIONS.LEAVE_APPROVE], badge: 'leave' },
          { label: 'My Leave Report', href: '/leave/report' },
          { label: 'Co-Workers on Leave', href: '/leave/colleagues' },
        ],
      },
      { label: 'Holidays', href: '/holidays', icon: CalendarDays },
    ],
  },
  {
    title: 'Pay & Tax',
    items: [
      {
        label: 'Payroll',
        href: '/payroll',
        icon: Receipt,
        permissions: [PERMISSIONS.PAYSLIP_READ_SELF, PERMISSIONS.PAYSLIP_READ_ALL],
      },
      {
        label: 'Tax Calculation',
        href: '/tax',
        icon: BadgeDollarSign,
        feature: FEATURE_FLAGS.TAX_CALCULATION,
        permissions: [PERMISSIONS.TAX_READ_SELF, PERMISSIONS.TAX_READ_ALL],
      },
    ],
  },
  {
    title: 'Performance',
    items: [
      {
        label: 'Goals',
        href: '/performance',
        icon: Goal,
        feature: FEATURE_FLAGS.PMS,
        children: [
          { label: 'My Goals', href: '/performance' },
          { label: 'My Team Goals', href: '/performance/team', permissions: [PERMISSIONS.GOAL_READ_TEAM] },
        ],
      },
      {
        label: 'Job Confirmation',
        href: '/performance/job-confirmation',
        icon: ShieldCheck,
        feature: FEATURE_FLAGS.JOB_CONFIRMATION,
        permissions: [PERMISSIONS.CONFIRMATION_REVIEW],
        badge: 'jobConfirmation',
      },
    ],
  },
  {
    title: 'Field Force',
    items: [
      {
        label: 'Customer Visits',
        href: '/field-force/visits',
        icon: MapPinned,
        feature: FEATURE_FLAGS.CUSTOMER_VISIT_MY_VISIT,
      },
      {
        label: 'Employee Tracking',
        href: '/field-force/tracking',
        icon: GaugeCircle,
        feature: FEATURE_FLAGS.EMPLOYEE_TRACKING,
      },
    ],
  },
  {
    title: 'Lifecycle',
    items: [
      {
        label: 'Onboarding',
        href: '/onboarding',
        icon: UserPlus,
        feature: FEATURE_FLAGS.ONBOARDING_FLOW,
      },
      {
        label: 'E-Resignation',
        href: '/resignation',
        icon: LogOut,
        feature: FEATURE_FLAGS.E_RESIGNATION,
        children: [
          { label: 'Send e-Resignation', href: '/resignation' },
          { label: 'Approvals', href: '/resignation/approvals', permissions: [PERMISSIONS.RESIGNATION_APPROVE], badge: 'resignation' },
          { label: 'Clearance', href: '/resignation/clearance', permissions: [PERMISSIONS.CLEARANCE_ACTION], badge: 'clearance' },
        ],
      },
    ],
  },
  {
    title: 'Workplace',
    items: [
      {
        label: 'Room Booking',
        href: '/space-booking',
        icon: DoorOpen,
        feature: FEATURE_FLAGS.ROOM_BOOKING,
      },
      {
        label: 'Food Management',
        href: '/food',
        icon: Salad,
        feature: FEATURE_FLAGS.FOOD_PROGRAM,
      },
      { label: 'Help Desk', href: '/helpdesk', icon: LifeBuoy },
      {
        label: 'Reports',
        href: '/reports',
        icon: FileSpreadsheet,
        permissions: [PERMISSIONS.REPORT_GENERATE],
      },
      {
        label: 'Company',
        href: '/company',
        icon: Building2,
        permissions: [PERMISSIONS.EMPLOYEE_READ_ALL],
      },
    ],
  },
];

/** True when the caller may see a nav entry. */
export function canSee(
  item: { permissions?: string[]; feature?: string },
  permissions: Set<string>,
  features: Record<string, boolean>,
): boolean {
  if (item.feature && features[item.feature] !== true) return false;
  if (!item.permissions || item.permissions.length === 0) return true;
  return item.permissions.some((permission) => permissions.has(permission));
}

/** Filters the whole tree, dropping sections and parents left empty. */
export function visibleNav(
  permissions: string[],
  features: Record<string, boolean>,
): NavSection[] {
  const granted = new Set(permissions);

  return NAV_SECTIONS.map((section) => ({
    title: section.title,
    items: section.items
      .filter((item) => canSee(item, granted, features))
      .map((item) => ({
        ...item,
        children: item.children?.filter((child) => canSee(child, granted, features)),
      }))
      // A parent whose only reason to exist was its children is dropped
      // when every child is filtered out.
      .filter((item) => !item.children || item.children.length > 0),
  })).filter((section) => section.items.length > 0);
}

import {
  AlertTriangle, Ban, CalendarOff, CheckCircle2, Clock, CircleDashed, CircleSlash,
  Hourglass, Palmtree, PauseCircle, Sun, XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Badge, type BadgeProps } from './badge';

type Tone = NonNullable<BadgeProps['tone']>;

/**
 * Status vocabulary for the whole app.
 *
 * Every entry pairs a tone with an icon and a label, so state is never
 * conveyed by colour alone — which matters both for accessibility and
 * because two of our status hues sit under 3:1 on the light surface.
 */
const STATUS: Record<string, { label: string; tone: Tone; icon: LucideIcon }> = {
  // attendance
  PRESENT: { label: 'Present', tone: 'good', icon: CheckCircle2 },
  LATE: { label: 'Late', tone: 'warning', icon: Clock },
  ABSENT: { label: 'Absent', tone: 'critical', icon: XCircle },
  AFL: { label: 'Absent (AFL)', tone: 'critical', icon: CircleSlash },
  LEAVE: { label: 'Leave', tone: 'brand', icon: Palmtree },
  HALF_DAY: { label: 'Half day', tone: 'brand', icon: CircleDashed },
  HOLIDAY: { label: 'Holiday', tone: 'info', icon: Sun },
  WEEKEND: { label: 'Weekend', tone: 'neutral', icon: CalendarOff },
  CONDITIONAL_WEEKEND: { label: 'Conditional weekend', tone: 'neutral', icon: CalendarOff },

  // request workflows
  PENDING: { label: 'Pending', tone: 'warning', icon: Hourglass },
  APPROVED: { label: 'Approved', tone: 'good', icon: CheckCircle2 },
  REJECTED: { label: 'Rejected', tone: 'critical', icon: XCircle },
  CANCELLED: { label: 'Cancelled', tone: 'neutral', icon: Ban },

  // tasks
  IN_PROGRESS: { label: 'In progress', tone: 'info', icon: Clock },
  DONE: { label: 'Done', tone: 'good', icon: CheckCircle2 },
  BLOCKED: { label: 'Blocked', tone: 'critical', icon: AlertTriangle },
  SKIPPED: { label: 'Skipped', tone: 'neutral', icon: Ban },

  // employment
  PERMANENT: { label: 'Permanent', tone: 'good', icon: CheckCircle2 },
  PROBATION: { label: 'Probation', tone: 'warning', icon: Hourglass },
  CONTRACT: { label: 'Contract', tone: 'info', icon: Clock },
  INTERN: { label: 'Intern', tone: 'info', icon: CircleDashed },
  SEPARATED: { label: 'Separated', tone: 'neutral', icon: Ban },

  // payroll runs
  DRAFT: { label: 'Draft', tone: 'neutral', icon: CircleDashed },
  PROCESSING: { label: 'Processing', tone: 'info', icon: Clock },
  REVIEW: { label: 'In review', tone: 'warning', icon: Hourglass },
  PAID: { label: 'Paid', tone: 'good', icon: CheckCircle2 },
  LOCKED: { label: 'Locked', tone: 'neutral', icon: CheckCircle2 },

  // goals
  ACTIVE: { label: 'Active', tone: 'info', icon: Clock },
  SUBMITTED: { label: 'Submitted', tone: 'warning', icon: Hourglass },
  COMPLETED: { label: 'Completed', tone: 'good', icon: CheckCircle2 },
  IN_REVIEW: { label: 'In review', tone: 'warning', icon: Hourglass },

  // confirmation
  CONFIRMED: { label: 'Confirmed', tone: 'good', icon: CheckCircle2 },
  EXTENDED: { label: 'Extended', tone: 'warning', icon: PauseCircle },
  TERMINATED: { label: 'Terminated', tone: 'critical', icon: XCircle },

  // resignation stages
  LM_APPROVAL: { label: 'Manager approval', tone: 'warning', icon: Hourglass },
  HR_APPROVAL: { label: 'HR approval', tone: 'warning', icon: Hourglass },
  CLEARANCE: { label: 'Clearance', tone: 'info', icon: Clock },
  WITHDRAWN: { label: 'Withdrawn', tone: 'neutral', icon: Ban },

  // helpdesk
  OPEN: { label: 'Open', tone: 'warning', icon: Hourglass },
  RESOLVED: { label: 'Resolved', tone: 'good', icon: CheckCircle2 },
  CLOSED: { label: 'Closed', tone: 'neutral', icon: CheckCircle2 },

  // meals
  SCHEDULED: { label: 'Scheduled', tone: 'info', icon: Clock },
  TAKEN: { label: 'Taken', tone: 'good', icon: CheckCircle2 },
  NOT_TAKEN: { label: 'Not taken', tone: 'warning', icon: AlertTriangle },

  // tracking
  ONGOING: { label: 'Live', tone: 'good', icon: Clock },
  ABANDONED: { label: 'Abandoned', tone: 'neutral', icon: Ban },

  // reports
  QUEUED: { label: 'Queued', tone: 'neutral', icon: Hourglass },
  RUNNING: { label: 'Running', tone: 'info', icon: Clock },
  READY: { label: 'Ready', tone: 'good', icon: CheckCircle2 },
  FAILED: { label: 'Failed', tone: 'critical', icon: XCircle },
};

export function StatusBadge({
  status,
  size = 'sm',
  showIcon = true,
  className,
}: {
  status: string | null | undefined;
  size?: BadgeProps['size'];
  showIcon?: boolean;
  className?: string;
}) {
  if (!status) return <span className="text-ink-muted">—</span>;

  const entry = STATUS[status];
  if (!entry) {
    // An unknown status is shown verbatim rather than hidden, so a new
    // enum value on the server is visible instead of silently blank.
    return (
      <Badge tone="neutral" size={size} className={className}>
        {status.replace(/_/g, ' ').toLowerCase()}
      </Badge>
    );
  }

  const Icon = entry.icon;
  return (
    <Badge tone={entry.tone} size={size} className={className}>
      {showIcon ? <Icon aria-hidden /> : null}
      {entry.label}
    </Badge>
  );
}

/** The colour token for a status, for calendar dots and chart marks. */
export function statusTone(status: string | null | undefined): Tone {
  if (!status) return 'neutral';
  return STATUS[status]?.tone ?? 'neutral';
}

export function statusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  return STATUS[status]?.label ?? status.replace(/_/g, ' ');
}

/**
 * Mark-grade colours for SVG marks, calendar dots and legends.
 *
 * These are the fills, not the inks: they are validated ≥3:1 against the
 * surface. Text that names a status uses the `-ink` step instead, via the
 * badge tones above.
 */
export const STATUS_COLOR: Record<string, string> = {
  PRESENT: 'rgb(var(--good))',
  LATE: 'rgb(var(--warning))',
  ABSENT: 'rgb(var(--critical))',
  AFL: 'rgb(var(--critical))',
  LEAVE: 'rgb(var(--leave-annual))',
  HALF_DAY: 'rgb(var(--leave-sick))',
  HOLIDAY: 'rgb(var(--accent))',
  WEEKEND: 'rgb(var(--ink-muted))',
  CONDITIONAL_WEEKEND: 'rgb(var(--ink-muted))',
};

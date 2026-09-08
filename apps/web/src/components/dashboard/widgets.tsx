'use client';

import Link from 'next/link';
import {
  Cake, CalendarClock, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock,
  ExternalLink, FileText, Gift, Headset, Mail, PartyPopper, Phone, Pin, Timer,
  TrendingUp, XCircle,
} from 'lucide-react';
import { useState } from 'react';

import { Donut } from '@/components/charts/donut';
import { Sparkline } from '@/components/charts/sparkline';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { STATUS_COLOR, statusLabel } from '@/components/ui/status-badge';
import type { DashboardData } from '@/lib/types';
import { cn, countOf, formatDate, formatDays, formatRelative, leaveColor, minutesToHm, MONTHS, WEEKDAYS_SHORT } from '@/lib/utils';

// ── 1. identity card ──────────────────────────────────────────────────

export function IdentityCard({ data }: { data: DashboardData }) {
  const { identity } = data;
  return (
    <Card className="overflow-hidden">
      <div className="banner-wash h-14 border-b border-line" />

      <CardContent className="-mt-7 pt-0">
        {/* The avatar overlaps the banner and its own tint is translucent, so
            it needs an opaque backing or the initials sit on two grounds. */}
        <span className="inline-block rounded-full bg-surface ring-4 ring-surface">
          <Avatar name={identity.fullName} src={identity.avatarUrl} size="lg" />
        </span>

        <div className="mt-3">
          <p className="text-base font-semibold tracking-tight text-ink">{identity.fullName}</p>
          <p className="text-sm text-ink-secondary">
            {identity.designation ?? '—'}
            {identity.designationGrade ? (
              <span className="text-ink-muted"> ({identity.designationGrade})</span>
            ) : null}
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">
            {identity.department ?? '—'} · Employee ID {identity.employeeVisibleId}
          </p>
        </div>

        <dl className="mt-4 space-y-2 border-t border-line pt-3 text-xs">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-3.5 shrink-0 text-ink-muted" aria-hidden />
            <dt className="sr-only">Employee since</dt>
            <dd className="text-ink-secondary">
              Employee since{' '}
              <span className="font-medium text-ink">{formatDate(identity.joiningDate)}</span>
              <span className="text-ink-muted"> · {identity.serviceLength}</span>
            </dd>
          </div>
          {identity.officialContact ? (
            <div className="flex items-center gap-2">
              <Phone className="size-3.5 shrink-0 text-ink-muted" aria-hidden />
              <dd className="text-ink-secondary tabular">{identity.officialContact}</dd>
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <Mail className="size-3.5 shrink-0 text-ink-muted" aria-hidden />
            <dd className="truncate text-ink-secondary">{identity.officialEmail ?? identity.email}</dd>
          </div>
          {identity.lastLoginAt ? (
            <div className="flex items-center gap-2">
              <Clock className="size-3.5 shrink-0 text-ink-muted" aria-hidden />
              <dd className="text-ink-muted">Last login {formatRelative(identity.lastLoginAt)}</dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-4 flex gap-2">
          <Button asChild variant="secondary" size="sm" className="flex-1">
            <Link href="/profile">View profile</Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="flex-1">
            <Link href="/helpdesk">
              <Headset />
              Help desk
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── 2. attendance donut + sparkline ───────────────────────────────────

export function AttendanceWidget({ data }: { data: DashboardData }) {
  const a = data.attendance;

  /*
   * Present / late / absent are *states*, not categories, so they wear
   * the reserved status colours — and each legend row carries an icon so
   * the meaning never rests on hue alone.
   */
  const slices = [
    {
      key: 'onTime',
      label: 'On time',
      value: a.presentDays,
      color: 'rgb(var(--good))',
      icon: <CheckCircle2 className="size-3 shrink-0" aria-hidden />,
    },
    {
      key: 'late',
      label: 'Late',
      value: a.lateDays,
      color: 'rgb(var(--warning))',
      icon: <Clock className="size-3 shrink-0" aria-hidden />,
    },
    {
      key: 'absent',
      label: 'Absent',
      value: a.absentDays,
      color: 'rgb(var(--critical))',
      icon: <XCircle className="size-3 shrink-0" aria-hidden />,
    },
  ];

  const trend = a.trend
    .filter((point) => ['PRESENT', 'LATE'].includes(point.status))
    .map((point) => ({
      label: formatDate(point.date, 'short'),
      value: Math.round((point.workMinutes / 60) * 10) / 10,
      color: STATUS_COLOR[point.status],
    }));

  return (
    <Card>
      <CardHeader
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href="/attendance">
              Details
              <ChevronRight />
            </Link>
          </Button>
        }
      >
        <CardTitle>Attendance</CardTitle>
        <p className="mt-0.5 text-xs text-ink-muted">
          {MONTHS[a.month - 1]} {a.year} · {a.workingDays} working days
        </p>
      </CardHeader>

      <CardContent>
        <Donut
          slices={slices}
          heroValue={`${a.onTimePct}%`}
          heroLabel="On time"
          emptyLabel="No attendance recorded this month"
        />

        {trend.length > 1 ? (
          <div className="mt-4 border-t border-line pt-3">
            <div className="mb-1 flex items-center justify-between">
              <p className="flex items-center gap-1 text-2xs font-medium uppercase tracking-wide text-ink-muted">
                <TrendingUp className="size-3" aria-hidden />
                Hours worked per day
              </p>
              <p className="text-2xs text-ink-muted">hover for detail</p>
            </div>
            <Sparkline
              points={trend}
              height={52}
              formatValue={(value) => `${value} h`}
              color="rgb(var(--series-1))"
            />
          </div>
        ) : null}

        <div className="mt-4">
          <Button asChild variant="subtle" size="sm" className="w-full">
            <Link href="/attendance?request=1">
              <CalendarClock />
              Request attendance correction
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── 3. notice board ───────────────────────────────────────────────────

export function NoticeBoard({ data }: { data: DashboardData }) {
  return (
    <Card>
      <CardHeader
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href="/company/notices">See all</Link>
          </Button>
        }
      >
        <CardTitle>Notice board</CardTitle>
      </CardHeader>

      {data.notices.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No active notices"
          description="Company announcements will appear here."
        />
      ) : (
        <ul className="divide-y divide-line">
          {/* Three, not all of them: the full list is one click away, and an
              unbounded feed here made this column run ~600px past the other
              two and left the dashboard with a ragged, empty bottom. */}
          {data.notices.slice(0, 3).map((notice) => (
            <li key={notice.id} className="px-4 py-3">
              <div className="flex items-start gap-2">
                {notice.isPinned ? (
                  <Pin className="mt-0.5 size-3.5 shrink-0 rotate-45 text-brand" aria-hidden />
                ) : (
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ink-muted" aria-hidden />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-snug text-ink">{notice.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-secondary">
                    {notice.body}
                  </p>
                  <p className="mt-1 text-2xs text-ink-muted">{formatRelative(notice.publishAt)}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ── 4. remaining leave ────────────────────────────────────────────────

const BRADFORD_TONE: Record<string, { label: string; className: string }> = {
  ok: { label: 'Healthy', className: 'text-good-ink' },
  watch: { label: 'Watch', className: 'text-serious' },
  concern: { label: 'Concern', className: 'text-serious' },
  critical: { label: 'Critical', className: 'text-critical-ink' },
};

export function LeaveBalanceWidget({ data }: { data: DashboardData }) {
  const bradford = BRADFORD_TONE[data.bradford.band] ?? BRADFORD_TONE.ok;

  return (
    <Card>
      <CardHeader
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href="/leave">
              Apply
              <ChevronRight />
            </Link>
          </Button>
        }
      >
        <CardTitle>Remaining leave</CardTitle>
        <p className="mt-0.5 text-xs text-ink-muted">Fractional balances reflect pro-rated accrual</p>
      </CardHeader>

      <CardContent className="space-y-3">
        {data.leaveBalances.length === 0 ? (
          <p className="py-4 text-center text-xs text-ink-muted">
            No leave entitlement configured yet.
          </p>
        ) : (
          data.leaveBalances.map((balance) => {
            const pct = balance.entitled > 0 ? (balance.remaining / balance.entitled) * 100 : 0;
            return (
              <div key={balance.leaveTypeId}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-ink-secondary">
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-sm"
                      style={{ backgroundColor: leaveColor(balance.key) }}
                    />
                    <span className="truncate">{balance.label}</span>
                  </span>
                  {/* Direct label — the number is always readable. */}
                  <span className="shrink-0 text-xs tabular">
                    <span className="font-semibold text-ink">{formatDays(balance.remaining)}</span>
                    <span className="text-ink-muted">/{formatDays(balance.entitled)}</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
                  <div
                    className="h-full rounded-full transition-[width] duration-300"
                    style={{
                      width: `${Math.max(Math.min(pct, 100), balance.remaining > 0 ? 2 : 0)}%`,
                      backgroundColor: leaveColor(balance.key),
                    }}
                  />
                </div>
                {balance.pending > 0 ? (
                  <p className="mt-0.5 text-2xs text-serious">
                    {countOf(formatDays(balance.pending), 'day')} awaiting approval
                  </p>
                ) : null}
              </div>
            );
          })
        )}
      </CardContent>

      <div className="flex items-center justify-between border-t border-line px-4 py-2.5">
        <span className="text-2xs uppercase tracking-wide text-ink-muted">Bradford factor</span>
        <span className="flex items-center gap-1.5 text-xs">
          <span className={cn('font-semibold tabular', bradford.className)}>
            {data.bradford.score}
          </span>
          <Badge
            tone={
              data.bradford.band === 'ok' ? 'good'
              : data.bradford.band === 'critical' ? 'critical' : 'warning'
            }
          >
            {bradford.label}
          </Badge>
        </span>
      </div>
    </Card>
  );
}

// ── 5. attendance mini-calendar ───────────────────────────────────────

const LEGEND = [
  { status: 'PRESENT', label: 'Present' },
  { status: 'LATE', label: 'Late' },
  { status: 'ABSENT', label: 'Absent / AFL' },
  { status: 'LEAVE', label: 'Leave' },
  { status: 'HOLIDAY', label: 'Holiday' },
  { status: 'WEEKEND', label: 'Weekend' },
];

export function MiniCalendar({ data }: { data: DashboardData }) {
  const [offset, setOffset] = useState(0);

  // The dashboard payload only carries the current month; navigating
  // away from it links out to the full attendance page rather than
  // pretending to have the data.
  const days = offset === 0 ? data.calendar : [];
  const monthDate = new Date(Date.UTC(data.attendance.year, data.attendance.month - 1 + offset, 1));
  const leadingBlanks = days.length > 0 ? new Date(days[0].date).getUTCDay() : 0;

  return (
    <Card>
      <CardHeader
        action={
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setOffset((current) => current - 1)}
              aria-label="Previous month"
            >
              <ChevronLeft />
            </Button>
            {offset !== 0 ? (
              <Button variant="ghost" size="sm" onClick={() => setOffset(0)}>
                Today
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setOffset((current) => current + 1)}
              aria-label="Next month"
            >
              <ChevronRight />
            </Button>
          </div>
        }
      >
        <CardTitle>
          My attendance · {MONTHS[monthDate.getUTCMonth()]} {monthDate.getUTCFullYear()}
        </CardTitle>
      </CardHeader>

      <CardContent>
        {days.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="Open the full calendar"
            description="Other months are available on the attendance page."
            action={
              <Button asChild variant="secondary" size="sm">
                <Link href="/attendance">Go to attendance</Link>
              </Button>
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS_SHORT.map((weekday) => (
                <span
                  key={weekday}
                  className="pb-1 text-center text-2xs font-medium uppercase text-ink-muted"
                >
                  {weekday.charAt(0)}
                </span>
              ))}

              {Array.from({ length: leadingBlanks }).map((_, index) => (
                <span key={`blank-${index}`} aria-hidden />
              ))}

              {days.map((day) => {
                const dayNumber = new Date(day.date).getUTCDate();
                const color = day.status ? STATUS_COLOR[day.status] : undefined;
                return (
                  <span
                    key={day.date}
                    title={`${formatDate(day.date)} — ${day.holidayName ?? statusLabel(day.status)}`}
                    className={cn(
                      'relative flex aspect-square items-center justify-center rounded-md text-xs tabular',
                      day.isToday
                        ? 'ring-2 ring-brand ring-offset-1 ring-offset-surface'
                        : '',
                      day.isFuture ? 'text-ink-muted/50' : 'text-ink-secondary',
                      color ? 'font-medium' : '',
                    )}
                    style={
                      color
                        ? { backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`, color }
                        : undefined
                    }
                  >
                    {dayNumber}
                    {day.isHoliday ? (
                      <span
                        aria-hidden
                        className="absolute bottom-0.5 size-1 rounded-full"
                        style={{ backgroundColor: STATUS_COLOR.HOLIDAY }}
                      />
                    ) : null}
                  </span>
                );
              })}
            </div>

            {/* Legend is always present — status is never colour-alone. */}
            <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-3">
              {LEGEND.map((item) => (
                <li key={item.status} className="flex items-center gap-1 text-2xs text-ink-muted">
                  <span
                    aria-hidden
                    className="size-2 rounded-sm"
                    style={{ backgroundColor: STATUS_COLOR[item.status] }}
                  />
                  {item.label}
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── 6. current week stats ─────────────────────────────────────────────

export function CurrentWeekWidget({ data }: { data: DashboardData }) {
  const week = data.currentWeek;
  const items = [
    { label: 'Total work hours', value: week.totalWorkHourLabel, icon: Timer },
    { label: 'Average per day', value: week.averageWorkHourLabel, icon: Clock },
    { label: 'Average late time', value: week.averageLateTimeLabel, icon: CalendarClock },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Current week</CardTitle>
        <p className="mt-0.5 text-xs text-ink-muted">
          {formatDate(week.weekStart, 'short')} – {formatDate(week.weekEnd, 'short')} ·{' '}
          {countOf(week.daysWorked, 'day')} worked
        </p>
      </CardHeader>
      <CardContent className="grid grid-cols-3 gap-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label}>
              <Icon className="size-3.5 text-ink-muted" aria-hidden />
              <p className="mt-1.5 text-lg font-semibold tracking-tight text-ink tabular">
                {item.value}
              </p>
              <p className="mt-0.5 text-2xs leading-tight text-ink-muted">{item.label}</p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ── 7. birthdays & anniversaries ──────────────────────────────────────

export function CelebrationsWidget({ data }: { data: DashboardData }) {
  const [tab, setTab] = useState<'birthdays' | 'anniversaries'>(
    data.birthdaysToday.length > 0 ? 'birthdays' : 'anniversaries',
  );

  const list = tab === 'birthdays' ? data.birthdaysToday : data.anniversaries;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-1 rounded-lg border border-line bg-surface-sunken p-0.5">
          {(
            [
              { value: 'birthdays', label: 'Birthdays', count: data.birthdaysToday.length, icon: Cake },
              { value: 'anniversaries', label: 'Anniversaries', count: data.anniversaries.length, icon: PartyPopper },
            ] as const
          ).map((option) => {
            const Icon = option.icon;
            const active = tab === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setTab(option.value)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors',
                  active ? 'bg-surface text-ink shadow-sm' : 'text-ink-secondary hover:text-ink',
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                {option.label}
                {option.count > 0 ? (
                  <span className="rounded-full bg-brand/12 px-1.5 text-2xs font-semibold text-brand tabular">
                    {option.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </CardHeader>

      {list.length === 0 ? (
        <EmptyState
          icon={tab === 'birthdays' ? Cake : PartyPopper}
          title={tab === 'birthdays' ? 'No birthdays today' : 'No anniversaries this month'}
          description={
            tab === 'birthdays'
              ? 'Check back tomorrow — we will show whose day it is.'
              : 'Work anniversaries for the month will appear here.'
          }
        />
      ) : (
        <ul className="max-h-64 divide-y divide-line overflow-y-auto">
          {list.map((person) => (
            <li key={`${tab}-${person.id}`} className="flex items-center gap-2.5 px-4 py-2.5">
              <Avatar name={person.fullName} initials={person.initials} src={person.avatarUrl} size="sm" />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/profile/${person.id}`}
                  className="block truncate text-sm font-medium text-ink hover:text-brand"
                >
                  {person.fullName}
                </Link>
                <p className="truncate text-2xs text-ink-muted">{person.designation ?? '—'}</p>
              </div>
              {tab === 'anniversaries' && 'years' in person ? (
                <Badge tone={person.isToday ? 'brand' : 'neutral'}>
                  <Gift aria-hidden />
                  {person.years} yr
                </Badge>
              ) : person.isToday ? (
                <Badge tone="brand">
                  <Cake aria-hidden />
                  Today
                </Badge>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ── 8. office policy ──────────────────────────────────────────────────

export function PolicyWidget({ data }: { data: DashboardData }) {
  return (
    <Card>
      <CardHeader
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href="/company/policies">All policies</Link>
          </Button>
        }
      >
        <CardTitle>Office policy</CardTitle>
      </CardHeader>

      {data.policies.length === 0 ? (
        <EmptyState icon={FileText} title="No policies published" />
      ) : (
        <ul className="divide-y divide-line">
          {data.policies.map((policy) => (
            <li key={policy.id} className="flex items-center gap-2.5 px-4 py-2.5">
              <FileText className="size-4 shrink-0 text-ink-muted" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">{policy.title}</p>
                <p className="text-2xs text-ink-muted">
                  v{policy.version} · effective {formatDate(policy.effectiveFrom, 'short')}
                </p>
              </div>
              {policy.isLatest ? <Badge tone="brand">Latest</Badge> : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ── 9. approval inbox ─────────────────────────────────────────────────

const APPROVAL_LINKS: { key: keyof DashboardData['pendingApprovals']; label: string; href: string }[] = [
  { key: 'leave', label: 'Leave requests', href: '/leave/approval' },
  { key: 'attendance', label: 'Attendance corrections', href: '/attendance/approvals' },
  { key: 'overtime', label: 'Overtime', href: '/attendance/overtime' },
  { key: 'compensation', label: 'Compensatory off', href: '/attendance/compensation' },
  { key: 'shiftExchange', label: 'Shift exchanges', href: '/attendance/shift-calendar' },
  { key: 'jobConfirmation', label: 'Job confirmations', href: '/performance/job-confirmation' },
  { key: 'resignation', label: 'Resignations', href: '/resignation/approvals' },
  { key: 'clearance', label: 'Clearance sign-offs', href: '/resignation/clearance' },
  { key: 'profileChange', label: 'Profile change requests', href: '/company/change-requests' },
];

export function ApprovalInbox({ data }: { data: DashboardData }) {
  const rows = APPROVAL_LINKS.filter((link) => (data.pendingApprovals[link.key] ?? 0) > 0);

  if (data.pendingApprovals.total === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Approval inbox</CardTitle>
        </CardHeader>
        <EmptyState
          icon={CheckCircle2}
          tone="good"
          title="Nothing waiting on you"
          description="Requests routed to you for approval will land here."
        />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Approval inbox</CardTitle>
        <p className="mt-0.5 text-xs text-ink-muted">
          {countOf(data.pendingApprovals.total, 'item')} awaiting your decision
        </p>
      </CardHeader>
      <ul className="divide-y divide-line">
        {rows.map((row) => (
          <li key={row.key}>
            <Link
              href={row.href}
              className="flex items-center gap-2 px-4 py-2.5 transition-colors hover:bg-surface-sunken"
            >
              {/* Brand, not critical: a queue of routine approvals is work to
                  do, not an error — red here made every dashboard look like
                  an incident report. */}
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md
                               bg-brand/12 text-2xs font-bold text-brand-ink tabular">
                {data.pendingApprovals[row.key]}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-ink-secondary">{row.label}</span>
              <ChevronRight className="size-3.5 shrink-0 text-ink-muted" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

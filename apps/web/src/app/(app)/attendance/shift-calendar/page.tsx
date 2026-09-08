'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shared/page-header';
import { FilterBar } from '@/components/shared/data-table';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Select } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { LinkTabs, SegmentedTabs } from '@/components/ui/tabs';
import { ApiError, api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { cn, countOf, formatDate, MONTHS, WEEKDAYS_SHORT, yearOptions } from '@/lib/utils';
import { ATTENDANCE_TABS } from '@/lib/tabs';

interface RosterDay {
  date: string;
  shiftId: number | null;
  shiftName: string | null;
  shiftLabel: string | null;
  startTime: string | null;
  endTime: string | null;
  colorHex: string | null;
  isWeekend: boolean;
  isConditionalWeekend: boolean;
}

interface RosterEmployee {
  id: number;
  employeeVisibleId: string;
  fullName: string;
  initials: string;
  designation: string | null;
  days: RosterDay[];
}

export default function ShiftCalendarPage() {
  const { can } = useSession();
  const canSeeTeam = can('attendance.read.team', 'roster.write');

  const now = new Date();
  const [month, setMonth] = useState(now.getUTCMonth() + 1);
  const [year, setYear] = useState(now.getUTCFullYear());
  const [scope, setScope] = useState<'mine' | 'team'>('mine');

  const { data, isLoading } = useQuery({
    queryKey: ['roster', month, year, scope],
    queryFn: () =>
      api.get<{ month: number; year: number; employees: RosterEmployee[] }>('/attendance/roster', {
        month,
        year,
        subordinates: scope === 'team',
      }),
  });

  function step(delta: number) {
    const next = new Date(Date.UTC(year, month - 1 + delta, 1));
    setMonth(next.getUTCMonth() + 1);
    setYear(next.getUTCFullYear());
  }

  return (
    <>
      <PageHeader
        title="Shift calendar"
        description="Your rostered shift for every day, including weekends and conditional weekends. Propose a swap with a colleague from any future shift."
        breadcrumbs={[{ label: 'Attendance', href: '/attendance' }, { label: 'Shift Calendar' }]}
      />

      <LinkTabs tabs={ATTENDANCE_TABS} />

      <FilterBar
        actions={
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="icon-sm" onClick={() => step(-1)} aria-label="Previous month">
              <ChevronLeft />
            </Button>
            <Button variant="secondary" size="icon-sm" onClick={() => step(1)} aria-label="Next month">
              <ChevronRight />
            </Button>
          </div>
        }
      >
        <Field label="Month">
          <Select value={month} onChange={(event) => setMonth(Number(event.target.value))}>
            {MONTHS.map((label, index) => (
              <option key={label} value={index + 1}>{label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Year">
          <Select value={year} onChange={(event) => setYear(Number(event.target.value))}>
            {yearOptions(2, 1).map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </Select>
        </Field>
        {canSeeTeam ? (
          <div className="pb-0.5">
            <SegmentedTabs
              size="sm"
              value={scope}
              onChange={setScope}
              options={[
                { value: 'mine', label: 'My roster' },
                { value: 'team', label: 'Subordinate roster' },
              ]}
            />
          </div>
        ) : null}
      </FilterBar>

      {isLoading ? (
        <div className="h-64 skeleton" />
      ) : (data?.employees.length ?? 0) === 0 ? (
        <Card>
          <EmptyState
            title="No roster for this month"
            description={
              scope === 'team'
                ? 'None of your reports has a roster published for this month.'
                : 'Your roster has not been published for this month yet.'
            }
          />
        </Card>
      ) : scope === 'mine' ? (
        <MonthGrid employee={data!.employees[0]} month={month} year={year} />
      ) : (
        <TeamGrid employees={data!.employees} month={month} year={year} />
      )}

      <ShiftExchangePanel />
    </>
  );
}

/** Calendar-shaped view of one person's month. */
function MonthGrid({ employee, month, year }: { employee: RosterEmployee; month: number; year: number }) {
  const byDate = new Map(employee.days.map((day) => [day.date, day]));
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const leadingBlanks = firstOfMonth.getUTCDay();

  const shiftLegend = [...new Map(
    employee.days
      .filter((day) => day.shiftName && !day.isWeekend)
      .map((day) => [day.shiftName!, day]),
  ).values()];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{MONTHS[month - 1]} {year}</CardTitle>
        <p className="mt-0.5 text-xs text-ink-muted">{employee.fullName} · {employee.designation ?? '—'}</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAYS_SHORT.map((weekday) => (
            <span key={weekday} className="pb-1 text-center text-2xs font-medium uppercase text-ink-muted">
              {weekday}
            </span>
          ))}
          {Array.from({ length: leadingBlanks }).map((_, index) => (
            <span key={`blank-${index}`} aria-hidden />
          ))}
          {Array.from({ length: daysInMonth }).map((_, index) => {
            const iso = new Date(Date.UTC(year, month - 1, index + 1)).toISOString().slice(0, 10);
            const day = byDate.get(iso);
            const off = day?.isWeekend || day?.isConditionalWeekend;
            return (
              <div
                key={iso}
                className={cn(
                  'min-h-[4.5rem] rounded-lg border p-1.5',
                  off ? 'border-line bg-surface-sunken' : 'border-line bg-surface',
                )}
              >
                <div className="flex items-start justify-between">
                  <span className="text-xs font-medium text-ink-secondary tabular">{index + 1}</span>
                  {day?.isConditionalWeekend ? (
                    <span className="text-2xs text-ink-muted" title="Conditional weekend">CW</span>
                  ) : null}
                </div>
                {day ? (
                  off ? (
                    <p className="mt-1 text-2xs text-ink-muted">
                      {day.isConditionalWeekend ? 'Conditional' : 'Weekend'}
                    </p>
                  ) : (
                    <div className="mt-1">
                      <span
                        className="inline-block max-w-full truncate rounded px-1 py-0.5 text-2xs font-medium"
                        style={{
                          backgroundColor: `color-mix(in srgb, ${day.colorHex ?? 'rgb(var(--brand))'} 14%, transparent)`,
                          color: day.colorHex ?? 'rgb(var(--brand))',
                        }}
                      >
                        {day.shiftName}
                      </span>
                      <p className="mt-0.5 text-2xs text-ink-muted tabular">
                        {day.startTime}–{day.endTime}
                      </p>
                    </div>
                  )
                ) : (
                  <p className="mt-1 text-2xs text-ink-muted/60">—</p>
                )}
              </div>
            );
          })}
        </div>

        {shiftLegend.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line pt-3">
            {shiftLegend.map((day) => (
              <li key={day.shiftName} className="flex items-center gap-1.5 text-2xs text-ink-secondary">
                <span
                  aria-hidden
                  className="size-2.5 rounded-sm"
                  style={{ backgroundColor: day.colorHex ?? 'rgb(var(--brand))' }}
                />
                {day.shiftLabel ?? day.shiftName}
              </li>
            ))}
            <li className="flex items-center gap-1.5 text-2xs text-ink-secondary">
              <span aria-hidden className="size-2.5 rounded-sm bg-surface-sunken ring-1 ring-line" />
              Weekend / conditional weekend
            </li>
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Employees as rows, days as columns — the roster planning view. */
function TeamGrid({ employees, month, year }: { employees: RosterEmployee[]; month: number; year: number }) {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dates = Array.from({ length: daysInMonth }, (_, index) =>
    new Date(Date.UTC(year, month - 1, index + 1)),
  );

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Subordinate roster · {MONTHS[month - 1]} {year}</CardTitle>
        <p className="mt-0.5 text-xs text-ink-muted">{countOf(employees.length, 'team member')}</p>
      </CardHeader>

      {/* Wide grid scrolls inside its own box; the page never scrolls sideways. */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 min-w-44 border-b border-r border-line bg-surface-sunken
                             px-3 py-2 text-left text-2xs font-semibold uppercase tracking-wide text-ink-secondary">
                Employee
              </th>
              {dates.map((date) => {
                const isWeekendCol = [5, 6].includes(date.getUTCDay());
                return (
                  <th
                    key={date.toISOString()}
                    className={cn(
                      'border-b border-line px-1 py-2 text-center text-2xs font-semibold',
                      isWeekendCol ? 'bg-surface-sunken text-ink-muted' : 'bg-surface-sunken text-ink-secondary',
                    )}
                  >
                    <span className="block tabular">{date.getUTCDate()}</span>
                    <span className="block font-normal text-ink-muted">
                      {WEEKDAYS_SHORT[date.getUTCDay()].charAt(0)}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => {
              const byDate = new Map(employee.days.map((day) => [day.date, day]));
              return (
                <tr key={employee.id}>
                  <td className="sticky left-0 z-10 border-b border-r border-line bg-surface px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Avatar name={employee.fullName} initials={employee.initials} size="xs" />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-ink">{employee.fullName}</p>
                        <p className="truncate text-2xs text-ink-muted">{employee.designation ?? '—'}</p>
                      </div>
                    </div>
                  </td>
                  {dates.map((date) => {
                    const iso = date.toISOString().slice(0, 10);
                    const day = byDate.get(iso);
                    const off = day?.isWeekend || day?.isConditionalWeekend;
                    return (
                      <td
                        key={iso}
                        title={
                          day
                            ? off
                              ? `${formatDate(iso)} — off`
                              : `${formatDate(iso)} — ${day.shiftLabel ?? day.shiftName}`
                            : formatDate(iso)
                        }
                        className="border-b border-line p-0.5 text-center"
                      >
                        {day ? (
                          off ? (
                            <span className="mx-auto block size-5 rounded bg-surface-sunken" aria-hidden />
                          ) : (
                            <span
                              className="mx-auto flex size-5 items-center justify-center rounded text-[9px] font-bold"
                              style={{
                                backgroundColor: `color-mix(in srgb, ${day.colorHex ?? 'rgb(var(--brand))'} 18%, transparent)`,
                                color: day.colorHex ?? 'rgb(var(--brand))',
                              }}
                            >
                              {day.shiftName?.charAt(0)}
                            </span>
                          )
                        ) : (
                          <span className="text-ink-muted/40">·</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Shift exchange requests the caller is party to. */
function ShiftExchangePanel() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['shift-exchange'],
    queryFn: () =>
      api.get<{
        data: {
          id: number;
          date: string;
          counterpartyDate: string;
          reason: string;
          status: string;
          counterpartyAccepted: boolean;
          myRole: string;
          awaitingMyAction: boolean;
          requester: { id: number; firstName: string; lastName: string };
          counterparty: { id: number; firstName: string; lastName: string };
          fromShift: { name: string } | null;
          toShift: { name: string } | null;
        }[];
      }>('/attendance/shift-exchange', { pageSize: 20 }),
  });

  const respond = useMutation({
    mutationFn: ({ id, accept }: { id: number; accept: boolean }) =>
      api.patch(`/attendance/shift-exchange/${id}/respond`, { accept }),
    onSuccess: (_result, variables) => {
      toast.success(variables.accept ? 'Swap accepted' : 'Swap declined', {
        description: variables.accept ? 'Your manager has been asked to approve it.' : undefined,
      });
      void queryClient.invalidateQueries({ queryKey: ['shift-exchange'] });
    },
    onError: (error) => {
      toast.error('Could not respond', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: number; decision: 'APPROVED' | 'REJECTED' }) =>
      api.patch(`/attendance/shift-exchange/${id}`, { decision }),
    onSuccess: () => {
      toast.success('Decision recorded', { description: 'Both rosters have been updated.' });
      void queryClient.invalidateQueries({ queryKey: ['shift-exchange'] });
      void queryClient.invalidateQueries({ queryKey: ['roster'] });
    },
    onError: (error) => {
      toast.error('Could not record the decision', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  if (isLoading) return <div className="h-32 skeleton" />;

  const rows = data?.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Shift exchange</CardTitle>
        <p className="mt-0.5 text-xs text-ink-muted">
          A swap needs the colleague to agree first, then the manager to approve.
        </p>
      </CardHeader>

      {rows.length === 0 ? (
        <EmptyState
          icon={ArrowLeftRight}
          title="No shift exchanges"
          description="Swaps you propose, or that are proposed to you, appear here."
        />
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink">
                  <span className="font-medium">
                    {row.requester.firstName} {row.requester.lastName}
                  </span>{' '}
                  <span className="text-ink-muted">
                    {row.fromShift?.name ?? 'shift'} on {formatDate(row.date, 'short')}
                  </span>
                  <ArrowLeftRight className="mx-1.5 inline size-3 text-ink-muted" aria-hidden />
                  <span className="font-medium">
                    {row.counterparty.firstName} {row.counterparty.lastName}
                  </span>{' '}
                  <span className="text-ink-muted">
                    {row.toShift?.name ?? 'shift'} on {formatDate(row.counterpartyDate, 'short')}
                  </span>
                </p>
                <p className="mt-0.5 line-clamp-1 text-xs text-ink-secondary">{row.reason}</p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <StatusBadge status={row.status} />
                {row.status === 'PENDING' ? (
                  row.counterpartyAccepted ? (
                    <Badge tone="info">colleague agreed</Badge>
                  ) : (
                    <Badge tone="neutral">awaiting colleague</Badge>
                  )
                ) : null}

                {row.awaitingMyAction && row.myRole === 'counterparty' ? (
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="success"
                      onClick={() => respond.mutate({ id: row.id, accept: true })}
                      loading={respond.isPending}
                    >
                      <Check />
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="danger-outline"
                      onClick={() => respond.mutate({ id: row.id, accept: false })}
                    >
                      <X />
                      Decline
                    </Button>
                  </div>
                ) : null}

                {row.awaitingMyAction && row.myRole === 'approver' ? (
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="success"
                      onClick={() => decide.mutate({ id: row.id, decision: 'APPROVED' })}
                      loading={decide.isPending}
                    >
                      <Check />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="danger-outline"
                      onClick={() => decide.mutate({ id: row.id, decision: 'REJECTED' })}
                    >
                      <X />
                      Reject
                    </Button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

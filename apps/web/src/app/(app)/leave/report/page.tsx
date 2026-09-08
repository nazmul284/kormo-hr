'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarRange } from 'lucide-react';
import { useState } from 'react';

import { ColumnChart, RankedBars } from '@/components/charts/bars';
import { DataTable, FilterBar, type Column } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { StatTile } from '@/components/shared/stat-tile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Select } from '@/components/ui/input';
import { LinkTabs } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { countOf, formatDate, formatDays, leaveColor, MONTHS_SHORT, yearOptions } from '@/lib/utils';
import { LEAVE_TABS } from '@/lib/tabs';

interface Report {
  year: number;
  totalDaysTaken: number;
  totalRequests: number;
  byType: { leaveTypeId: number; label: string; key: string; colorHex: string; days: number; requests: number }[];
  byMonth: { month: number; days: number; requests: number }[];
  balances: { leaveTypeId: number; key: string; label: string; colorHex: string; entitled: number; consumed: number; remaining: number }[];
  requests: {
    id: number; startDate: string; endDate: string; leaveDays: number; reason: string;
    leaveType: { key: string; label: string; colorHex: string };
  }[];
}

interface CarryForward {
  id: number;
  fromYear: number;
  toYear: number;
  eligibleDays: number;
  carriedDays: number;
  lapsedDays: number;
  expiresAt: string | null;
  isExpired: boolean;
  leaveType: { key: string; label: string; colorHex: string; maxCarryForward: number };
}

export default function LeaveReportPage() {
  const [year, setYear] = useState(new Date().getUTCFullYear());

  const report = useQuery({
    queryKey: ['leave', 'report', year],
    queryFn: () => api.get<Report>('/leave/report', { year }),
  });

  const carry = useQuery({
    queryKey: ['leave', 'carry-forward'],
    queryFn: () => api.get<CarryForward[]>('/leave/carry-forward'),
  });

  const data = report.data;

  const requestColumns: Column<Report['requests'][number]>[] = [
    {
      key: 'type',
      header: 'Leave type',
      render: (row) => (
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: leaveColor(row.leaveType.key) }} />
          <span className="truncate text-xs font-medium text-ink">{row.leaveType.label}</span>
        </span>
      ),
    },
    { key: 'range', header: 'Dates', render: (row) => <span className="whitespace-nowrap">{formatDate(row.startDate, 'short')} – {formatDate(row.endDate, 'short')}</span> },
    { key: 'days', header: 'Days', align: 'right', render: (row) => <span className="font-medium text-ink">{formatDays(row.leaveDays)}</span> },
    { key: 'reason', header: 'Reason', hideBelow: 'md', render: (row) => <span className="line-clamp-2 max-w-lg text-xs">{row.reason}</span> },
  ];

  const carryColumns: Column<CarryForward>[] = [
    { key: 'type', header: 'Leave type', render: (row) => row.leaveType.label },
    { key: 'from', header: 'From year', align: 'right', render: (row) => row.fromYear },
    { key: 'eligible', header: 'Eligible', align: 'right', render: (row) => formatDays(row.eligibleDays) },
    {
      key: 'carried',
      header: 'Carried',
      align: 'right',
      render: (row) => <span className="font-medium text-good-ink">{formatDays(row.carriedDays)}</span>,
    },
    {
      key: 'lapsed',
      header: 'Lapsed',
      align: 'right',
      render: (row) =>
        row.lapsedDays > 0 ? (
          <span className="text-critical-ink">{formatDays(row.lapsedDays)}</span>
        ) : (
          <span className="text-ink-muted">—</span>
        ),
    },
    {
      key: 'cap',
      header: 'Cap',
      align: 'right',
      hideBelow: 'sm',
      render: (row) => formatDays(row.leaveType.maxCarryForward),
    },
    {
      key: 'expires',
      header: 'Expires',
      align: 'right',
      render: (row) =>
        row.expiresAt ? (
          <span className={row.isExpired ? 'text-critical-ink' : ''}>{formatDate(row.expiresAt, 'short')}</span>
        ) : '—',
    },
  ];

  return (
    <>
      <PageHeader
        title="My leave report"
        description="Consumption by type and by month for the year, plus your carry-forward history."
        breadcrumbs={[{ label: 'Leaves', href: '/leave' }, { label: 'My Leave Report' }]}
      />

      <LinkTabs tabs={LEAVE_TABS} />

      <FilterBar>
        <Field label="Year">
          <Select value={year} onChange={(event) => setYear(Number(event.target.value))}>
            {yearOptions(4, 0).map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </Select>
        </Field>
      </FilterBar>

      {report.isLoading || !data ? (
        <div className="h-64 skeleton" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile label="Days taken" value={formatDays(data.totalDaysTaken)} icon={CalendarRange} tone="brand" />
            <StatTile label="Requests approved" value={data.totalRequests} />
            <StatTile
              label="Remaining across types"
              value={formatDays(data.balances.reduce((sum, item) => sum + item.remaining, 0))}
              tone="good"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Days taken by leave type</CardTitle>
              </CardHeader>
              <CardContent>
                {/* Each bar keeps its leave type's own colour: colour follows
                    the entity here, and every bar is direct-labelled. */}
                <RankedBars
                  data={data.byType
                    .slice()
                    .sort((a, b) => b.days - a.days)
                    .map((item) => ({
                      key: String(item.leaveTypeId),
                      label: item.label,
                      value: item.days,
                      secondary: countOf(item.requests, 'request'),
                      color: leaveColor(item.key),
                    }))}
                  formatValue={(value) => `${formatDays(value)} d`}
                  emptyLabel="No approved leave in this year"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Days taken by month</CardTitle>
                <p className="mt-0.5 text-xs text-ink-muted">Hover a column for the exact figure</p>
              </CardHeader>
              <CardContent>
                <ColumnChart
                  data={data.byMonth.map((item) => ({
                    key: String(item.month),
                    label: MONTHS_SHORT[item.month - 1],
                    value: item.days,
                  }))}
                  height={140}
                  formatValue={(value) => countOf(formatDays(value), 'day')}
                  emptyLabel="No approved leave in this year"
                />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-ink">Approved leave in {data.year}</h2>
            <DataTable
              columns={requestColumns}
              rows={data.requests}
              keyOf={(row) => row.id}
              emptyTitle="No approved leave this year"
            />
          </div>
        </>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">Carry forward</h2>
        <p className="text-xs text-ink-secondary">
          Unused annual leave carries into the next year up to the policy cap; anything
          above the cap lapses, and the carried days themselves expire on the date shown.
        </p>
        {carry.isLoading ? (
          <div className="h-32 skeleton" />
        ) : (carry.data?.length ?? 0) === 0 ? (
          <Card>
            <EmptyState
              title="No carry-forward records"
              description="Carry-forward is calculated at year end for carry-forwardable leave types."
            />
          </Card>
        ) : (
          <DataTable
            columns={carryColumns}
            rows={carry.data ?? []}
            keyOf={(row) => row.id}
          />
        )}
      </div>
    </>
  );
}

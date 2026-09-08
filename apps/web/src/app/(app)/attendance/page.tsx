'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Info, PenLine } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shared/page-header';
import { DataTable, FilterBar, type Column } from '@/components/shared/data-table';
import { MetricRow } from '@/components/shared/stat-tile';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { CountedTextarea, Field, Input, Select } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { LinkTabs } from '@/components/ui/tabs';
import { ApiError, api } from '@/lib/api';
import type { AttendanceDay, AttendanceMonth } from '@/lib/types';
import { MONTHS, formatDate, minutesToHm, yearOptions } from '@/lib/utils';
import { ATTENDANCE_TABS } from '@/lib/tabs';

function AttendanceView() {
  const searchParams = useSearchParams();
  const now = new Date();
  const [month, setMonth] = useState(now.getUTCMonth() + 1);
  const [year, setYear] = useState(now.getUTCFullYear());
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<AttendanceDay | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['attendance', 'monthly', month, year, status],
    queryFn: () =>
      api.get<AttendanceMonth>('/attendance', { month, year, status: status || undefined }),
  });

  // ?request=1 from the dashboard opens the correction form on the first
  // day that actually needs one.
  useEffect(() => {
    if (searchParams.get('request') !== '1' || !data) return;
    const candidate = data.days.find((day) => day.needsCorrection) ?? null;
    if (candidate) setEditing(candidate);
  }, [searchParams, data]);

  const columns = useMemo<Column<AttendanceDay>[]>(
    () => [
      { key: 'sn', header: 'SN', align: 'right', width: '3.5rem', render: (row) => row.sn },
      {
        key: 'date',
        header: 'Date',
        render: (row) => <span className="whitespace-nowrap font-medium text-ink">{formatDate(row.date)}</span>,
      },
      { key: 'day', header: 'Day', hideBelow: 'sm', render: (row) => row.day },
      {
        key: 'shift',
        header: 'Shift',
        hideBelow: 'md',
        render: (row) => <span className="whitespace-nowrap text-xs">{row.shiftName ?? '—'}</span>,
      },
      { key: 'it', header: 'IT', align: 'right', render: (row) => row.inTime },
      { key: 'ot', header: 'OT', align: 'right', render: (row) => row.outTime },
      { key: 'lt', header: 'LT', align: 'right', hideBelow: 'sm', render: (row) => row.lateTime },
      ...(data?.capabilities.canViewBreaktime
        ? [{
            key: 'bt', header: 'BT', align: 'right' as const, hideBelow: 'lg' as const,
            render: (row: AttendanceDay) => row.breakTime ?? '—',
          }]
        : []),
      { key: 'th', header: 'TH', align: 'right', render: (row) => row.totalHours },
      { key: 'oth', header: 'OTH', align: 'right', hideBelow: 'md', render: (row) => row.overtimeHours },
      {
        key: 'status',
        header: 'Status',
        render: (row) => (
          <span className="flex items-center gap-1.5">
            <StatusBadge status={row.status} />
            {row.isEdited ? (
              <Badge tone="info" title="Corrected after approval">
                <PenLine aria-hidden />
                edited
              </Badge>
            ) : null}
          </span>
        ),
      },
      {
        key: 'action',
        header: '',
        align: 'right',
        render: (row) =>
          data?.capabilities.canRequestEdit &&
          !['WEEKEND', 'HOLIDAY', 'CONDITIONAL_WEEKEND'].includes(row.status) ? (
            row.editRequest?.status === 'PENDING' ? (
              <Badge tone="warning">pending</Badge>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setEditing(row)}>
                <PenLine />
                Edit
              </Button>
            )
          ) : null,
      },
    ],
    [data?.capabilities.canViewBreaktime, data?.capabilities.canRequestEdit],
  );

  const summary = data?.summary;

  return (
    <>
      <PageHeader
        title="My Attendance"
        description="IT = in time · OT = out time · LT = late time · BT = break time · TH = total hours · OTH = overtime hours."
        breadcrumbs={[{ label: 'Attendance' }, { label: 'My Attendance' }]}
      />

      <LinkTabs tabs={ATTENDANCE_TABS} />

      <FilterBar>
        <Field label="Month">
          <Select value={month} onChange={(event) => setMonth(Number(event.target.value))}>
            {MONTHS.map((label, index) => (
              <option key={label} value={index + 1}>{label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Year">
          <Select value={year} onChange={(event) => setYear(Number(event.target.value))}>
            {yearOptions().map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            {['PRESENT', 'LATE', 'ABSENT', 'AFL', 'LEAVE', 'HALF_DAY', 'HOLIDAY', 'WEEKEND'].map((option) => (
              <option key={option} value={option}>{option.replace(/_/g, ' ')}</option>
            ))}
          </Select>
        </Field>
      </FilterBar>

      {summary ? (
        <>
          <MetricRow
            items={[
              { label: 'Present', value: summary.present, tone: 'good' },
              { label: 'Late', value: summary.late, tone: 'warning' },
              { label: 'Absent', value: summary.absent + summary.afl, tone: 'critical' },
              { label: 'Leave', value: summary.leave + summary.halfDayLeave, tone: 'brand' },
            ]}
          />
          <MetricRow
            items={[
              { label: 'Working days', value: summary.workingDays },
              { label: 'Total hours', value: minutesToHm(summary.totalWorkMinutes) },
              { label: 'Late time', value: minutesToHm(summary.totalLateMinutes) },
              { label: 'Overtime', value: minutesToHm(summary.totalOvertimeMinutes) },
            ]}
          />
        </>
      ) : null}

      <DataTable
        columns={columns}
        rows={data?.days ?? []}
        keyOf={(row) => row.id}
        loading={isLoading}
        emptyTitle="No attendance for this month"
        emptyDescription="Either the month has not started yet, or you had not joined. Try another month."
      />

      <EditRequestDialog day={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function EditRequestDialog({
  day,
  onClose,
}: {
  day: AttendanceDay | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [inTime, setInTime] = useState('');
  const [outTime, setOutTime] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!day) return;
    // Pre-fill with whatever was actually recorded, so the employee only
    // has to correct the part that is wrong.
    setInTime(day.inTime !== '--' ? day.inTime.slice(0, 5) : '');
    setOutTime(day.outTime !== '--' ? day.outTime.slice(0, 5) : '');
    setReason('');
  }, [day]);

  const submit = useMutation({
    mutationFn: () =>
      api.post('/attendance/edit-requests', {
        date: day!.date.slice(0, 10),
        requestedInTime: inTime || undefined,
        requestedOutTime: outTime || undefined,
        reason,
      }),
    onSuccess: () => {
      toast.success('Correction requested', {
        description: 'Your line manager has been notified.',
      });
      void queryClient.invalidateQueries({ queryKey: ['attendance'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
    onError: (error) => {
      toast.error('Could not submit the request', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  return (
    <Dialog open={day !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Request attendance correction</DialogTitle>
          <DialogDescription>
            {day ? `${formatDate(day.date, 'long')} · ${day.shiftName ?? 'no shift'}` : ''}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg bg-surface-sunken px-3 py-2.5 text-xs text-ink-secondary">
            <Info className="mt-0.5 size-3.5 shrink-0 text-ink-muted" aria-hidden />
            <span>
              Currently recorded as in {day?.inTime ?? '—'}, out {day?.outTime ?? '—'}. Your
              manager approves or rejects the correction; approved changes flow straight
              through to payroll.
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Corrected in time" htmlFor="inTime">
              <Input
                id="inTime"
                type="time"
                value={inTime}
                onChange={(event) => setInTime(event.target.value)}
              />
            </Field>
            <Field label="Corrected out time" htmlFor="outTime">
              <Input
                id="outTime"
                type="time"
                value={outTime}
                onChange={(event) => setOutTime(event.target.value)}
              />
            </Field>
          </div>

          <Field label="Reason" htmlFor="reason" required hint="Your manager sees this verbatim.">
            <CountedTextarea
              id="reason"
              maxLength={255}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Forgot to tap out at the gate; left at the usual time."
            />
          </Field>
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => submit.mutate()}
            loading={submit.isPending}
            disabled={reason.trim().length < 5 || (!inTime && !outTime)}
          >
            <CalendarClock />
            Submit request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AttendancePage() {
  return (
    <Suspense fallback={<div className="h-96 skeleton" />}>
      <AttendanceView />
    </Suspense>
  );
}

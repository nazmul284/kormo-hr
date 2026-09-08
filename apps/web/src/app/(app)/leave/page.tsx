'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarHeart, Info, Paperclip, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { DataTable, type Column } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CountedTextarea, Field, Input, Label } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { LinkTabs, SegmentedTabs } from '@/components/ui/tabs';
import { ApiError, api } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { LeaveBalance, Paginated } from '@/lib/types';
import { cn, countOf, formatDate, formatDays, leaveColor } from '@/lib/utils';
import { LEAVE_TABS } from '@/lib/tabs';

interface LeaveType {
  id: number;
  key: string;
  label: string;
  colorHex: string;
  requiresDocument: boolean;
  minNoticeDays: number;
  maxConsecutiveDays: number;
  countsHolidays: boolean;
  isPaid: boolean;
}

interface LeavePreview {
  leaveType: { id: number; key: string; label: string };
  calendarDays: number;
  leaveDays: number;
  weekendCount: number;
  holidayCount: number;
  days: {
    date: string; weekday: number; isWeekend: boolean; isHoliday: boolean;
    holidayName?: string; chargeable: boolean; charge: number;
  }[];
  balance: { available: number; remaining: number };
  sufficientBalance: boolean;
  warnings: string[];
}

interface LeaveRequest {
  id: number;
  startDate: string;
  endDate: string;
  leaveDays: number;
  calendarDays: number;
  reason: string;
  appliedDate: string;
  status: string;
  decisionNote: string | null;
  documentPath: string | null;
  canCancel: boolean;
  leaveType: { id: number; key: string; label: string; colorHex: string };
  approver: { firstName: string; lastName: string } | null;
}

export default function LeavePage() {
  return (
    <>
      <PageHeader
        title="Leaves"
        description="Leave Days are the chargeable days — weekends and holidays inside the range are excluded unless the leave type counts them."
        breadcrumbs={[{ label: 'Leaves' }, { label: 'Apply' }]}
      />
      <LinkTabs tabs={LEAVE_TABS} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <ApplyForm />
        <div className="space-y-4">
          <BalanceCard />
          <MyRequests />
        </div>
      </div>
    </>
  );
}

// ── apply form ────────────────────────────────────────────────────────

function ApplyForm() {
  const queryClient = useQueryClient();

  const [leaveTypeId, setLeaveTypeId] = useState<number | null>(null);
  const [period, setPeriod] = useState<'one' | 'many'>('one');
  const [dayPart, setDayPart] = useState<'FULL_DAY' | 'FIRST_HALF' | 'SECOND_HALF'>('FULL_DAY');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [documentPath, setDocumentPath] = useState('');

  const { data: types } = useQuery({
    queryKey: ['leave', 'types'],
    queryFn: () => api.get<LeaveType[]>('/leave/types'),
  });

  useEffect(() => {
    if (leaveTypeId === null && types && types.length > 0) setLeaveTypeId(types[0].id);
  }, [types, leaveTypeId]);

  // A one-day request pins the end date to the start.
  const effectiveEnd = period === 'one' ? startDate : endDate;

  useEffect(() => {
    if (period === 'one') setEndDate(startDate);
    if (period === 'many') setDayPart('FULL_DAY');
  }, [period, startDate]);

  const selectedType = types?.find((type) => type.id === leaveTypeId);

  /*
   * The preview is computed server-side by the very same function that
   * validates the submission, so the "Leave Days vs Calendar Days" the
   * employee sees can never disagree with what actually gets charged.
   */
  const preview = useQuery({
    queryKey: ['leave', 'preview', leaveTypeId, startDate, effectiveEnd, dayPart],
    queryFn: () =>
      api.post<LeavePreview>('/leave/preview', {
        leaveTypeId,
        startDate,
        endDate: effectiveEnd,
        dayPart,
      }),
    enabled: leaveTypeId !== null && Boolean(startDate) && Boolean(effectiveEnd),
    retry: false,
  });

  const apply = useMutation({
    mutationFn: () =>
      api.post('/leave/apply', {
        leaveTypeId,
        startDate,
        endDate: effectiveEnd,
        dayPart,
        reason,
        documentPath: documentPath || undefined,
      }),
    onSuccess: () => {
      toast.success('Leave applied', { description: 'Your line manager has been notified.' });
      void queryClient.invalidateQueries({ queryKey: ['leave'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setReason('');
      setDocumentPath('');
    },
    onError: (error) => {
      toast.error('Could not apply for leave', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  const previewError = preview.error instanceof ApiError ? preview.error.message : null;
  const canSubmit =
    leaveTypeId !== null &&
    reason.trim().length >= 5 &&
    (preview.data?.leaveDays ?? 0) > 0 &&
    (!selectedType?.requiresDocument || documentPath.trim().length > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Apply for leave</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <fieldset>
          <Label className="mb-2">Leave type</Label>
          <div className="grid grid-cols-2 gap-1.5">
            {(types ?? []).map((type) => (
              <button
                key={type.id}
                type="button"
                onClick={() => setLeaveTypeId(type.id)}
                aria-pressed={leaveTypeId === type.id}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors',
                  leaveTypeId === type.id
                    ? 'border-brand bg-brand-subtle'
                    : 'border-line hover:bg-surface-sunken',
                )}
              >
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: leaveColor(type.key) }}
                />
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink">
                  {type.label}
                </span>
              </button>
            ))}
          </div>
          {selectedType ? (
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-2xs text-ink-muted">
              {selectedType.minNoticeDays > 0
                ? <span>{countOf(selectedType.minNoticeDays, 'day')}&rsquo; notice</span>
                : null}
              {selectedType.maxConsecutiveDays > 0 ? <span>max {selectedType.maxConsecutiveDays} consecutive days</span> : null}
              {selectedType.requiresDocument ? <span className="text-serious">document required</span> : null}
              {selectedType.countsHolidays ? <span>counted in calendar days</span> : null}
              {!selectedType.isPaid ? <span className="text-serious">unpaid</span> : null}
            </p>
          ) : null}
        </fieldset>

        <fieldset>
          <Label className="mb-2">Period</Label>
          <SegmentedTabs
            size="sm"
            value={period}
            onChange={setPeriod}
            options={[
              { value: 'one', label: 'One day' },
              { value: 'many', label: 'More than 1 day' },
            ]}
          />
        </fieldset>

        <div className={cn('grid gap-3', period === 'many' ? 'grid-cols-2' : 'grid-cols-1')}>
          <Field label={period === 'one' ? 'Date' : 'Start date'} htmlFor="startDate" required>
            <Input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </Field>
          {period === 'many' ? (
            <Field label="End date" htmlFor="endDate" required>
              <Input
                id="endDate"
                type="date"
                min={startDate}
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </Field>
          ) : null}
        </div>

        {period === 'one' ? (
          <fieldset>
            <Label className="mb-2">Day part</Label>
            <SegmentedTabs
              size="sm"
              value={dayPart}
              onChange={setDayPart}
              options={[
                { value: 'FULL_DAY', label: 'Full day' },
                { value: 'FIRST_HALF', label: 'First half' },
                { value: 'SECOND_HALF', label: 'Second half' },
              ]}
            />
          </fieldset>
        ) : null}

        {/* Live day maths — the whole point of the preview endpoint. */}
        <div className="rounded-lg border border-line bg-surface-sunken p-3">
          {previewError ? (
            <p className="flex items-start gap-2 text-xs text-critical-ink">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {previewError}
            </p>
          ) : preview.data ? (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-semibold text-ink tabular">{formatDays(preview.data.leaveDays)}</p>
                  <p className="text-2xs text-ink-muted">Leave days</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-ink-secondary tabular">{preview.data.calendarDays}</p>
                  <p className="text-2xs text-ink-muted">Calendar days</p>
                </div>
                <div>
                  <p
                    className={cn(
                      'text-lg font-semibold tabular',
                      preview.data.sufficientBalance ? 'text-good-ink' : 'text-critical-ink',
                    )}
                  >
                    {formatDays(preview.data.balance.available)}
                  </p>
                  <p className="text-2xs text-ink-muted">Available</p>
                </div>
              </div>

              {preview.data.weekendCount > 0 || preview.data.holidayCount > 0 ? (
                <p className="mt-2 border-t border-line pt-2 text-2xs text-ink-muted">
                  Excludes {countOf(preview.data.weekendCount, 'weekend day')}
                  {preview.data.holidayCount > 0 ? ` and ${countOf(preview.data.holidayCount, 'holiday')}` : ''}
                  {' '}inside the range.
                </p>
              ) : null}

              {preview.data.warnings.length > 0 ? (
                <ul className="mt-2 space-y-1 border-t border-line pt-2">
                  {preview.data.warnings.map((warning) => (
                    <li key={warning} className="flex items-start gap-1.5 text-2xs text-serious">
                      <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
                      {warning}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <p className="text-xs text-ink-muted">Pick a type and dates to see the day count.</p>
          )}
        </div>

        {selectedType?.requiresDocument ? (
          <Field
            label="Supporting document"
            htmlFor="documentPath"
            required
            hint="Reference or path of the uploaded certificate."
          >
            <div className="relative">
              <Paperclip className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-muted" aria-hidden />
              <Input
                id="documentPath"
                className="pl-8"
                value={documentPath}
                onChange={(event) => setDocumentPath(event.target.value)}
                placeholder="medical-certificate-2026-09.pdf"
              />
            </div>
          </Field>
        ) : null}

        <Field label="Reason" required hint="Maximum 255 characters. Your manager sees this.">
          <CountedTextarea
            maxLength={255}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Family wedding in my home district; travelling the day before."
          />
        </Field>

        <Button
          className="w-full"
          size="lg"
          onClick={() => apply.mutate()}
          loading={apply.isPending}
          disabled={!canSubmit}
        >
          <CalendarHeart />
          Submit leave request
        </Button>
      </CardContent>
    </Card>
  );
}

// ── balances ──────────────────────────────────────────────────────────

function BalanceCard() {
  const { data } = useQuery({
    queryKey: ['leave', 'balances'],
    queryFn: () => api.get<{ year: number; balances: LeaveBalance[] }>('/leave/balances'),
  });

  if (!data) return <div className="h-28 skeleton" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>My balances · {data.year}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.balances.map((balance) => (
            <div key={balance.leaveTypeId} className="rounded-lg border border-line p-3">
              <div className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-sm"
                  style={{ backgroundColor: leaveColor(balance.key) }}
                />
                <p className="min-w-0 truncate text-2xs font-medium uppercase tracking-wide text-ink-muted">
                  {balance.label}
                </p>
              </div>
              <p className="mt-1.5 text-xl font-semibold text-ink tabular">
                {formatDays(balance.available)}
                <span className="ml-1 text-xs font-normal text-ink-muted">
                  / {formatDays(balance.entitled)}
                </span>
              </p>
              <p className="mt-0.5 text-2xs text-ink-muted">
                {formatDays(balance.consumed)} taken
                {balance.pending > 0 ? ` · ${formatDays(balance.pending)} pending` : ''}
                {balance.carriedForward > 0 ? ` · ${formatDays(balance.carriedForward)} carried` : ''}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── my requests ───────────────────────────────────────────────────────

function MyRequests() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<'' | 'PENDING' | 'APPROVED' | 'REJECTED'>('');

  const { data, isLoading } = useQuery({
    queryKey: ['leave', 'requests', status],
    queryFn: () =>
      api.get<Paginated<LeaveRequest>>('/leave/requests/mine', {
        status: status || undefined,
        pageSize: 25,
      }),
  });

  const cancel = useMutation({
    mutationFn: (id: number) => api.patch(`/leave/requests/${id}/cancel`),
    onSuccess: () => {
      toast.success('Leave request withdrawn');
      void queryClient.invalidateQueries({ queryKey: ['leave'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error) => {
      toast.error('Could not withdraw', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  const columns = useMemo<Column<LeaveRequest>[]>(
    () => [
      {
        key: 'type',
        header: 'LT',
        render: (row) => (
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-sm"
              style={{ backgroundColor: leaveColor(row.leaveType.key) }}
            />
            <span className="truncate text-xs font-medium text-ink">{row.leaveType.label}</span>
          </span>
        ),
      },
      { key: 'sd', header: 'SD', render: (row) => <span className="whitespace-nowrap">{formatDate(row.startDate)}</span> },
      { key: 'ed', header: 'ED', hideBelow: 'sm', render: (row) => <span className="whitespace-nowrap">{formatDate(row.endDate)}</span> },
      { key: 'ld', header: 'LD', align: 'right', render: (row) => <span className="font-medium text-ink">{formatDays(row.leaveDays)}</span> },
      { key: 'ad', header: 'AD', hideBelow: 'md', render: (row) => <span className="whitespace-nowrap text-xs">{formatDate(row.appliedDate, 'short')}</span> },
      {
        key: 'status',
        header: 'Status',
        render: (row) => (
          <div className="flex flex-col items-start gap-1">
            <StatusBadge status={row.status} />
            {row.decisionNote ? (
              <span className="max-w-[14rem] truncate text-2xs text-ink-muted" title={row.decisionNote}>
                {row.decisionNote}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        key: 'action',
        header: '',
        align: 'right',
        render: (row) =>
          row.canCancel ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => cancel.mutate(row.id)}
              loading={cancel.isPending && cancel.variables === row.id}
            >
              <Undo2 />
              Withdraw
            </Button>
          ) : null,
      },
    ],
    [cancel],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">My leave requests</h2>
        <SegmentedTabs
          size="sm"
          value={status}
          onChange={setStatus}
          options={[
            { value: '', label: 'All' },
            { value: 'PENDING', label: 'Pending' },
            { value: 'APPROVED', label: 'Approved' },
            { value: 'REJECTED', label: 'Rejected' },
          ]}
        />
      </div>

      <p className="text-2xs text-ink-muted">
        LT = leave type · SD = start date · ED = end date · LD = leave days · AD = applied date
      </p>

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        keyOf={(row) => row.id}
        loading={isLoading}
        emptyTitle="No leave requests"
        emptyDescription="Requests you submit appear here with their approval status."
      />
    </div>
  );
}

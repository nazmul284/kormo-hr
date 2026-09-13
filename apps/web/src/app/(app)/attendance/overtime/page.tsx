'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Timer } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { DecisionButtons, DecisionDialog, type DecisionTarget } from '@/components/shared/decision-dialog';
import { DataTable, type Column } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { StatTile } from '@/components/shared/stat-tile';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { CountedTextarea, Field, Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { LinkTabs, SegmentedTabs } from '@/components/ui/tabs';
import { ApiError, api } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { Paginated } from '@/lib/types';
import { countOf, formatDate } from '@/lib/utils';
import { ATTENDANCE_TABS } from '@/lib/tabs';

interface OvertimeRequest {
  id: number;
  date: string;
  fromTime: string;
  toTime: string;
  hours: number;
  reason: string;
  status: string;
  decisionNote: string | null;
  createdAt: string;
  approver?: { firstName: string; lastName: string } | null;
  employee?: {
    id: number; employeeVisibleId: string; fullName: string; initials: string;
    designation: { name: string } | null;
  };
}

export default function OvertimePage() {
  const { can } = useSession();
  const canApprove = can('overtime.approve');

  const [view, setView] = useState<'mine' | 'queue'>('mine');
  const [creating, setCreating] = useState(false);
  const [target, setTarget] = useState<DecisionTarget | null>(null);
  const [decision, setDecision] = useState<'APPROVED' | 'REJECTED' | null>(null);

  const mine = useQuery({
    queryKey: ['overtime', 'mine'],
    queryFn: () =>
      api.get<Paginated<OvertimeRequest> & { totalApprovedHours: number }>(
        '/attendance/overtime/mine',
        { pageSize: 50 },
      ),
    enabled: view === 'mine',
  });

  const queue = useQuery({
    queryKey: ['overtime', 'queue'],
    queryFn: () =>
      api.get<Paginated<OvertimeRequest>>('/attendance/overtime/queue', {
        status: 'PENDING',
        pageSize: 50,
      }),
    enabled: view === 'queue' && canApprove,
  });

  const myColumns: Column<OvertimeRequest>[] = [
    { key: 'date', header: 'Date', render: (row) => <span className="whitespace-nowrap font-medium text-ink">{formatDate(row.date)}</span> },
    { key: 'window', header: 'Window', render: (row) => <span className="whitespace-nowrap tabular">{row.fromTime} – {row.toTime}</span> },
    { key: 'hours', header: 'Hours', align: 'right', render: (row) => <span className="font-medium text-ink">{row.hours}</span> },
    { key: 'reason', header: 'Reason', hideBelow: 'md', render: (row) => <span className="line-clamp-2 max-w-md text-xs">{row.reason}</span> },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      render: (row) => (
        <div className="flex flex-col items-end gap-1">
          <StatusBadge status={row.status} />
          {row.decisionNote ? (
            <span className="max-w-xs truncate text-2xs text-ink-muted">{row.decisionNote}</span>
          ) : null}
        </div>
      ),
    },
  ];

  const queueColumns: Column<OvertimeRequest>[] = [
    {
      key: 'employee',
      header: 'Employee',
      render: (row) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={row.employee?.fullName} initials={row.employee?.initials} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{row.employee?.fullName}</p>
            <p className="truncate text-2xs text-ink-muted">{row.employee?.designation?.name ?? '—'}</p>
          </div>
        </div>
      ),
    },
    { key: 'date', header: 'Date', render: (row) => <span className="whitespace-nowrap">{formatDate(row.date)}</span> },
    { key: 'window', header: 'Window', hideBelow: 'sm', render: (row) => <span className="whitespace-nowrap tabular">{row.fromTime} – {row.toTime}</span> },
    { key: 'hours', header: 'Hours', align: 'right', render: (row) => <span className="font-medium text-ink">{row.hours}</span> },
    { key: 'reason', header: 'Reason', hideBelow: 'lg', render: (row) => <span className="line-clamp-2 max-w-sm text-xs">{row.reason}</span> },
    {
      key: 'action',
      header: '',
      align: 'right',
      render: (row) => (
        <DecisionButtons
          onApprove={() => {
            setTarget({
              id: row.id,
              endpoint: `/attendance/overtime/${row.id}`,
              title: 'overtime request',
              summary: `${row.employee?.fullName} · ${formatDate(row.date)} · ${countOf(row.hours, 'hour')}. Approved overtime is paid at twice the hourly basic rate.`,
              invalidate: [['overtime']],
            });
            setDecision('APPROVED');
          }}
          onReject={() => {
            setTarget({
              id: row.id,
              endpoint: `/attendance/overtime/${row.id}`,
              title: 'overtime request',
              summary: `${row.employee?.fullName} · ${formatDate(row.date)} · ${countOf(row.hours, 'hour')}.`,
              invalidate: [['overtime']],
            });
            setDecision('REJECTED');
          }}
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Overtime"
        description="Approved overtime is paid at twice the hourly basic rate and is picked up by the next payroll run. The multiplier is a payroll setting — change it there, not here, if your jurisdiction differs."
        breadcrumbs={[{ label: 'Attendance', href: '/attendance' }, { label: 'Overtime' }]}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus />
            Request overtime
          </Button>
        }
      />

      <LinkTabs tabs={ATTENDANCE_TABS} />

      {canApprove ? (
        <SegmentedTabs
          value={view}
          onChange={setView}
          options={[
            { value: 'mine', label: 'My requests' },
            { value: 'queue', label: 'Pending for approval', count: queue.data?.meta.total },
          ]}
        />
      ) : null}

      {view === 'mine' ? (
        <>
          {mine.data ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <StatTile
                label="Approved hours (all time)"
                value={Number(mine.data.totalApprovedHours ?? 0).toFixed(1)}
                icon={Timer}
                tone="good"
              />
              <StatTile
                label="Pending requests"
                value={mine.data.data.filter((row) => row.status === 'PENDING').length}
                tone="warning"
              />
              <StatTile label="Total requests" value={mine.data.meta.total} />
            </div>
          ) : null}

          <DataTable
            columns={myColumns}
            rows={mine.data?.data ?? []}
            keyOf={(row) => row.id}
            loading={mine.isLoading}
            emptyTitle="No overtime requests yet"
            emptyDescription="Raise a request for hours worked beyond your scheduled shift."
            emptyAction={
              <Button onClick={() => setCreating(true)}>
                <Plus />
                Request overtime
              </Button>
            }
          />
        </>
      ) : (
        <DataTable
          columns={queueColumns}
          rows={queue.data?.data ?? []}
          keyOf={(row) => row.id}
          loading={queue.isLoading}
          emptyTitle="Nothing waiting on you"
          emptyDescription="Overtime requests from your team will appear here."
        />
      )}

      <CreateOvertimeDialog open={creating} onClose={() => setCreating(false)} />

      <DecisionDialog
        target={target}
        decision={decision}
        onClose={() => {
          setTarget(null);
          setDecision(null);
        }}
      />
    </>
  );
}

function CreateOvertimeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [fromTime, setFromTime] = useState('19:00');
  const [toTime, setToTime] = useState('21:00');
  const [reason, setReason] = useState('');

  // Shown live so the employee sees what they are claiming before submit.
  const hours = (() => {
    const [fh, fm] = fromTime.split(':').map(Number);
    const [th, tm] = toTime.split(':').map(Number);
    let minutes = th * 60 + tm - (fh * 60 + fm);
    if (minutes <= 0) minutes += 24 * 60; // ran past midnight
    return Math.round((minutes / 60) * 100) / 100;
  })();

  const submit = useMutation({
    mutationFn: () => api.post('/attendance/overtime', { date, fromTime, toTime, reason }),
    onSuccess: () => {
      toast.success('Overtime requested', { description: 'Your line manager has been notified.' });
      void queryClient.invalidateQueries({ queryKey: ['overtime'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setReason('');
      onClose();
    },
    onError: (error) => {
      toast.error('Could not submit', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Request overtime</DialogTitle>
          <DialogDescription>
            For hours worked beyond your scheduled shift. Your line manager approves it.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <Field label="Date" htmlFor="ot-date" required>
            <Input
              id="ot-date"
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="From" htmlFor="ot-from" required>
              <Input id="ot-from" type="time" value={fromTime} onChange={(e) => setFromTime(e.target.value)} />
            </Field>
            <Field label="To" htmlFor="ot-to" required>
              <Input id="ot-to" type="time" value={toTime} onChange={(e) => setToTime(e.target.value)} />
            </Field>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-surface-sunken px-3 py-2.5">
            <span className="text-xs text-ink-secondary">Claimed hours</span>
            <span className="text-sm font-semibold text-ink tabular">
              {hours > 0 && hours <= 12 ? `${hours} h` : '—'}
            </span>
          </div>
          {hours > 12 ? (
            <p className="text-xs text-critical-ink">
              Overtime must be 12 hours or less. Check the from and to times.
            </p>
          ) : null}

          <Field label="Reason" required>
            <CountedTextarea
              maxLength={255}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Production release window ran past the scheduled slot."
            />
          </Field>
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => submit.mutate()}
            loading={submit.isPending}
            disabled={reason.trim().length < 5 || hours <= 0 || hours > 12}
          >
            <Timer />
            Submit request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

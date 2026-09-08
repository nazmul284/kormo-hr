'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Info } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { DecisionButtons, DecisionDialog, type DecisionTarget } from '@/components/shared/decision-dialog';
import { DataTable, type Column } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
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

interface CompRequest {
  id: number;
  workedDate: string;
  requestedOffDate: string | null;
  days: number;
  reason: string;
  status: string;
  decisionNote: string | null;
  expiresAt: string | null;
  consumedAt: string | null;
  isExpired?: boolean;
  employee?: {
    id: number; employeeVisibleId: string; fullName: string; initials: string;
    designation: { name: string } | null;
  };
}

export default function CompensationPage() {
  const { can } = useSession();
  const canApprove = can('compensation.approve');

  const [view, setView] = useState<'mine' | 'queue'>('mine');
  const [creating, setCreating] = useState(false);
  const [target, setTarget] = useState<DecisionTarget | null>(null);
  const [decision, setDecision] = useState<'APPROVED' | 'REJECTED' | null>(null);

  const mine = useQuery({
    queryKey: ['compensation', 'mine'],
    queryFn: () => api.get<Paginated<CompRequest>>('/attendance/compensation/mine', { pageSize: 50 }),
    enabled: view === 'mine',
  });

  const queue = useQuery({
    queryKey: ['compensation', 'queue'],
    queryFn: () =>
      api.get<Paginated<CompRequest>>('/attendance/compensation/queue', {
        status: 'PENDING',
        pageSize: 50,
      }),
    enabled: view === 'queue' && canApprove,
  });

  const myColumns: Column<CompRequest>[] = [
    {
      key: 'worked',
      header: 'Worked on',
      render: (row) => <span className="whitespace-nowrap font-medium text-ink">{formatDate(row.workedDate)}</span>,
    },
    {
      key: 'off',
      header: 'Day off claimed',
      render: (row) =>
        row.requestedOffDate ? formatDate(row.requestedOffDate) : <span className="text-ink-muted">to be decided</span>,
    },
    { key: 'days', header: 'Days', align: 'right', render: (row) => row.days },
    { key: 'reason', header: 'Reason', hideBelow: 'md', render: (row) => <span className="line-clamp-2 max-w-md text-xs">{row.reason}</span> },
    {
      key: 'expiry',
      header: 'Expires',
      hideBelow: 'sm',
      render: (row) =>
        row.expiresAt ? (
          <span className={row.isExpired ? 'text-critical-ink' : ''}>
            {formatDate(row.expiresAt, 'short')}
          </span>
        ) : '—',
    },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      render: (row) => (
        <div className="flex flex-col items-end gap-1">
          <StatusBadge status={row.status} />
          {row.isExpired && row.status === 'APPROVED' ? <Badge tone="critical">lapsed</Badge> : null}
        </div>
      ),
    },
  ];

  const queueColumns: Column<CompRequest>[] = [
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
    { key: 'worked', header: 'Worked on', render: (row) => <span className="whitespace-nowrap">{formatDate(row.workedDate)}</span> },
    {
      key: 'off',
      header: 'Day off claimed',
      hideBelow: 'sm',
      render: (row) => (row.requestedOffDate ? formatDate(row.requestedOffDate) : '—'),
    },
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
              endpoint: `/attendance/compensation/${row.id}`,
              title: 'compensatory off',
              summary: `${row.employee?.fullName} worked ${formatDate(row.workedDate)}. Approving credits ${countOf(row.days, 'day')} to their compensatory-off balance.`,
              invalidate: [['compensation'], ['leave']],
            });
            setDecision('APPROVED');
          }}
          onReject={() => {
            setTarget({
              id: row.id,
              endpoint: `/attendance/compensation/${row.id}`,
              title: 'compensatory off',
              summary: `${row.employee?.fullName} worked ${formatDate(row.workedDate)}.`,
              invalidate: [['compensation']],
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
        title="Compensatory off"
        description="Claim a day off for a weekend or holiday you actually worked. Approved claims credit your compensatory-off leave balance and lapse after 90 days."
        breadcrumbs={[{ label: 'Attendance', href: '/attendance' }, { label: 'Compensatory Off' }]}
        actions={
          <Button onClick={() => setCreating(true)}>
            <CalendarPlus />
            Claim comp-off
          </Button>
        }
      />

      <LinkTabs tabs={ATTENDANCE_TABS} />

      {canApprove ? (
        <SegmentedTabs
          value={view}
          onChange={setView}
          options={[
            { value: 'mine', label: 'My claims' },
            { value: 'queue', label: 'Pending for approval', count: queue.data?.meta.total },
          ]}
        />
      ) : null}

      {view === 'mine' ? (
        <DataTable
          columns={myColumns}
          rows={mine.data?.data ?? []}
          keyOf={(row) => row.id}
          loading={mine.isLoading}
          emptyTitle="No compensatory-off claims"
          emptyDescription="Only a weekend or holiday your attendance record shows you actually worked can be claimed."
        />
      ) : (
        <DataTable
          columns={queueColumns}
          rows={queue.data?.data ?? []}
          keyOf={(row) => row.id}
          loading={queue.isLoading}
          emptyTitle="Nothing waiting on you"
        />
      )}

      <ClaimDialog open={creating} onClose={() => setCreating(false)} />

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

function ClaimDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [workedDate, setWorkedDate] = useState('');
  const [requestedOffDate, setRequestedOffDate] = useState('');
  const [reason, setReason] = useState('');

  const submit = useMutation({
    mutationFn: () =>
      api.post('/attendance/compensation', {
        workedDate,
        requestedOffDate: requestedOffDate || undefined,
        reason,
      }),
    onSuccess: () => {
      toast.success('Claim submitted', { description: 'Your line manager has been notified.' });
      void queryClient.invalidateQueries({ queryKey: ['compensation'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setReason('');
      setWorkedDate('');
      setRequestedOffDate('');
      onClose();
    },
    onError: (error) => {
      toast.error('Could not submit the claim', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Claim compensatory off</DialogTitle>
          <DialogDescription>
            For a weekend or holiday you worked.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg bg-surface-sunken px-3 py-2.5 text-xs text-ink-secondary">
            <Info className="mt-0.5 size-3.5 shrink-0 text-ink-muted" aria-hidden />
            <span>
              The date must be a weekend or holiday your attendance record shows you actually
              worked — the claim is checked against it, so an ordinary working day is rejected.
            </span>
          </div>

          <Field label="Date worked" htmlFor="worked" required>
            <Input
              id="worked"
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              value={workedDate}
              onChange={(event) => setWorkedDate(event.target.value)}
            />
          </Field>

          <Field
            label="Day off you want to take"
            htmlFor="off"
            hint="Optional — you can decide later, but the credit lapses after 90 days."
          >
            <Input
              id="off"
              type="date"
              min={new Date().toISOString().slice(0, 10)}
              value={requestedOffDate}
              onChange={(event) => setRequestedOffDate(event.target.value)}
            />
          </Field>

          <Field label="Reason" required>
            <CountedTextarea
              maxLength={255}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Worked the full weekend shift to clear the dispatch backlog."
            />
          </Field>
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => submit.mutate()}
            loading={submit.isPending}
            disabled={!workedDate || reason.trim().length < 5}
          >
            <CalendarPlus />
            Submit claim
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

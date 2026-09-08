'use client';

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

import { DecisionButtons, DecisionDialog, type DecisionTarget } from '@/components/shared/decision-dialog';
import { DataTable, type Column } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { Avatar } from '@/components/ui/avatar';
import { StatusBadge } from '@/components/ui/status-badge';
import { LinkTabs, SegmentedTabs } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import type { Paginated } from '@/lib/types';
import { formatDate, formatTime } from '@/lib/utils';
import { ATTENDANCE_TABS } from '@/lib/tabs';

interface EditRequest {
  id: number;
  reason: string;
  status: string;
  createdAt: string;
  requestedInTime: string | null;
  requestedOutTime: string | null;
  decisionNote: string | null;
  attendance: {
    date: string;
    inTime: string | null;
    outTime: string | null;
    status: string;
    attendanceRosterShiftName: string | null;
  };
  employee: {
    id: number;
    employeeVisibleId: string;
    fullName: string;
    initials: string;
    designation: { name: string } | null;
    department: { name: string } | null;
  };
}

export default function AttendanceApprovalsPage() {
  const [status, setStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [target, setTarget] = useState<DecisionTarget | null>(null);
  const [decision, setDecision] = useState<'APPROVED' | 'REJECTED' | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['attendance', 'edit-queue', status],
    queryFn: () =>
      api.get<Paginated<EditRequest>>('/attendance/edit-requests/queue', {
        status,
        pageSize: 50,
      }),
  });

  function openDecision(row: EditRequest, next: 'APPROVED' | 'REJECTED') {
    setTarget({
      id: row.id,
      endpoint: `/attendance/edit-requests/${row.id}`,
      title: 'attendance correction',
      summary: (
        <>
          {row.employee.fullName} · {formatDate(row.attendance.date, 'long')} — requesting in{' '}
          {formatTime(row.requestedInTime)} / out {formatTime(row.requestedOutTime)}. Approving
          rewrites the attendance record and flows through to payroll.
        </>
      ),
      invalidate: [['attendance']],
    });
    setDecision(next);
  }

  const columns: Column<EditRequest>[] = [
    {
      key: 'employee',
      header: 'Employee',
      render: (row) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={row.employee.fullName} initials={row.employee.initials} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{row.employee.fullName}</p>
            <p className="truncate text-2xs text-ink-muted">
              #{row.employee.employeeVisibleId} · {row.employee.designation?.name ?? '—'}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      render: (row) => (
        <span className="whitespace-nowrap">{formatDate(row.attendance.date)}</span>
      ),
    },
    {
      key: 'recorded',
      header: 'Recorded',
      hideBelow: 'md',
      render: (row) => (
        <span className="whitespace-nowrap text-xs tabular">
          {formatTime(row.attendance.inTime)} → {formatTime(row.attendance.outTime)}
        </span>
      ),
    },
    {
      key: 'requested',
      header: 'Requested',
      render: (row) => (
        <span className="whitespace-nowrap text-xs font-medium text-ink tabular">
          {formatTime(row.requestedInTime)} → {formatTime(row.requestedOutTime)}
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      hideBelow: 'lg',
      render: (row) => (
        <span className="line-clamp-2 max-w-sm text-xs">{row.reason}</span>
      ),
    },
    {
      key: 'raised',
      header: 'Raised',
      align: 'right',
      hideBelow: 'sm',
      render: (row) => (
        <span className="whitespace-nowrap text-xs">{formatDate(row.createdAt, 'short')}</span>
      ),
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      render: (row) =>
        row.status === 'PENDING' ? (
          <DecisionButtons
            onApprove={() => openDecision(row, 'APPROVED')}
            onReject={() => openDecision(row, 'REJECTED')}
          />
        ) : (
          <div className="flex flex-col items-end gap-1">
            <StatusBadge status={row.status} />
            {row.decisionNote ? (
              <span className="max-w-xs truncate text-2xs text-ink-muted">{row.decisionNote}</span>
            ) : null}
          </div>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Attendance approval inbox"
        description="Corrections raised by your team. Approving rewrites the attendance record, so payroll sees the corrected times immediately."
        breadcrumbs={[{ label: 'Attendance', href: '/attendance' }, { label: 'Approval Inbox' }]}
      />

      <LinkTabs tabs={ATTENDANCE_TABS} />

      <SegmentedTabs
        value={status}
        onChange={setStatus}
        options={[
          { value: 'PENDING', label: 'Pending', count: status === 'PENDING' ? data?.meta.total : undefined },
          { value: 'APPROVED', label: 'Approved' },
          { value: 'REJECTED', label: 'Rejected' },
        ]}
      />

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        keyOf={(row) => row.id}
        loading={isLoading}
        emptyTitle={status === 'PENDING' ? 'Nothing waiting on you' : `No ${status.toLowerCase()} corrections`}
        emptyDescription={
          status === 'PENDING'
            ? 'Attendance corrections raised by your team will appear here.'
            : 'Try another status filter.'
        }
      />

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

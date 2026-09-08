'use client';

import { useQuery } from '@tanstack/react-query';
import { Activity, FileText, Paperclip } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { DecisionButtons, DecisionDialog, type DecisionTarget } from '@/components/shared/decision-dialog';
import { DataTable, type Column } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { LinkTabs, SegmentedTabs } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import type { Paginated } from '@/lib/types';
import { cn, countOf, formatDate, formatDays, leaveColor } from '@/lib/utils';
import { LEAVE_TABS } from '@/lib/tabs';

interface PendingLeave {
  sn: number;
  id: number;
  name: string;
  sd: string;
  ed: string;
  ld: number;
  lt: string;
  ad: string;
  reason: string;
  status: string;
  documentPath: string | null;
  contactWhileAway: string | null;
  leaveType: { key: string; colorHex: string; label: string };
  employee: {
    id: number; employeeVisibleId: string; fullName: string; initials: string;
    designation: { name: string } | null;
    department: { name: string } | null;
  };
}

export default function LeaveApprovalPage() {
  const [tab, setTab] = useState<'pending' | 'archive' | 'bradford'>('pending');
  const [target, setTarget] = useState<DecisionTarget | null>(null);
  const [decision, setDecision] = useState<'APPROVED' | 'REJECTED' | null>(null);

  const pending = useQuery({
    queryKey: ['leave', 'approvals', 'pending'],
    queryFn: () => api.get<Paginated<PendingLeave>>('/leave/approvals/pending', { pageSize: 50 }),
    enabled: tab === 'pending',
  });

  const archive = useQuery({
    queryKey: ['leave', 'approvals', 'archive'],
    queryFn: () => api.get<Paginated<any>>('/leave/approvals/archive', { pageSize: 50 }),
    enabled: tab === 'archive',
  });

  const columns: Column<PendingLeave>[] = [
    { key: 'sn', header: 'SN', align: 'right', width: '3.5rem', render: (row) => row.sn },
    {
      key: 'name',
      header: 'Name',
      render: (row) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={row.employee.fullName} initials={row.employee.initials} size="sm" />
          <div className="min-w-0">
            <Link
              href={`/profile/${row.employee.id}`}
              className="block truncate text-sm font-medium text-ink hover:text-brand"
            >
              {row.employee.fullName}
            </Link>
            <p className="truncate text-2xs text-ink-muted">
              #{row.employee.employeeVisibleId} · {row.employee.designation?.name ?? '—'}
            </p>
          </div>
        </div>
      ),
    },
    { key: 'sd', header: 'SD', render: (row) => <span className="whitespace-nowrap">{formatDate(row.sd)}</span> },
    { key: 'ed', header: 'ED', hideBelow: 'sm', render: (row) => <span className="whitespace-nowrap">{formatDate(row.ed)}</span> },
    { key: 'ld', header: 'LD', align: 'right', render: (row) => <span className="font-medium text-ink">{formatDays(row.ld)}</span> },
    {
      key: 'lt',
      header: 'LT',
      render: (row) => (
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: leaveColor(row.leaveType.key) }} />
          <span className="truncate text-xs">{row.lt}</span>
        </span>
      ),
    },
    { key: 'ad', header: 'AD', hideBelow: 'md', render: (row) => <span className="whitespace-nowrap text-xs">{formatDate(row.ad, 'short')}</span> },
    {
      key: 'reason',
      header: 'Reason',
      hideBelow: 'lg',
      render: (row) => (
        <div className="max-w-sm">
          <p className="line-clamp-2 text-xs">{row.reason}</p>
          {row.documentPath ? (
            <span className="mt-1 inline-flex items-center gap-1 text-2xs text-brand">
              <Paperclip className="size-3" aria-hidden />
              document attached
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      render: (row) => (
        <DecisionButtons
          onApprove={() => {
            setTarget({
              id: row.id,
              endpoint: `/leave/requests/${row.id}/decide`,
              title: row.lt,
              summary: `${row.employee.fullName} · ${formatDate(row.sd)} to ${formatDate(row.ed)} (${countOf(formatDays(row.ld), 'day')}). Approving deducts the balance and marks the attendance days as leave.`,
              invalidate: [['leave']],
            });
            setDecision('APPROVED');
          }}
          onReject={() => {
            setTarget({
              id: row.id,
              endpoint: `/leave/requests/${row.id}/decide`,
              title: row.lt,
              summary: `${row.employee.fullName} · ${formatDate(row.sd)} to ${formatDate(row.ed)} (${countOf(formatDays(row.ld), 'day')}).`,
              invalidate: [['leave']],
            });
            setDecision('REJECTED');
          }}
        />
      ),
    },
  ];

  const archiveColumns: Column<any>[] = [
    {
      key: 'name',
      header: 'Employee',
      render: (row) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={row.employee.fullName} initials={row.employee.initials} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{row.employee.fullName}</p>
            <p className="truncate text-2xs text-ink-muted">{row.employee.designation?.name ?? '—'}</p>
          </div>
        </div>
      ),
    },
    { key: 'type', header: 'Leave type', render: (row) => row.leaveType.label },
    { key: 'range', header: 'Dates', render: (row) => <span className="whitespace-nowrap text-xs">{formatDate(row.startDate, 'short')} – {formatDate(row.endDate, 'short')}</span> },
    { key: 'days', header: 'Days', align: 'right', render: (row) => formatDays(row.leaveDays) },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'decided',
      header: 'Decided by',
      hideBelow: 'md',
      render: (row) =>
        row.approver ? `${row.approver.firstName} ${row.approver.lastName}` : <span className="text-ink-muted">—</span>,
    },
    {
      key: 'note',
      header: 'Note',
      hideBelow: 'lg',
      render: (row) => <span className="line-clamp-2 max-w-xs text-xs">{row.decisionNote ?? '—'}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Leave approval inbox"
        description="Approving deducts the employee's balance and stamps their attendance days as leave, so payroll and the monthly grid stay consistent with your decision."
        breadcrumbs={[{ label: 'Leaves', href: '/leave' }, { label: 'Approval Inbox' }]}
      />

      <LinkTabs tabs={LEAVE_TABS} />

      <SegmentedTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'pending', label: 'Pending', count: pending.data?.meta.total },
          { value: 'archive', label: 'Archive' },
          { value: 'bradford', label: 'Bradford factor' },
        ]}
      />

      {tab === 'pending' ? (
        <>
          <p className="text-2xs text-ink-muted">
            SN · Name · SD (start date) · ED (end date) · LD (leave days) · LT (leave type) · AD (applied date)
          </p>
          <DataTable
            columns={columns}
            rows={pending.data?.data ?? []}
            keyOf={(row) => row.id}
            loading={pending.isLoading}
            emptyTitle="Nothing waiting on you"
            emptyDescription="Leave requests from your team will appear here for approval."
          />
        </>
      ) : tab === 'archive' ? (
        <DataTable
          columns={archiveColumns}
          rows={archive.data?.data ?? []}
          keyOf={(row) => row.id}
          loading={archive.isLoading}
          emptyTitle="No decided requests yet"
        />
      ) : (
        <BradfordPanel />
      )}

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

const BAND_TONE = {
  ok: 'good',
  watch: 'warning',
  concern: 'serious',
  critical: 'critical',
} as const;

function BradfordPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['leave', 'bradford', 'team'],
    queryFn: () =>
      api.get<{
        year: number;
        formula: string;
        employees: {
          employee: { id: number; employeeVisibleId: string; fullName: string; initials: string; designation: { name: string } | null };
          score: number; band: keyof typeof BAND_TONE; spellCount: number; totalDays: number;
          spells: { startDate: string; endDate: string; days: number; leaveType: string }[];
        }[];
      }>('/leave/bradford', { team: true }),
  });

  if (isLoading) return <div className="h-64 skeleton" />;
  if (!data || data.employees.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Activity}
          title="No team to score"
          description="The Bradford factor is computed across your direct and indirect reports."
        />
      </Card>
    );
  }

  const max = Math.max(...data.employees.map((row) => row.score), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bradford factor · {data.year}</CardTitle>
        <p className="mt-0.5 text-xs text-ink-muted">
          {data.formula}. Counts unplanned absence only — sick, casual and unpaid leave.
          Planned annual leave is excluded.
        </p>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {data.employees.map((row) => (
            <li key={row.employee.id}>
              <div className="flex items-center gap-2.5">
                <Avatar name={row.employee.fullName} initials={row.employee.initials} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <Link
                      href={`/profile/${row.employee.id}`}
                      className="truncate text-sm font-medium text-ink hover:text-brand"
                    >
                      {row.employee.fullName}
                    </Link>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="text-sm font-semibold text-ink tabular">{row.score}</span>
                      {/* Band label sits beside the number, so the colour is never the only cue. */}
                      <Badge tone={BAND_TONE[row.band]}>{row.band}</Badge>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        row.band === 'ok' ? 'bg-good'
                        : row.band === 'watch' ? 'bg-warning'
                        : row.band === 'concern' ? 'bg-serious'
                        : 'bg-critical',
                      )}
                      style={{ width: `${Math.max((row.score / max) * 100, row.score > 0 ? 2 : 0)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-2xs text-ink-muted">
                    {countOf(row.spellCount, 'spell')} · {countOf(formatDays(row.totalDays), 'day')} lost
                    {row.spells.length > 0
                      ? ` · latest ${formatDate(row.spells[row.spells.length - 1].startDate, 'short')}`
                      : ''}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

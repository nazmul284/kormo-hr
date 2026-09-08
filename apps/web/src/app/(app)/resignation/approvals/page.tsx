'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, LogOut } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { DetailList } from '@/components/shared/data-table';
import { DecisionButtons, DecisionDialog, type DecisionTarget } from '@/components/shared/decision-dialog';
import { PageHeader } from '@/components/shared/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { LinkTabs } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { cn, formatDate, formatMoney } from '@/lib/utils';
import { RESIGNATION_TABS } from '@/lib/tabs';

export default function ResignationApprovalsPage() {
  const [target, setTarget] = useState<DecisionTarget | null>(null);
  const [decision, setDecision] = useState<'APPROVED' | 'REJECTED' | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['resignation', 'approvals'],
    queryFn: () => api.get<any[]>('/resignation/approvals'),
  });

  return (
    <>
      <PageHeader
        title="Resignation approvals"
        description="The chain runs in order — line manager, then HR. Only the current link can act, and the final approval opens clearance across every department."
        breadcrumbs={[{ label: 'E-Resignation', href: '/resignation' }, { label: 'Approvals' }]}
      />

      <LinkTabs tabs={RESIGNATION_TABS} />

      {isLoading ? (
        <div className="h-64 skeleton rounded-card" />
      ) : (data?.length ?? 0) === 0 ? (
        <Card>
          <EmptyState
            icon={LogOut}
            tone="good"
            title="No resignations awaiting approval"
            description="Resignations from your reporting line will appear here."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {data!.map((row) => (
            <Card key={row.id}>
              <CardHeader
                action={
                  row.awaitingMyDecision ? (
                    <DecisionButtons
                      onApprove={() => {
                        setTarget({
                          id: row.id,
                          endpoint: `/resignation/${row.id}/decide`,
                          title: 'resignation',
                          summary: `${row.employee.fullName} · last working day ${formatDate(row.lastWorkingDay)}. Approving passes it to the next link, or opens clearance if you are the last.`,
                          invalidate: [['resignation']],
                        });
                        setDecision('APPROVED');
                      }}
                      onReject={() => {
                        setTarget({
                          id: row.id,
                          endpoint: `/resignation/${row.id}/decide`,
                          title: 'resignation',
                          summary: `${row.employee.fullName} · last working day ${formatDate(row.lastWorkingDay)}.`,
                          invalidate: [['resignation']],
                        });
                        setDecision('REJECTED');
                      }}
                    />
                  ) : (
                    <Badge tone="neutral">
                      with {row.currentApprover?.role?.replace(/_/g, ' ').toLowerCase() ?? 'someone else'}
                    </Badge>
                  )
                }
              >
                <div className="flex items-center gap-2.5">
                  <Avatar name={row.employee.fullName} initials={row.employee.initials} size="sm" />
                  <div className="min-w-0">
                    <Link
                      href={`/profile/${row.employee.id}`}
                      className="block truncate text-sm font-semibold text-ink hover:text-brand"
                    >
                      {row.employee.fullName}
                      <span className="ml-1 font-normal text-ink-muted">
                        (#{row.employee.employeeVisibleId})
                      </span>
                    </Link>
                    <p className="truncate text-2xs text-ink-muted">
                      {row.employee.designation?.name ?? '—'}
                      {row.employee.designation?.grade ? ` (${row.employee.designation.grade})` : ''}
                      {row.employee.department ? ` · ${row.employee.department.name}` : ''}
                      {` · ${row.employee.serviceLength}`}
                    </p>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={row.stage} />
                  <span className="text-2xs text-ink-muted">
                    Submitted {formatDate(row.submittedAt)}
                  </span>
                </div>

                <DetailList
                  columns={3}
                  items={[
                    { label: 'Last working day', value: formatDate(row.lastWorkingDay) },
                    { label: 'Notice required', value: `${row.noticePeriodRequiredDays} days` },
                    { label: 'Notice served', value: `${row.noticePeriodServedDays} days` },
                    {
                      label: 'To be recovered',
                      value:
                        row.noticePeriodRecoveryDays > 0 ? (
                          <span className="flex items-center gap-1.5 text-critical-ink">
                            <AlertTriangle className="size-3.5" aria-hidden />
                            {row.noticePeriodRecoveryDays} days · {formatMoney(row.recoveryAmount)}
                          </span>
                        ) : (
                          'none'
                        ),
                    },
                    { label: 'Date of separation', value: formatDate(row.dateOfSeparation) },
                    { label: 'Signed letter', value: row.letterPath ? 'attached' : 'missing' },
                    { label: 'Reason', value: row.reason, span: true },
                  ]}
                />

                <div>
                  <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-muted">
                    Approval chain
                  </p>
                  <ol className="space-y-1.5">
                    {row.approvals.map((approval: any) => (
                      <li key={approval.id} className="flex flex-wrap items-center gap-2 text-xs">
                        <span
                          className={cn(
                            'flex size-5 shrink-0 items-center justify-center rounded-full text-2xs font-bold',
                            approval.status === 'APPROVED'
                              ? 'bg-good-subtle text-good-ink'
                              : approval.status === 'REJECTED'
                                ? 'bg-critical-subtle text-critical-ink'
                                : 'bg-surface-sunken text-ink-muted',
                          )}
                        >
                          {approval.seq + 1}
                        </span>
                        <span className="font-medium text-ink">
                          {approval.role.replace(/_/g, ' ')}
                        </span>
                        {approval.approver ? (
                          <span className="text-ink-muted">
                            {approval.approver.firstName} {approval.approver.lastName}
                          </span>
                        ) : null}
                        <StatusBadge status={approval.status} />
                        {approval.decidedAt ? (
                          <span className="text-ink-muted">{formatDate(approval.decidedAt, 'short')}</span>
                        ) : null}
                        {approval.comment ? (
                          <span className="text-ink-secondary">— {approval.comment}</span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <DecisionDialog
        target={target}
        decision={decision}
        onClose={() => {
          setTarget(null);
          setDecision(null);
        }}
        noteFieldLabel="Comment"
      />
    </>
  );
}

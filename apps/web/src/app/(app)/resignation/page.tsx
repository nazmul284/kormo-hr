'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, CheckCircle2, FileSignature, Info, LogOut, Paperclip, Undo2,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { DetailList } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { CountedTextarea, Field, Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { LinkTabs } from '@/components/ui/tabs';
import { ApiError, api } from '@/lib/api';
import { cn, formatDate, formatMoney } from '@/lib/utils';
import { RESIGNATION_TABS } from '@/lib/tabs';

interface Context {
  employee: {
    id: number; employeeVisibleId: string; fullName: string; initials: string;
    officialEmail: string | null; officialContact: string | null;
    joiningDate: string; serviceLength: string; employmentStatus: string;
    designation: string | null; grade: string | null; department: string | null;
    lineManager: { id: number; fullName: string } | null;
  };
  noticePeriodToBeServed: number;
  hasActiveResignation: boolean;
  activeResignationId: number | null;
  preview: {
    noticePeriodRequiredDays: number;
    noticePeriodServedDays: number;
    noticePeriodRecoveryDays: number;
    dateOfSeparation: string;
    recoveryAmount: number;
    shortfall: boolean;
  } | null;
  advisory: string;
  requiresSignedLetter: boolean;
}

export default function ResignationPage() {
  const [lastWorkingDay, setLastWorkingDay] = useState('');
  const [reason, setReason] = useState('');
  const [letterPath, setLetterPath] = useState('');
  const queryClient = useQueryClient();

  const context = useQuery({
    queryKey: ['resignation', 'context', lastWorkingDay],
    queryFn: () =>
      api.get<Context>('/resignation/context', {
        lastWorkingDay: lastWorkingDay || undefined,
      }),
  });

  const mine = useQuery({
    queryKey: ['resignation', 'mine'],
    queryFn: () => api.get<any[]>('/resignation/mine'),
  });

  const submit = useMutation({
    mutationFn: () => api.post('/resignation', { lastWorkingDay, reason, letterPath }),
    onSuccess: () => {
      toast.success('Resignation submitted', {
        description: 'Your line manager has been notified.',
      });
      void queryClient.invalidateQueries({ queryKey: ['resignation'] });
      setReason('');
      setLetterPath('');
      setLastWorkingDay('');
    },
    onError: (error) => {
      toast.error('Could not submit', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  const withdraw = useMutation({
    mutationFn: (id: number) => api.patch(`/resignation/${id}/withdraw`),
    onSuccess: () => {
      toast.success('Resignation withdrawn');
      void queryClient.invalidateQueries({ queryKey: ['resignation'] });
    },
    onError: (error) => {
      toast.error('Could not withdraw', {
        description: error instanceof ApiError ? error.message : 'Please speak to HR.',
      });
    },
  });

  const data = context.data;
  const canSubmit =
    Boolean(lastWorkingDay) && reason.trim().length >= 10 && letterPath.trim().length > 0;

  return (
    <>
      <PageHeader
        title="E-resignation"
        description="Submitting starts a sequential approval chain — line manager, then HR — followed by department clearance."
        breadcrumbs={[{ label: 'Lifecycle' }, { label: 'E-Resignation' }]}
      />

      <LinkTabs tabs={RESIGNATION_TABS} />

      {context.isLoading || !data ? (
        <div className="h-64 skeleton rounded-card" />
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-card border border-warning/30 bg-warning-subtle px-4 py-3">
              <Info className="mt-0.5 size-4 shrink-0 text-serious" aria-hidden />
              <p className="text-xs leading-relaxed text-ink-secondary">{data.advisory}</p>
            </div>

            {data.hasActiveResignation ? (
              <Card>
                <EmptyState
                  icon={FileSignature}
                  tone="warning"
                  title="You already have a resignation in progress"
                  description="Track its approval and clearance state below. It can only be withdrawn before HR signs off."
                />
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Send e-resignation</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Field
                    label="Last working day"
                    htmlFor="lwd"
                    required
                    hint="Everything else is derived from this date."
                  >
                    <Input
                      id="lwd"
                      type="date"
                      min={new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}
                      value={lastWorkingDay}
                      onChange={(event) => setLastWorkingDay(event.target.value)}
                    />
                  </Field>

                  {/* The consequence is shown before submission, not after. */}
                  {data.preview ? (
                    <div
                      className={cn(
                        'rounded-lg border p-3',
                        data.preview.shortfall
                          ? 'border-critical/25 bg-critical-subtle'
                          : 'border-good/25 bg-good-subtle',
                      )}
                    >
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                        {data.preview.shortfall ? (
                          <AlertTriangle className="size-3.5 text-critical-ink" aria-hidden />
                        ) : (
                          <CheckCircle2 className="size-3.5 text-good-ink" aria-hidden />
                        )}
                        Notice period
                      </p>
                      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                        <div className="flex justify-between gap-2">
                          <dt className="text-ink-muted">To be served</dt>
                          <dd className="font-medium text-ink tabular">
                            {data.preview.noticePeriodRequiredDays} days
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-ink-muted">Will be served</dt>
                          <dd className="font-medium text-ink tabular">
                            {data.preview.noticePeriodServedDays} days
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-ink-muted">To be recovered</dt>
                          <dd
                            className={cn(
                              'font-medium tabular',
                              data.preview.noticePeriodRecoveryDays > 0 ? 'text-critical-ink' : 'text-ink',
                            )}
                          >
                            {data.preview.noticePeriodRecoveryDays} days
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-ink-muted">Date of separation</dt>
                          <dd className="font-medium text-ink">
                            {formatDate(data.preview.dateOfSeparation)}
                          </dd>
                        </div>
                      </dl>
                      {data.preview.shortfall ? (
                        <p className="mt-2 border-t border-critical/20 pt-2 text-xs text-critical-ink">
                          Roughly <strong>{formatMoney(data.preview.recoveryAmount)}</strong> would be
                          recovered from your final settlement for the un-served notice, charged at
                          the daily gross rate.
                        </p>
                      ) : (
                        <p className="mt-2 border-t border-good/20 pt-2 text-xs text-good-ink">
                          You would serve the full notice period, so nothing is recovered.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="rounded-lg bg-surface-sunken px-3 py-2.5 text-xs text-ink-muted">
                      Pick a last working day to see the notice-period arithmetic and any salary
                      recovery.
                    </p>
                  )}

                  <Field label="Reason" required hint="Maximum 255 characters.">
                    <CountedTextarea
                      maxLength={255}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder="Accepted an offer with a larger scope of responsibility."
                    />
                  </Field>

                  <Field
                    label="Signed resignation letter"
                    htmlFor="letter"
                    required
                    hint="Mandatory — the workflow cannot proceed without it."
                  >
                    <div className="relative">
                      <Paperclip className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-muted" aria-hidden />
                      <Input
                        id="letter"
                        className="pl-8"
                        value={letterPath}
                        onChange={(event) => setLetterPath(event.target.value)}
                        placeholder="signed-resignation-letter.pdf"
                      />
                    </div>
                  </Field>

                  <Button
                    className="w-full"
                    size="lg"
                    variant="danger"
                    onClick={() => submit.mutate()}
                    loading={submit.isPending}
                    disabled={!canSubmit}
                  >
                    <LogOut />
                    Submit resignation
                  </Button>
                </CardContent>
              </Card>
            )}

            <MyResignations
              rows={mine.data ?? []}
              loading={mine.isLoading}
              onWithdraw={(id) => withdraw.mutate(id)}
              withdrawing={withdraw.isPending}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Your record</CardTitle>
              <p className="mt-0.5 text-xs text-ink-muted">Read-only, as held by HR.</p>
            </CardHeader>
            <CardContent>
              <DetailList
                columns={1}
                items={[
                  { label: 'Employee ID', value: data.employee.employeeVisibleId },
                  { label: 'Name', value: data.employee.fullName },
                  {
                    label: 'Designation',
                    value: data.employee.grade
                      ? `${data.employee.designation} (${data.employee.grade})`
                      : data.employee.designation,
                  },
                  { label: 'Department', value: data.employee.department },
                  { label: 'Employment status', value: <StatusBadge status={data.employee.employmentStatus} /> },
                  { label: 'Joining date', value: formatDate(data.employee.joiningDate) },
                  { label: 'Service length', value: data.employee.serviceLength },
                  {
                    label: 'Notice period to be served',
                    value: (
                      <span className="font-semibold text-ink">
                        {data.noticePeriodToBeServed} days
                      </span>
                    ),
                  },
                  { label: 'Line manager', value: data.employee.lineManager?.fullName },
                  { label: 'Official email', value: data.employee.officialEmail },
                  { label: 'Mobile', value: data.employee.officialContact },
                ]}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

function MyResignations({
  rows,
  loading,
  onWithdraw,
  withdrawing,
}: {
  rows: any[];
  loading: boolean;
  onWithdraw: (id: number) => void;
  withdrawing: boolean;
}) {
  if (loading) return <div className="h-32 skeleton rounded-card" />;
  if (rows.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-ink">My resignations</h2>
      {rows.map((row) => (
        <Card key={row.id}>
          <CardHeader
            action={
              row.canWithdraw ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onWithdraw(row.id)}
                  loading={withdrawing}
                >
                  <Undo2 />
                  Withdraw
                </Button>
              ) : null
            }
          >
            <CardTitle>Submitted {formatDate(row.submittedAt)}</CardTitle>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <StatusBadge status={row.stage} />
              <span className="text-2xs text-ink-muted">
                Last working day {formatDate(row.lastWorkingDay)}
              </span>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <DetailList
              columns={3}
              items={[
                { label: 'Notice required', value: `${row.noticePeriodRequiredDays} days` },
                { label: 'Notice served', value: `${row.noticePeriodServedDays} days` },
                {
                  label: 'To be recovered',
                  value:
                    row.noticePeriodRecoveryDays > 0 ? (
                      <span className="text-critical-ink">
                        {row.noticePeriodRecoveryDays} days · {formatMoney(row.recoveryAmount)}
                      </span>
                    ) : (
                      'none'
                    ),
                },
                { label: 'Date of separation', value: formatDate(row.dateOfSeparation) },
                { label: 'Reason', value: row.reason, span: true },
              ]}
            />

            {row.approvals?.length > 0 ? (
              <div>
                <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-muted">
                  Approval chain
                </p>
                <ol className="space-y-1.5">
                  {row.approvals.map((approval: any) => (
                    <li key={approval.id} className="flex items-center gap-2 text-xs">
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
                      <span className="font-medium text-ink">{approval.role.replace(/_/g, ' ')}</span>
                      <span className="text-ink-muted">
                        {approval.approver
                          ? `${approval.approver.firstName} ${approval.approver.lastName}`
                          : ''}
                      </span>
                      <StatusBadge status={approval.status} />
                      {approval.comment ? (
                        <span className="truncate text-ink-secondary">— {approval.comment}</span>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            {row.clearances?.length > 0 ? (
              <div>
                <p className="mb-1.5 flex items-center justify-between text-2xs font-semibold uppercase tracking-wide text-ink-muted">
                  Clearance
                  <span className="tabular">
                    {row.clearanceProgress.cleared} / {row.clearanceProgress.total}
                  </span>
                </p>
                <ul className="space-y-1.5">
                  {row.clearances.map((item: any) => (
                    <li key={item.id} className="flex items-center gap-2 text-xs">
                      <StatusBadge status={item.status} />
                      <span className="min-w-0 flex-1 truncate text-ink-secondary">
                        {item.department.name}
                      </span>
                      {item.duesAmount ? (
                        <span className="shrink-0 text-critical-ink tabular">
                          {formatMoney(item.duesAmount)} dues
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {row.finalSettlementAmount !== null ? (
              <div className="flex items-center justify-between rounded-lg bg-surface-sunken px-3 py-2.5">
                <span className="text-xs text-ink-secondary">Final settlement adjustment</span>
                <span
                  className={cn(
                    'text-sm font-semibold tabular',
                    row.finalSettlementAmount < 0 ? 'text-critical-ink' : 'text-good-ink',
                  )}
                >
                  {formatMoney(row.finalSettlementAmount)}
                </span>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

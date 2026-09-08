'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ClipboardCheck, PauseCircle, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shared/page-header';
import { StatTile } from '@/components/shared/stat-tile';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { CountedTextarea, Field, Input, Select } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { LinkTabs, SegmentedTabs } from '@/components/ui/tabs';
import { ApiError, api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { cn, countOf, formatDate } from '@/lib/utils';
import { PMS_TABS } from '@/lib/tabs';

interface Review {
  id: number;
  dueDate: string;
  stage: string;
  decision: string;
  scorecard: { criterion: string; score: number }[] | null;
  overallScore: number | null;
  strengths: string | null;
  improvements: string | null;
  extendedToDate: string | null;
  completedAt: string | null;
  isOverdue: boolean;
  daysUntilDue: number;
  employee: {
    id: number; employeeVisibleId: string; fullName: string; initials: string;
    joiningDate: string; employmentStatus: string;
    designation: { name: string; grade: string | null } | null;
    department: { name: string } | null;
  };
  reviewer: { id: number; firstName: string; lastName: string } | null;
}

export default function JobConfirmationPage() {
  const { can } = useSession();
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [deciding, setDeciding] = useState<Review | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['performance', 'job-confirmation', scope],
    queryFn: () =>
      api.get<{
        reviews: Review[];
        counters: { reviewCompleted: number; reviewRemaining: number; overdue: number };
        criteria: string[];
      }>('/performance/job-confirmation', { scope }),
  });

  return (
    <>
      <PageHeader
        title="Job confirmation"
        description="The probation appraisal. Confirming flips the employee to permanent and stamps the confirmation date, which changes their leave and benefit eligibility."
        breadcrumbs={[{ label: 'Performance' }, { label: 'Job Confirmation' }]}
      />

      <LinkTabs tabs={PMS_TABS} />

      {can('employee.read.all') ? (
        <SegmentedTabs
          value={scope}
          onChange={setScope}
          options={[
            { value: 'mine', label: 'Assigned to me' },
            { value: 'all', label: 'Company-wide' },
          ]}
        />
      ) : null}

      {data ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile
            label="Review completed"
            value={data.counters.reviewCompleted}
            icon={CheckCircle2}
            tone="good"
          />
          <StatTile
            label="Review remaining"
            value={data.counters.reviewRemaining}
            icon={ClipboardCheck}
            tone="warning"
          />
          <StatTile
            label="Overdue"
            value={data.counters.overdue}
            icon={AlertTriangle}
            tone={data.counters.overdue > 0 ? 'critical' : 'neutral'}
          />
        </div>
      ) : null}

      {isLoading ? (
        <div className="h-64 skeleton rounded-card" />
      ) : (data?.reviews.length ?? 0) === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardCheck}
            tone="good"
            title="No confirmation reviews"
            description={
              scope === 'mine'
                ? 'Probation reviews routed to you will appear here two weeks before they fall due.'
                : 'Nobody in the company is currently on probation.'
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {data!.reviews.map((review) => (
            <Card key={review.id}>
              <CardHeader
                action={
                  review.decision === 'PENDING' ? (
                    <Button size="sm" onClick={() => setDeciding(review)}>
                      Record decision
                    </Button>
                  ) : (
                    <StatusBadge status={review.decision} />
                  )
                }
              >
                <div className="flex items-center gap-2.5">
                  <Avatar name={review.employee.fullName} initials={review.employee.initials} size="sm" />
                  <div className="min-w-0">
                    <Link
                      href={`/profile/${review.employee.id}`}
                      className="block truncate text-sm font-semibold text-ink hover:text-brand"
                    >
                      {review.employee.fullName}
                    </Link>
                    <p className="truncate text-2xs text-ink-muted">
                      {review.employee.designation?.name ?? '—'} · joined{' '}
                      {formatDate(review.employee.joiningDate, 'short')}
                    </p>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge tone={review.isOverdue ? 'critical' : review.daysUntilDue <= 7 ? 'warning' : 'neutral'}>
                    {review.isOverdue
                      ? `${countOf(Math.abs(review.daysUntilDue), 'day')} overdue`
                      : `due in ${countOf(review.daysUntilDue, 'day')}`}
                  </Badge>
                  <span className="text-ink-muted">Due {formatDate(review.dueDate)}</span>
                  <StatusBadge status={review.employee.employmentStatus} />
                </div>

                {review.overallScore !== null ? (
                  <div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-2xs font-medium uppercase tracking-wide text-ink-muted">
                        Overall score
                      </span>
                      <span className="text-sm font-semibold text-ink tabular">
                        {review.overallScore.toFixed(2)} / 5
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          review.overallScore >= 4 ? 'bg-good' : review.overallScore >= 3.2 ? 'bg-warning' : 'bg-critical',
                        )}
                        style={{ width: `${(review.overallScore / 5) * 100}%` }}
                      />
                    </div>
                  </div>
                ) : null}

                {review.scorecard ? (
                  <ul className="space-y-1">
                    {review.scorecard.map((entry) => (
                      <li key={entry.criterion} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate text-ink-secondary">{entry.criterion}</span>
                        <span className="flex shrink-0 gap-0.5" aria-label={`${entry.score} out of 5`}>
                          {[1, 2, 3, 4, 5].map((step) => (
                            <span
                              key={step}
                              aria-hidden
                              className={cn(
                                'size-1.5 rounded-full',
                                step <= entry.score ? 'bg-series-1' : 'bg-line',
                              )}
                            />
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {review.strengths ? (
                  <p className="text-xs">
                    <span className="font-medium text-good-ink">Strengths: </span>
                    <span className="text-ink-secondary">{review.strengths}</span>
                  </p>
                ) : null}
                {review.improvements ? (
                  <p className="text-xs">
                    <span className="font-medium text-serious">To improve: </span>
                    <span className="text-ink-secondary">{review.improvements}</span>
                  </p>
                ) : null}
                {review.extendedToDate ? (
                  <p className="flex items-center gap-1.5 text-xs text-serious">
                    <PauseCircle className="size-3.5" aria-hidden />
                    Probation extended to {formatDate(review.extendedToDate)}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <DecisionForm
        review={deciding}
        criteria={data?.criteria ?? []}
        onClose={() => setDeciding(null)}
      />
    </>
  );
}

function DecisionForm({
  review,
  criteria,
  onClose,
}: {
  review: Review | null;
  criteria: string[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [decision, setDecision] = useState<'CONFIRMED' | 'EXTENDED' | 'TERMINATED'>('CONFIRMED');
  const [scores, setScores] = useState<Record<string, number>>({});
  const [strengths, setStrengths] = useState('');
  const [improvements, setImprovements] = useState('');
  const [extendedToDate, setExtendedToDate] = useState('');

  const submit = useMutation({
    mutationFn: () =>
      api.patch(`/performance/job-confirmation/${review!.id}`, {
        decision,
        scorecard: criteria.map((criterion) => ({
          criterion,
          score: scores[criterion] ?? 3,
        })),
        strengths: strengths || undefined,
        improvements: improvements || undefined,
        extendedToDate: decision === 'EXTENDED' ? extendedToDate : undefined,
      }),
    onSuccess: () => {
      toast.success('Decision recorded', {
        description:
          decision === 'CONFIRMED'
            ? 'The employee is now permanent.'
            : decision === 'EXTENDED'
              ? 'Probation has been extended.'
              : 'The employment record has been closed.',
      });
      void queryClient.invalidateQueries({ queryKey: ['performance'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
    onError: (error) => {
      toast.error('Could not record the decision', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  const average =
    criteria.length > 0
      ? criteria.reduce((sum, criterion) => sum + (scores[criterion] ?? 3), 0) / criteria.length
      : 0;

  return (
    <Dialog open={review !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Confirmation decision</DialogTitle>
          <DialogDescription>
            {review ? `${review.employee.fullName} · due ${formatDate(review.dueDate)}` : ''}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-medium text-ink-secondary">Scorecard</p>
            <ul className="space-y-2">
              {criteria.map((criterion) => (
                <li key={criterion} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-secondary">{criterion}</span>
                  <div className="flex shrink-0 gap-1">
                    {[1, 2, 3, 4, 5].map((score) => (
                      <button
                        key={score}
                        type="button"
                        onClick={() => setScores((current) => ({ ...current, [criterion]: score }))}
                        aria-label={`${criterion}: ${score}`}
                        className={cn(
                          'size-7 rounded-md text-xs font-medium transition-colors',
                          (scores[criterion] ?? 3) === score
                            ? 'bg-brand text-white'
                            : 'bg-surface-sunken text-ink-secondary hover:bg-line',
                        )}
                      >
                        {score}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-right text-xs text-ink-muted">
              Average <span className="font-semibold text-ink tabular">{average.toFixed(2)}</span> / 5
            </p>
          </div>

          <Field label="Decision" required>
            <Select
              value={decision}
              onChange={(event) => setDecision(event.target.value as typeof decision)}
            >
              <option value="CONFIRMED">Confirm — make permanent</option>
              <option value="EXTENDED">Extend probation</option>
              <option value="TERMINATED">Do not confirm</option>
            </Select>
          </Field>

          {decision === 'EXTENDED' ? (
            <Field label="Extend probation to" required>
              <Input
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                value={extendedToDate}
                onChange={(event) => setExtendedToDate(event.target.value)}
              />
            </Field>
          ) : null}

          <Field label="Strengths">
            <CountedTextarea
              maxLength={1000}
              value={strengths}
              onChange={(event) => setStrengths(event.target.value)}
              placeholder="Picks up new domains quickly and asks good questions."
            />
          </Field>

          <Field label="Areas to improve">
            <CountedTextarea
              maxLength={1000}
              value={improvements}
              onChange={(event) => setImprovements(event.target.value)}
              placeholder="Needs to communicate blockers earlier."
            />
          </Field>

          {decision === 'TERMINATED' ? (
            <p className="flex items-start gap-2 rounded-lg border border-critical/25 bg-critical-subtle px-3 py-2.5 text-xs text-critical-ink">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              This deactivates the employee's account and marks them separated. Make sure HR has
              completed the required process first.
            </p>
          ) : null}
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant={decision === 'TERMINATED' ? 'danger' : 'primary'}
            onClick={() => submit.mutate()}
            loading={submit.isPending}
            disabled={decision === 'EXTENDED' && !extendedToDate}
          >
            {decision === 'CONFIRMED' ? <CheckCircle2 /> : decision === 'EXTENDED' ? <PauseCircle /> : <XCircle />}
            Record decision
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

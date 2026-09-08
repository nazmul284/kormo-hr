'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquarePlus, Users } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shared/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { CountedTextarea, Field, Select } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { LinkTabs } from '@/components/ui/tabs';
import { ApiError, api } from '@/lib/api';
import { cn, countOf, formatDate } from '@/lib/utils';
import { PMS_TABS } from '@/lib/tabs';

export default function TeamGoalsPage() {
  const [reviewing, setReviewing] = useState<{ goalId: number; title: string; employee: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['performance', 'goals', 'team'],
    queryFn: () =>
      api.get<{
        message?: string;
        cycle?: { id: number; name: string; endDate: string; isFeedbackWindowOpen?: boolean };
        employees: {
          employee: {
            id: number; employeeVisibleId: string; fullName: string; initials: string;
            designation: { name: string } | null; department: { name: string } | null;
          };
          goals: {
            id: number; title: string; weight: number; progressPct: number; status: string;
            metric: string | null; target: string | null;
            reviews: { stage: string; rating: number | null; submittedAt: string | null }[];
          }[];
          goalCount: number;
          totalWeight: number;
          weightedProgress: number;
          awaitingMyReview: number;
        }[];
      }>('/performance/goals/team'),
  });

  if (isLoading) {
    return (
      <>
        <PageHeader title="My team goals" breadcrumbs={[{ label: 'Performance' }, { label: 'My Team Goals' }]} />
        <LinkTabs tabs={PMS_TABS} />
        <div className="h-64 skeleton rounded-card" />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="My team goals"
        description="Your reports' goals for the current cycle, with weighted progress and what is waiting on your review."
        breadcrumbs={[{ label: 'Performance' }, { label: 'My Team Goals' }]}
      />

      <LinkTabs tabs={PMS_TABS} />

      {(data?.employees.length ?? 0) === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title={data?.message ?? 'No team goals to show'}
            description="Once your reports are enrolled in a goal cycle, their goals appear here."
          />
        </Card>
      ) : (
        <>
          {data?.cycle ? (
            <div className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-surface px-4 py-2.5">
              <span className="text-sm font-medium text-ink">{data.cycle.name}</span>
              <span className="text-xs text-ink-muted">ends {formatDate(data.cycle.endDate)}</span>
              <span className="ml-auto text-xs text-ink-secondary">
                {countOf(data.employees.reduce((sum, row) => sum + row.awaitingMyReview, 0), 'goal')} awaiting your review
              </span>
            </div>
          ) : null}

          <div className="space-y-3">
            {data!.employees.map((row) => (
              <Card key={row.employee.id}>
                <CardHeader
                  action={
                    row.awaitingMyReview > 0 ? (
                      <Badge tone="warning">{row.awaitingMyReview} to review</Badge>
                    ) : null
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
                      </Link>
                      <p className="truncate text-2xs text-ink-muted">
                        {row.employee.designation?.name ?? '—'} ·{' '}
                        {countOf(row.goalCount, 'goal')} · {row.totalWeight}% weight ·{' '}
                        {row.weightedProgress}% weighted progress
                      </p>
                    </div>
                  </div>
                </CardHeader>

                {row.goals.length === 0 ? (
                  <EmptyState title="No goals set yet" description="Nudge them during the goal-setting window." />
                ) : (
                  <ul className="divide-y divide-line">
                    {row.goals.map((goal) => {
                      const selfDone = goal.reviews.some(
                        (review) => review.stage === 'SELF_ASSESSMENT' && review.submittedAt,
                      );
                      const managerDone = goal.reviews.some(
                        (review) => review.stage === 'MANAGER_REVIEW' && review.submittedAt,
                      );
                      return (
                        <li key={goal.id} className="px-4 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-ink">{goal.title}</p>
                              <p className="mt-0.5 text-2xs text-ink-muted">
                                {goal.weight}% weight
                                {goal.metric ? ` · ${goal.metric}` : ''}
                                {goal.target ? ` → ${goal.target}` : ''}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <StatusBadge status={goal.status} />
                              {selfDone ? <Badge tone="info">self-assessed</Badge> : null}
                              {managerDone ? <Badge tone="good">reviewed</Badge> : null}
                            </div>
                          </div>

                          <div className="mt-2 flex items-center gap-3">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                              <div
                                className={cn(
                                  'h-full rounded-full',
                                  goal.progressPct >= 100 ? 'bg-good' : goal.progressPct >= 50 ? 'bg-series-1' : 'bg-series-4',
                                )}
                                style={{ width: `${Math.max(goal.progressPct, 2)}%` }}
                              />
                            </div>
                            <span className="w-10 shrink-0 text-right text-xs font-medium text-ink tabular">
                              {goal.progressPct}%
                            </span>
                            {!managerDone ? (
                              <Button
                                variant="subtle"
                                size="sm"
                                onClick={() =>
                                  setReviewing({
                                    goalId: goal.id,
                                    title: goal.title,
                                    employee: row.employee.fullName,
                                  })
                                }
                              >
                                <MessageSquarePlus />
                                Review
                              </Button>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            ))}
          </div>
        </>
      )}

      <ManagerReviewDialog target={reviewing} onClose={() => setReviewing(null)} />
    </>
  );
}

function ManagerReviewDialog({
  target,
  onClose,
}: {
  target: { goalId: number; title: string; employee: string } | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(4);
  const [comment, setComment] = useState('');

  const submit = useMutation({
    mutationFn: () =>
      api.post(`/performance/goals/${target!.goalId}/reviews`, {
        stage: 'MANAGER_REVIEW',
        rating,
        comment,
      }),
    onSuccess: () => {
      toast.success('Review submitted', { description: 'The goal is now closed out.' });
      void queryClient.invalidateQueries({ queryKey: ['performance'] });
      setComment('');
      onClose();
    },
    onError: (error) => {
      toast.error('Could not submit the review', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Manager review</DialogTitle>
          <DialogDescription>
            {target ? `${target.employee} · ${target.title}` : ''}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <Field label="Rating" required>
            <Select value={rating} onChange={(event) => setRating(Number(event.target.value))}>
              {[5, 4, 3, 2, 1].map((value) => (
                <option key={value} value={value}>
                  {value} — {['', 'Did not meet', 'Partially met', 'Met', 'Exceeded', 'Far exceeded'][value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Comment" required hint="The employee sees this on their goal.">
            <CountedTextarea
              maxLength={1000}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Good outcome. Would like to see earlier escalation of blockers next cycle."
            />
          </Field>
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => submit.mutate()}
            loading={submit.isPending}
            disabled={comment.trim().length < 10}
          >
            Submit review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Goal, Plus, Target, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shared/page-header';
import { StatTile } from '@/components/shared/stat-tile';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { CountedTextarea, Field, Input, Select } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { LinkTabs } from '@/components/ui/tabs';
import { ApiError, api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { cn, formatDate } from '@/lib/utils';
import { PMS_TABS } from '@/lib/tabs';

interface Cycle {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  feedbackStartDate: string;
  feedbackEndDate: string;
  weightMustTotal: number;
  isActive: boolean;
  isGoalWindowOpen: boolean;
  isFeedbackWindowOpen: boolean;
  phase: string;
}

interface GoalRow {
  id: number;
  title: string;
  description: string | null;
  metric: string | null;
  target: string | null;
  weight: number;
  progressPct: number;
  status: string;
  dueDate: string | null;
  cycle: { id: number; name: string; endDate: string };
  parent: { id: number; title: string; employee: { firstName: string; lastName: string } } | null;
  reviews: {
    id: number; stage: string; rating: number | null; comment: string | null;
    submittedAt: string | null;
    reviewer: { id: number; firstName: string; lastName: string };
  }[];
}

const PHASE_LABEL: Record<string, string> = {
  upcoming: 'Not started',
  'goal-setting': 'Goal setting open',
  'in-progress': 'In progress',
  review: 'Review window open',
  closed: 'Closed',
};

export default function MyGoalsPage() {
  const [cycleId, setCycleId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['performance', 'goals', 'mine', cycleId],
    queryFn: () =>
      api.get<{
        enrolled: boolean;
        message?: string;
        cycles: Cycle[];
        selectedCycleId?: number;
        goals: GoalRow[];
        summary?: {
          count: number; totalWeight: number; weightBalanced: boolean;
          weightedProgress: number; completed: number;
        };
      }>('/performance/goals/mine', { goalCycleId: cycleId ?? undefined }),
  });

  if (isLoading) {
    return (
      <>
        <PageHeader title="My goals" breadcrumbs={[{ label: 'Performance' }, { label: 'My Goals' }]} />
        <LinkTabs tabs={PMS_TABS} />
        <div className="h-64 skeleton rounded-card" />
      </>
    );
  }

  const activeCycle = data?.cycles.find((cycle) => cycle.id === (cycleId ?? data.selectedCycleId));

  return (
    <>
      <PageHeader
        title="My goals"
        description="Goals live inside a cycle. Weights across a cycle must total 100%, and the review window is when scoring happens."
        breadcrumbs={[{ label: 'Performance' }, { label: 'My Goals' }]}
        actions={
          data?.enrolled && activeCycle?.isGoalWindowOpen ? (
            <Button onClick={() => setCreating(true)}>
              <Plus />
              Add goal
            </Button>
          ) : null
        }
      />

      <LinkTabs tabs={PMS_TABS} />

      {!data?.enrolled ? (
        <Card>
          <EmptyState
            icon={Goal}
            title="You are not in a goal cycle yet"
            description={
              data?.message ??
              'Goals can only be created once HR adds you to the current cycle. Speak to HR if you expected to be enrolled.'
            }
          />
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3 rounded-card border border-line bg-surface p-3">
            <Field label="Goal cycle">
              <Select
                value={cycleId ?? data.selectedCycleId ?? ''}
                onChange={(event) => setCycleId(Number(event.target.value))}
              >
                {data.cycles.map((cycle) => (
                  <option key={cycle.id} value={cycle.id}>{cycle.name}</option>
                ))}
              </Select>
            </Field>
            {activeCycle ? (
              <div className="flex flex-wrap items-center gap-2 pb-2">
                <Badge tone={activeCycle.isGoalWindowOpen ? 'good' : activeCycle.isFeedbackWindowOpen ? 'warning' : 'neutral'}>
                  {PHASE_LABEL[activeCycle.phase] ?? activeCycle.phase}
                </Badge>
                <span className="text-2xs text-ink-muted">
                  Goals {formatDate(activeCycle.startDate, 'short')} – {formatDate(activeCycle.endDate, 'short')} ·
                  Review {formatDate(activeCycle.feedbackStartDate, 'short')} – {formatDate(activeCycle.feedbackEndDate, 'short')}
                </span>
              </div>
            ) : null}
          </div>

          {data.summary ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile label="Goals" value={data.summary.count} icon={Target} />
              <StatTile
                label="Weight allocated"
                value={`${data.summary.totalWeight}%`}
                hint={data.summary.weightBalanced ? 'balanced' : `must total ${activeCycle?.weightMustTotal ?? 100}%`}
                tone={data.summary.weightBalanced ? 'good' : 'warning'}
              />
              <StatTile
                label="Weighted progress"
                value={`${data.summary.weightedProgress}%`}
                icon={TrendingUp}
                tone="brand"
              />
              <StatTile label="Completed" value={data.summary.completed} tone="good" />
            </div>
          ) : null}

          {data.goals.length === 0 ? (
            <Card>
              <EmptyState
                icon={Target}
                title="No goals in this cycle yet"
                description={
                  activeCycle?.isGoalWindowOpen
                    ? 'Add your first goal — weights across the cycle must total 100%.'
                    : 'The goal-setting window for this cycle has closed.'
                }
                action={
                  activeCycle?.isGoalWindowOpen ? (
                    <Button onClick={() => setCreating(true)}>
                      <Plus />
                      Add goal
                    </Button>
                  ) : null
                }
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {data.goals.map((goal) => (
                <GoalCard key={goal.id} goal={goal} cycle={activeCycle} />
              ))}
            </div>
          )}
        </>
      )}

      {activeCycle ? (
        <CreateGoalDialog
          open={creating}
          cycle={activeCycle}
          usedWeight={data?.summary?.totalWeight ?? 0}
          onClose={() => setCreating(false)}
        />
      ) : null}
    </>
  );
}

function GoalCard({ goal, cycle }: { goal: GoalRow; cycle?: Cycle }) {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState(goal.progressPct);
  const [dirty, setDirty] = useState(false);

  const update = useMutation({
    mutationFn: () => api.patch(`/performance/goals/${goal.id}`, { progressPct: progress }),
    onSuccess: () => {
      toast.success('Progress updated');
      void queryClient.invalidateQueries({ queryKey: ['performance'] });
      setDirty(false);
    },
    onError: (error) => {
      toast.error('Could not update', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  const selfReview = goal.reviews.find((review) => review.stage === 'SELF_ASSESSMENT');
  const managerReview = goal.reviews.find((review) => review.stage === 'MANAGER_REVIEW');
  const editable = goal.status !== 'COMPLETED' && (cycle?.isGoalWindowOpen ?? false);

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">{goal.title}</p>
            {goal.description ? (
              <p className="mt-0.5 text-xs text-ink-secondary">{goal.description}</p>
            ) : null}
            {goal.parent ? (
              <p className="mt-1 text-2xs text-ink-muted">
                Cascades from {goal.parent.employee.firstName} {goal.parent.employee.lastName}: “{goal.parent.title}”
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Badge tone="neutral">{goal.weight}% weight</Badge>
            <StatusBadge status={goal.status} />
          </div>
        </div>

        {goal.metric || goal.target ? (
          <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-lg bg-surface-sunken px-3 py-2 text-xs">
            {goal.metric ? (
              <span>
                <span className="text-ink-muted">Metric: </span>
                <span className="font-medium text-ink">{goal.metric}</span>
              </span>
            ) : null}
            {goal.target ? (
              <span>
                <span className="text-ink-muted">Target: </span>
                <span className="font-medium text-ink">{goal.target}</span>
              </span>
            ) : null}
            {goal.dueDate ? (
              <span>
                <span className="text-ink-muted">Due: </span>
                <span className="font-medium text-ink">{formatDate(goal.dueDate, 'short')}</span>
              </span>
            ) : null}
          </div>
        ) : null}

        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xs font-medium uppercase tracking-wide text-ink-muted">Progress</span>
            <span className="text-sm font-semibold text-ink tabular">{progress}%</span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-300',
                progress >= 100 ? 'bg-good' : progress >= 50 ? 'bg-series-1' : 'bg-series-4',
              )}
              style={{ width: `${Math.max(progress, 2)}%` }}
            />
          </div>

          {editable ? (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={progress}
                onChange={(event) => {
                  setProgress(Number(event.target.value));
                  setDirty(true);
                }}
                className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-line
                           accent-brand [&::-webkit-slider-thumb]:size-3.5
                           [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
                           [&::-webkit-slider-thumb]:bg-brand"
                aria-label="Progress"
              />
              {dirty ? (
                <Button size="sm" onClick={() => update.mutate()} loading={update.isPending}>
                  Save
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        {goal.reviews.length > 0 ? (
          <div className="space-y-2 border-t border-line pt-3">
            {[selfReview, managerReview].filter(Boolean).map((review) => (
              <div key={review!.id} className="text-xs">
                <p className="flex items-center gap-1.5 font-medium text-ink">
                  {review!.stage === 'SELF_ASSESSMENT' ? 'Self-assessment' : 'Manager review'}
                  {review!.rating ? <Badge tone="brand">{review!.rating}/5</Badge> : null}
                  <span className="font-normal text-ink-muted">
                    · {review!.reviewer.firstName} {review!.reviewer.lastName}
                  </span>
                </p>
                {review!.comment ? (
                  <p className="mt-0.5 text-ink-secondary">{review!.comment}</p>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {cycle?.isFeedbackWindowOpen && !selfReview ? (
          <SelfAssessment goalId={goal.id} />
        ) : null}
      </CardContent>
    </Card>
  );
}

function SelfAssessment({ goalId }: { goalId: number }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(4);
  const [comment, setComment] = useState('');

  const submit = useMutation({
    mutationFn: () =>
      api.post(`/performance/goals/${goalId}/reviews`, {
        stage: 'SELF_ASSESSMENT',
        rating,
        comment,
      }),
    onSuccess: () => {
      toast.success('Self-assessment submitted');
      void queryClient.invalidateQueries({ queryKey: ['performance'] });
      setOpen(false);
    },
    onError: (error) => {
      toast.error('Could not submit', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  return (
    <>
      <Button variant="subtle" size="sm" onClick={() => setOpen(true)}>
        Submit self-assessment
      </Button>

      <Dialog open={open} onOpenChange={(next) => !next && setOpen(false)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Self-assessment</DialogTitle>
            <DialogDescription>
              Your manager sees this alongside their own review.
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
            <Field label="Comment" required>
              <CountedTextarea
                maxLength={1000}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Delivered the target ahead of schedule despite the dependency slip."
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => submit.mutate()}
              loading={submit.isPending}
              disabled={comment.trim().length < 10}
            >
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CreateGoalDialog({
  open,
  cycle,
  usedWeight,
  onClose,
}: {
  open: boolean;
  cycle: Cycle;
  usedWeight: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const remaining = Math.max(0, cycle.weightMustTotal - usedWeight);

  const [title, setTitle] = useState('');
  const [metric, setMetric] = useState('');
  const [target, setTarget] = useState('');
  const [weight, setWeight] = useState(Math.min(25, remaining || 25));

  const submit = useMutation({
    mutationFn: () =>
      api.post('/performance/goals', {
        goalCycleId: cycle.id,
        title,
        metric: metric || undefined,
        target: target || undefined,
        weight,
      }),
    onSuccess: () => {
      toast.success('Goal created');
      void queryClient.invalidateQueries({ queryKey: ['performance'] });
      setTitle('');
      setMetric('');
      setTarget('');
      onClose();
    },
    onError: (error) => {
      toast.error('Could not create the goal', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Add a goal</DialogTitle>
          <DialogDescription>
            {cycle.name} · {remaining}% of the weight is still unallocated.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <Field label="Goal" required>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Cut p95 API latency on the order path"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Metric" hint="How it is measured">
              <Input value={metric} onChange={(event) => setMetric(event.target.value)} placeholder="p95 latency" />
            </Field>
            <Field label="Target">
              <Input value={target} onChange={(event) => setTarget(event.target.value)} placeholder="< 400 ms" />
            </Field>
          </div>
          <Field
            label="Weight"
            required
            hint={`Weights across the cycle must total ${cycle.weightMustTotal}%.`}
            error={weight > remaining ? `Only ${remaining}% is left to allocate.` : undefined}
          >
            <Input
              type="number"
              min={1}
              max={100}
              value={weight}
              onChange={(event) => setWeight(Number(event.target.value))}
            />
          </Field>
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => submit.mutate()}
            loading={submit.isPending}
            disabled={title.trim().length < 5 || weight < 1 || weight > remaining}
          >
            <Target />
            Create goal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

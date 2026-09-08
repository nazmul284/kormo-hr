'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, CheckCircle2, ClipboardList, Clock, Laptop, ShieldCheck, UserPlus, Users,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

import { ProportionBar } from '@/components/charts/bars';
import { PageHeader } from '@/components/shared/page-header';
import { StatTile } from '@/components/shared/stat-tile';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { SegmentedTabs } from '@/components/ui/tabs';
import { ApiError, api } from '@/lib/api';
import { cn, countOf, formatDate } from '@/lib/utils';

const LANE_ICON = {
  EMPLOYEE: UserPlus,
  HR: Users,
  IT: Laptop,
  MANAGER: ShieldCheck,
} as const;

const LANE_COLOR = {
  EMPLOYEE: 'rgb(var(--series-1))',
  HR: 'rgb(var(--series-2))',
  IT: 'rgb(var(--series-3))',
  MANAGER: 'rgb(var(--series-5))',
} as const;

interface Lane {
  lane: keyof typeof LANE_ICON;
  label: string;
  total: number;
  done: number;
  pending: number;
  blocked: number;
  overdue: number;
  isComplete: boolean;
}

interface JoinerCard {
  employee: {
    id: number; employeeVisibleId: string; fullName: string; initials: string;
    avatarUrl: string | null; officialEmail: string | null;
    designation: string | null; department: string | null;
    joiningDate: string; employmentStatus: string;
    lineManager: { id: number; fullName: string } | null;
  };
  lanes: Lane[];
  progressPct: number;
  taskCount: number;
  doneCount: number;
  overdueCount: number;
  blockedCount: number;
  daysSinceJoining: number;
  isComplete: boolean;
  myOpenTasks: number;
}

export default function OnboardingPage() {
  const [tab, setTab] = useState<'joiners' | 'mine'>('joiners');
  const [detailId, setDetailId] = useState<number | null>(null);

  const joiners = useQuery({
    queryKey: ['onboarding', 'pending-employees'],
    queryFn: () =>
      api.get<{
        cards: JoinerCard[];
        summary: {
          totalJoiners: number; inProgress: number; completed: number;
          overdue: number; blocked: number; assignedToMe: number;
        };
      }>('/onboarding/pending-employees'),
    enabled: tab === 'joiners',
  });

  const myTasks = useQuery({
    queryKey: ['onboarding', 'tasks', 'mine'],
    queryFn: () =>
      api.get<{
        id: number; lane: keyof typeof LANE_ICON; title: string; description: string | null;
        dueDate: string | null; status: string; isOverdue: boolean; note: string | null;
        employee: { id: number; employeeVisibleId: string; fullName: string; initials: string; joiningDate: string; designation: { name: string } | null };
      }[]>('/onboarding/tasks/mine'),
    enabled: tab === 'mine',
  });

  return (
    <>
      <PageHeader
        title="Onboarding"
        description="Every new joiner runs four parallel checklists — Employee, HR, IT and Manager. A lane that is still pending after day one is the signal to chase."
        breadcrumbs={[{ label: 'Lifecycle' }, { label: 'Onboarding' }]}
      />

      <SegmentedTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'joiners', label: 'Pending joiners', count: joiners.data?.summary.inProgress },
          { value: 'mine', label: 'My tasks', count: myTasks.data?.length },
        ]}
      />

      {tab === 'joiners' ? (
        <>
          {joiners.data ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile label="Joiners tracked" value={joiners.data.summary.totalJoiners} icon={UserPlus} />
              <StatTile label="In progress" value={joiners.data.summary.inProgress} icon={Clock} tone="brand" />
              <StatTile
                label="Overdue tasks"
                value={joiners.data.summary.overdue}
                icon={AlertTriangle}
                tone={joiners.data.summary.overdue > 0 ? 'critical' : 'neutral'}
              />
              <StatTile
                label="Assigned to me"
                value={joiners.data.summary.assignedToMe}
                icon={ClipboardList}
                tone={joiners.data.summary.assignedToMe > 0 ? 'warning' : 'neutral'}
              />
            </div>
          ) : null}

          {joiners.isLoading ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {[0, 1, 2, 3].map((index) => (
                <div key={index} className="h-56 skeleton rounded-card" />
              ))}
            </div>
          ) : (joiners.data?.cards.length ?? 0) === 0 ? (
            <Card>
              <EmptyState
                icon={UserPlus}
                tone="good"
                title="No onboarding in flight"
                description="A checklist is provisioned automatically when HR adds a new joiner."
              />
            </Card>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {joiners.data!.cards.map((card) => (
                <Card key={card.employee.id}>
                  <CardHeader
                    action={
                      <Button variant="ghost" size="sm" onClick={() => setDetailId(card.employee.id)}>
                        Checklist
                      </Button>
                    }
                  >
                    <div className="flex items-center gap-2.5">
                      <Avatar
                        name={card.employee.fullName}
                        initials={card.employee.initials}
                        src={card.employee.avatarUrl}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <Link
                          href={`/profile/${card.employee.id}`}
                          className="block truncate text-sm font-semibold text-ink hover:text-brand"
                        >
                          {card.employee.fullName}
                          <span className="ml-1 font-normal text-ink-muted">
                            ({card.employee.employeeVisibleId})
                          </span>
                        </Link>
                        <p className="truncate text-2xs text-ink-muted">
                          {card.employee.designation ?? '—'}
                          {card.employee.department ? ` · ${card.employee.department}` : ''}
                        </p>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-ink-secondary">
                        Joining {formatDate(card.employee.joiningDate)}
                      </span>
                      <Badge tone={card.daysSinceJoining < 0 ? 'info' : 'neutral'}>
                        {card.daysSinceJoining < 0
                          ? `starts in ${countOf(Math.abs(card.daysSinceJoining), 'day')}`
                          : `day ${card.daysSinceJoining + 1}`}
                      </Badge>
                      <StatusBadge status={card.employee.employmentStatus} />
                      {card.overdueCount > 0 ? (
                        <Badge tone="critical">
                          <AlertTriangle aria-hidden />
                          {card.overdueCount} overdue
                        </Badge>
                      ) : null}
                      {card.blockedCount > 0 ? (
                        <Badge tone="warning">{card.blockedCount} blocked</Badge>
                      ) : null}
                    </div>

                    <div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-2xs font-medium uppercase tracking-wide text-ink-muted">
                          Overall
                        </span>
                        <span className="text-sm font-semibold text-ink tabular">
                          {card.doneCount} / {card.taskCount} done
                        </span>
                      </div>
                      <ProportionBar
                        className="mt-1"
                        total={card.taskCount}
                        segments={[
                          {
                            key: 'done',
                            label: 'Done',
                            value: card.doneCount,
                            color: 'rgb(var(--good))',
                          },
                        ]}
                      />
                    </div>

                    {/* The four-lane checklist — the point of this card. */}
                    <ul className="grid grid-cols-2 gap-1.5">
                      {card.lanes.map((lane) => {
                        const Icon = LANE_ICON[lane.lane];
                        return (
                          <li
                            key={lane.lane}
                            className={cn(
                              'rounded-lg border px-2.5 py-2',
                              lane.isComplete
                                ? 'border-good/25 bg-good-subtle'
                                : lane.overdue > 0
                                  ? 'border-critical/25 bg-critical-subtle'
                                  : 'border-line',
                            )}
                          >
                            <p className="flex items-center gap-1.5 text-2xs font-medium text-ink">
                              <Icon
                                className="size-3 shrink-0"
                                style={{ color: LANE_COLOR[lane.lane] }}
                                aria-hidden
                              />
                              {lane.label} task
                              {lane.isComplete ? (
                                <CheckCircle2 className="size-3 shrink-0 text-good-ink" aria-hidden />
                              ) : null}
                            </p>
                            <p
                              className={cn(
                                'mt-0.5 text-2xs',
                                lane.isComplete
                                  ? 'text-good-ink'
                                  : lane.overdue > 0
                                    ? 'text-critical-ink'
                                    : 'text-ink-muted',
                              )}
                            >
                              {lane.isComplete
                                ? 'complete'
                                : `${lane.pending} pending${lane.overdue > 0 ? `, ${lane.overdue} overdue` : ''}`}
                            </p>
                          </li>
                        );
                      })}
                    </ul>

                    {card.myOpenTasks > 0 ? (
                      <p className="text-2xs font-medium text-serious">
                        {countOf(card.myOpenTasks, 'task')} assigned to you
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        <MyTasks tasks={myTasks.data ?? []} loading={myTasks.isLoading} />
      )}

      <ChecklistDialog employeeId={detailId} onClose={() => setDetailId(null)} />
    </>
  );
}

function MyTasks({
  tasks,
  loading,
}: {
  tasks: {
    id: number; lane: keyof typeof LANE_ICON; title: string; description: string | null;
    dueDate: string | null; status: string; isOverdue: boolean; note: string | null;
    employee: { id: number; employeeVisibleId: string; fullName: string; initials: string; joiningDate: string; designation: { name: string } | null };
  }[];
  loading: boolean;
}) {
  if (loading) return <div className="h-64 skeleton rounded-card" />;

  if (tasks.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={CheckCircle2}
          tone="good"
          title="No onboarding tasks assigned to you"
          description="Tasks in the HR, IT or Manager lane route to whoever holds that role."
        />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tasks assigned to me</CardTitle>
      </CardHeader>
      <ul className="divide-y divide-line">
        {tasks.map((task) => (
          <li key={task.id} className="px-4 py-3">
            <TaskRow task={task} showEmployee />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TaskRow({
  task,
  showEmployee = false,
}: {
  task: {
    id: number; lane: keyof typeof LANE_ICON; title: string; description: string | null;
    dueDate: string | null; status: string; isOverdue?: boolean; note: string | null;
    canAction?: boolean;
    assignee?: { id: number; fullName: string } | null;
    employee?: { id: number; fullName: string; initials: string; designation?: { name: string } | null };
  };
  showEmployee?: boolean;
}) {
  const queryClient = useQueryClient();
  const Icon = LANE_ICON[task.lane];

  const update = useMutation({
    mutationFn: (status: string) => api.patch(`/onboarding/tasks/${task.id}`, { status }),
    onSuccess: () => {
      toast.success('Task updated');
      void queryClient.invalidateQueries({ queryKey: ['onboarding'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error) => {
      toast.error('Could not update the task', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <Icon
          className="mt-0.5 size-4 shrink-0"
          style={{ color: LANE_COLOR[task.lane] }}
          aria-hidden
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{task.title}</p>
          {task.description ? (
            <p className="mt-0.5 text-xs text-ink-secondary">{task.description}</p>
          ) : null}
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-ink-muted">
            <Badge tone="neutral">{task.lane.toLowerCase()}</Badge>
            {showEmployee && task.employee ? (
              <span>
                for{' '}
                <Link href={`/profile/${task.employee.id}`} className="text-brand hover:underline">
                  {task.employee.fullName}
                </Link>
              </span>
            ) : null}
            {task.assignee ? <span>· {task.assignee.fullName}</span> : null}
            {task.dueDate ? (
              <span className={task.isOverdue ? 'font-medium text-critical-ink' : ''}>
                · due {formatDate(task.dueDate, 'short')}
                {task.isOverdue ? ' (overdue)' : ''}
              </span>
            ) : null}
          </p>
          {task.note ? <p className="mt-1 text-2xs text-serious">{task.note}</p> : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <StatusBadge status={task.status} />
        {task.status !== 'DONE' && task.canAction !== false ? (
          <Button
            variant="success"
            size="sm"
            onClick={() => update.mutate('DONE')}
            loading={update.isPending}
          >
            <CheckCircle2 />
            Mark done
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ChecklistDialog({
  employeeId,
  onClose,
}: {
  employeeId: number | null;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['onboarding', 'checklist', employeeId],
    queryFn: () =>
      api.get<{
        employee: { id: number; fullName: string; joiningDate: string };
        lanes: {
          lane: keyof typeof LANE_ICON;
          label: string;
          tasks: {
            id: number; lane: keyof typeof LANE_ICON; title: string; description: string | null;
            dueDate: string | null; status: string; isOverdue: boolean; note: string | null;
            canAction: boolean; assignee: { id: number; fullName: string } | null;
          }[];
        }[];
      }>(`/onboarding/employees/${employeeId}`),
    enabled: employeeId !== null,
  });

  return (
    <Dialog open={employeeId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Onboarding checklist</DialogTitle>
          <DialogDescription>
            {data ? `${data.employee.fullName} · joining ${formatDate(data.employee.joiningDate)}` : ''}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {isLoading || !data ? (
            <div className="h-64 skeleton" />
          ) : (
            <div className="space-y-5">
              {data.lanes.map((lane) => {
                const Icon = LANE_ICON[lane.lane];
                const done = lane.tasks.filter((task) => task.status === 'DONE').length;
                return (
                  <div key={lane.lane}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                        <Icon
                          className="size-4 shrink-0"
                          style={{ color: LANE_COLOR[lane.lane] }}
                          aria-hidden
                        />
                        {lane.label} lane
                      </p>
                      <span className="text-xs text-ink-muted tabular">
                        {done} / {lane.tasks.length}
                      </span>
                    </div>
                    <ul className="divide-y divide-line rounded-lg border border-line">
                      {lane.tasks.map((task) => (
                        <li key={task.id} className="px-3 py-2.5">
                          <TaskRow task={task} />
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

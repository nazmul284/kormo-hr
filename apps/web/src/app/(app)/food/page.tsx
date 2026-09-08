'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Salad, UserPlus, Users, UtensilsCrossed } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { ColumnChart } from '@/components/charts/bars';
import { DataTable, FilterBar, type Column } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { StatTile } from '@/components/shared/stat-tile';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Select } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { SegmentedTabs } from '@/components/ui/tabs';
import { ApiError, api } from '@/lib/api';
import { MONTHS, MONTHS_SHORT, WEEKDAYS_SHORT, formatDate, formatMoney, yearOptions } from '@/lib/utils';

interface MealRow {
  sn: number;
  id: number;
  date: string;
  day: string;
  time: string | null;
  timeLabel: string;
  menu: { item: string; qty: string }[] | null;
  guestMealCost: number;
  selfCost: number;
  guestCount: number;
  status: string;
  cancelReason: string | null;
  canCancel: boolean;
}

export default function FoodPage() {
  const queryClient = useQueryClient();
  const now = new Date();
  const [tab, setTab] = useState<'monthly' | 'report'>('monthly');
  const [month, setMonth] = useState(now.getUTCMonth() + 1);
  const [year, setYear] = useState(now.getUTCFullYear());

  const programs = useQuery({
    queryKey: ['food', 'programs'],
    queryFn: () =>
      api.get<
        {
          id: number; name: string; selfCost: number; guestCost: number; cancelCutoff: string;
          isSubscribed: boolean;
          mySubscription: { id: number; isActive: boolean; subscribedAt: string } | null;
          weeklyMenu: { dayOfWeek: number; items: { item: string; qty: string }[] }[];
        }[]
      >('/food/programs'),
  });

  const program = programs.data?.[0];

  const monthly = useQuery({
    queryKey: ['food', 'monthly', program?.id, month, year],
    queryFn: () =>
      api.get<{
        program: { id: number; name: string; selfCost: number; guestCost: number } | null;
        message?: string;
        isSubscribed: boolean;
        meals: MealRow[];
        totals: {
          mealsTaken: number; mealsCancelled: number; mealsNotTaken: number;
          selfCost: number; guestCost: number; payable: number;
        };
        cancelCutoff: string;
      }>('/food/monthly', { programId: program?.id, month, year }),
    enabled: tab === 'monthly' && Boolean(program),
  });

  const report = useQuery({
    queryKey: ['food', 'report', program?.id, year],
    queryFn: () =>
      api.get<{
        program: { id: number; name: string } | null;
        year: number;
        months: {
          month: number; label: string; taken: number; cancelled: number; notTaken: number;
          guestMeals: number; selfCost: number; guestCost: number; total: number;
        }[];
        yearTotals: {
          taken: number; cancelled: number; notTaken: number; guestMeals: number;
          selfCost: number; guestCost: number; total: number;
        };
      }>('/food/report', { programId: program?.id, year }),
    enabled: tab === 'report' && Boolean(program),
  });

  const subscribe = useMutation({
    mutationFn: (subscribing: boolean) =>
      api.post(`/food/programs/${program!.id}/${subscribing ? 'subscribe' : 'unsubscribe'}`),
    onSuccess: (_result, subscribing) => {
      toast.success(subscribing ? 'Subscribed' : 'Unsubscribed', {
        description: subscribing
          ? 'Meals will be scheduled from the next working day.'
          : 'Future scheduled meals have been cancelled; this month stays billable.',
      });
      void queryClient.invalidateQueries({ queryKey: ['food'] });
    },
    onError: (error) => {
      toast.error('Could not update your subscription', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  const cancelMeal = useMutation({
    mutationFn: (id: number) => api.patch(`/food/meals/${id}/cancel`, {}),
    onSuccess: () => {
      toast.success('Meal cancelled', { description: 'You will not be charged for it.' });
      void queryClient.invalidateQueries({ queryKey: ['food'] });
    },
    onError: (error) => {
      toast.error('Could not cancel the meal', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  const columns: Column<MealRow>[] = [
    { key: 'sn', header: 'SN', align: 'right', width: '3.5rem', render: (row) => row.sn },
    { key: 'date', header: 'Date', render: (row) => <span className="whitespace-nowrap font-medium text-ink">{formatDate(row.date)}</span> },
    { key: 'day', header: 'Day', hideBelow: 'sm', render: (row) => row.day },
    {
      key: 'time',
      header: 'Time',
      render: (row) => (
        <span className={row.time ? 'tabular' : 'text-ink-muted'}>{row.timeLabel}</span>
      ),
    },
    {
      key: 'menu',
      header: 'Menu',
      hideBelow: 'md',
      render: (row) =>
        row.menu ? (
          <span className="line-clamp-2 max-w-md text-xs">
            {row.menu.map((entry) => `${entry.item} (${entry.qty})`).join(', ')}
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'guest',
      header: 'Guest meal cost',
      align: 'right',
      hideBelow: 'lg',
      render: (row) =>
        row.guestCount > 0 ? (
          <span>
            {formatMoney(row.guestMealCost)}
            <span className="ml-1 text-2xs text-ink-muted">({row.guestCount})</span>
          </span>
        ) : (
          <span className="text-ink-muted">—</span>
        ),
    },
    {
      key: 'self',
      header: 'Self cost',
      align: 'right',
      render: (row) =>
        row.selfCost > 0 ? formatMoney(row.selfCost) : <span className="text-ink-muted">—</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={row.status} />
          {row.cancelReason ? (
            <span className="max-w-[12rem] truncate text-2xs text-ink-muted">{row.cancelReason}</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      render: (row) =>
        row.canCancel ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => cancelMeal.mutate(row.id)}
            loading={cancelMeal.isPending && cancelMeal.variables === row.id}
          >
            <Ban />
            Cancel meal
          </Button>
        ) : null,
    },
  ];

  if (programs.isLoading) {
    return (
      <>
        <PageHeader title="Food management" breadcrumbs={[{ label: 'Workplace' }, { label: 'Food' }]} />
        <div className="h-64 skeleton rounded-card" />
      </>
    );
  }

  if (!program) {
    return (
      <>
        <PageHeader title="Food management" breadcrumbs={[{ label: 'Workplace' }, { label: 'Food' }]} />
        <Card>
          <EmptyState
            icon={Salad}
            title="No meal programme configured"
            description="Your company has not set up a subsidised meal programme."
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Food management"
        description={`${program.name} — the company subsidises your meal; guest meals are charged at the full rate. Cancel before ${program.cancelCutoff} or the kitchen has already counted you.`}
        breadcrumbs={[{ label: 'Workplace' }, { label: 'Food Management' }]}
        actions={
          <Button
            variant={program.isSubscribed ? 'secondary' : 'primary'}
            onClick={() => subscribe.mutate(!program.isSubscribed)}
            loading={subscribe.isPending}
          >
            {program.isSubscribed ? <Ban /> : <UserPlus />}
            {program.isSubscribed ? 'Unsubscribe' : 'Subscribe'}
          </Button>
        }
      />

      <FilterBar>
        <Field label="Programme">
          <Select value={program.id} disabled>
            <option value={program.id}>{program.name}</option>
          </Select>
        </Field>
        {tab === 'monthly' ? (
          <Field label="Month">
            <Select value={month} onChange={(event) => setMonth(Number(event.target.value))}>
              {MONTHS.map((label, index) => (
                <option key={label} value={index + 1}>{label}</option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label="Year">
          <Select value={year} onChange={(event) => setYear(Number(event.target.value))}>
            {yearOptions(2, 0).map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </Select>
        </Field>
        <div className="pb-0.5">
          <SegmentedTabs
            size="sm"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'monthly', label: 'Monthly' },
              { value: 'report', label: 'Report' },
            ]}
          />
        </div>
      </FilterBar>

      {!program.isSubscribed ? (
        <div className="flex items-start gap-2 rounded-card border border-warning/30 bg-warning-subtle px-4 py-3 text-xs text-ink-secondary">
          <Salad className="mt-0.5 size-4 shrink-0 text-serious" aria-hidden />
          <span>
            You are not subscribed. Past meals stay on record for billing, but no new ones will be
            scheduled until you subscribe again.
          </span>
        </div>
      ) : null}

      {tab === 'monthly' ? (
        <>
          {monthly.data?.totals ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile
                label="Meals taken"
                value={monthly.data.totals.mealsTaken}
                icon={UtensilsCrossed}
                tone="good"
              />
              <StatTile label="Cancelled" value={monthly.data.totals.mealsCancelled} icon={Ban} />
              <StatTile
                label="Not collected"
                value={monthly.data.totals.mealsNotTaken}
                hint="still charged"
                tone={monthly.data.totals.mealsNotTaken > 0 ? 'warning' : 'neutral'}
              />
              <StatTile
                label="Payable this month"
                value={formatMoney(monthly.data.totals.payable)}
                tone="brand"
              />
            </div>
          ) : null}

          <WeeklyMenu menu={program.weeklyMenu} />

          <DataTable
            columns={columns}
            rows={monthly.data?.meals ?? []}
            keyOf={(row) => row.id}
            loading={monthly.isLoading}
            emptyTitle="No meals for this month"
            emptyDescription={
              program.isSubscribed
                ? 'Meals are scheduled for working days once you are subscribed.'
                : 'Subscribe to the programme to have meals scheduled.'
            }
          />
        </>
      ) : (
        <ReportTab data={report.data} loading={report.isLoading} />
      )}
    </>
  );
}

function WeeklyMenu({ menu }: { menu: { dayOfWeek: number; items: { item: string; qty: string }[] }[] }) {
  if (menu.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>This week's rotating menu</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {menu.map((day) => (
            <div key={day.dayOfWeek} className="rounded-lg border border-line p-3">
              <p className="text-xs font-semibold text-ink">{WEEKDAYS_SHORT[day.dayOfWeek]}day</p>
              <ul className="mt-1.5 space-y-0.5">
                {day.items.map((entry) => (
                  <li key={entry.item} className="flex justify-between gap-2 text-2xs">
                    <span className="truncate text-ink-secondary">{entry.item}</span>
                    <span className="shrink-0 text-ink-muted">{entry.qty}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ReportTab({
  data,
  loading,
}: {
  data:
    | {
        year: number;
        months: {
          month: number; label: string; taken: number; cancelled: number; notTaken: number;
          guestMeals: number; selfCost: number; guestCost: number; total: number;
        }[];
        yearTotals: {
          taken: number; cancelled: number; notTaken: number; guestMeals: number;
          selfCost: number; guestCost: number; total: number;
        };
      }
    | undefined;
  loading: boolean;
}) {
  if (loading || !data) return <div className="h-64 skeleton rounded-card" />;

  const columns: Column<NonNullable<typeof data>['months'][number]>[] = [
    { key: 'month', header: 'Month', render: (row) => <span className="font-medium text-ink">{MONTHS[row.month - 1]}</span> },
    { key: 'taken', header: 'Taken', align: 'right', render: (row) => row.taken },
    { key: 'cancelled', header: 'Cancelled', align: 'right', hideBelow: 'sm', render: (row) => row.cancelled },
    { key: 'notTaken', header: 'Not collected', align: 'right', hideBelow: 'md', render: (row) => row.notTaken },
    { key: 'guests', header: 'Guest meals', align: 'right', hideBelow: 'lg', render: (row) => row.guestMeals },
    { key: 'self', header: 'Self cost', align: 'right', render: (row) => formatMoney(row.selfCost) },
    { key: 'guest', header: 'Guest cost', align: 'right', hideBelow: 'md', render: (row) => formatMoney(row.guestCost) },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      render: (row) => <span className="font-semibold text-ink">{formatMoney(row.total)}</span>,
    },
  ];

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Meals taken in the year" value={data.yearTotals.taken} icon={UtensilsCrossed} tone="good" />
        <StatTile label="Guest meals" value={data.yearTotals.guestMeals} icon={Users} />
        <StatTile label="Your contribution" value={formatMoney(data.yearTotals.selfCost)} />
        <StatTile label="Total billed" value={formatMoney(data.yearTotals.total)} tone="brand" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Meals taken by month</CardTitle>
          <p className="mt-0.5 text-xs text-ink-muted">Hover a column for the exact count</p>
        </CardHeader>
        <CardContent>
          <ColumnChart
            data={data.months.map((row) => ({
              key: String(row.month),
              label: MONTHS_SHORT[row.month - 1],
              value: row.taken,
            }))}
            height={150}
            formatValue={(value) => `${value} meal${value === 1 ? '' : 's'}`}
          />
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        rows={data.months.filter((row) => row.taken + row.cancelled + row.notTaken > 0)}
        keyOf={(row) => row.month}
        emptyTitle="No meal activity this year"
        footer={
          <tr>
            <td className="px-3 py-2.5">Year total</td>
            <td className="px-3 py-2.5 text-right tabular">{data.yearTotals.taken}</td>
            <td className="hidden px-3 py-2.5 text-right tabular sm:table-cell">{data.yearTotals.cancelled}</td>
            <td className="hidden px-3 py-2.5 text-right tabular md:table-cell">{data.yearTotals.notTaken}</td>
            <td className="hidden px-3 py-2.5 text-right tabular lg:table-cell">{data.yearTotals.guestMeals}</td>
            <td className="px-3 py-2.5 text-right tabular">{formatMoney(data.yearTotals.selfCost)}</td>
            <td className="hidden px-3 py-2.5 text-right tabular md:table-cell">{formatMoney(data.yearTotals.guestCost)}</td>
            <td className="px-3 py-2.5 text-right tabular">{formatMoney(data.yearTotals.total)}</td>
          </tr>
        }
      />
    </>
  );
}
